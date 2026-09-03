import type { Assumption } from "../../core/schemas/assumption.schema.js";
import type { ObjectId } from "../../core/schemas/identity.schema.js";
import {
  createOpeningCrippleLayoutAssumption,
} from "../calculate/createOpeningCrippleLayoutAssumption.js";
import {
  createOpeningKingStudCountAssumption,
  KING_STUD_COUNT_DEFAULT,
} from "../calculate/createOpeningKingStudCountAssumption.js";
import { createOpeningRoughSillSizeAssumption } from "../calculate/createOpeningRoughSillSizeAssumption.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

/**
 * Explicit deterministic assumption registry entry.
 *
 * Lookup is exact on (quantityKey, propertyPath). Absence means do not assume.
 * Values and derivations are fixed — never inferred or LLM-authorized.
 */
export type AssumptionRegistryEntry = {
  quantityKey: string;
  propertyPath: string;
  brainCitation: string;
  /** Fixed scalar, or deterministic derivation with no free choice. */
  resolveAssumedValue: (context: AssumptionRegistryContext) => string | number | boolean;
  createAssumption: (context: AssumptionRegistryContext) => Assumption;
  /**
   * Brain-stated eligibility only. When false, do not invent an alternate default.
   */
  isEligible: (context: AssumptionRegistryContext) => boolean;
};

export type AssumptionRegistryContext = {
  objectId: ObjectId;
  /** Optional inputs required by specific registry derivations (e.g. wall stud size). */
  derivationInputs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
};

function registryKey(quantityKey: string, propertyPath: string): string {
  return `${quantityKey}\0${propertyPath}`;
}

/**
 * Closed registry. Only Construction Brain–authorized opening factories in M1.
 * No entries for layout length, joist/rafter spacing, engineered sizes, jacks,
 * truss design, connectors, or SF→framing quantity.
 */
const REGISTRY_ENTRIES: readonly AssumptionRegistryEntry[] = [
  {
    quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
    propertyPath: "kingStudCount",
    brainCitation: "knowledge/framing/13-opening-wall-framing-calculations.md",
    resolveAssumedValue: () => KING_STUD_COUNT_DEFAULT,
    isEligible: () => true,
    createAssumption: (context) =>
      createOpeningKingStudCountAssumption(context.objectId),
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.roughSill,
    propertyPath: "roughSillSize",
    brainCitation: "knowledge/framing/13-opening-wall-framing-calculations.md",
    resolveAssumedValue: (context) => {
      const studSize = context.derivationInputs?.wallStudSize;
      if (typeof studSize !== "string" || studSize.trim().length === 0) {
        throw new Error(
          "roughSillSize registry entry requires derivationInputs.wallStudSize.",
        );
      }
      return studSize;
    },
    isEligible: (context) => {
      const studSize = context.derivationInputs?.wallStudSize;
      return typeof studSize === "string" && studSize.trim().length > 0;
    },
    createAssumption: (context) => {
      const studSize = context.derivationInputs?.wallStudSize;
      if (typeof studSize !== "string" || studSize.trim().length === 0) {
        throw new Error(
          "roughSillSize registry entry requires derivationInputs.wallStudSize.",
        );
      }
      return createOpeningRoughSillSizeAssumption(
        context.objectId,
        studSize,
      );
    },
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.cripplesAbove,
    propertyPath: "crippleStudLayout",
    brainCitation: "knowledge/framing/13-opening-wall-framing-calculations.md",
    resolveAssumedValue: () => "layout-continuation-from-rough-width",
    isEligible: () => true,
    createAssumption: (context) =>
      createOpeningCrippleLayoutAssumption(context.objectId, [
        OPENING_QUANTITY_KEYS.cripplesAbove,
      ]),
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.cripplesBelow,
    propertyPath: "crippleStudLayout",
    brainCitation: "knowledge/framing/13-opening-wall-framing-calculations.md",
    resolveAssumedValue: () => "layout-continuation-from-rough-width",
    isEligible: () => true,
    createAssumption: (context) =>
      createOpeningCrippleLayoutAssumption(context.objectId, [
        OPENING_QUANTITY_KEYS.cripplesBelow,
      ]),
  },
];

const REGISTRY_BY_KEY = new Map(
  REGISTRY_ENTRIES.map((entry) => [
    registryKey(entry.quantityKey, entry.propertyPath),
    entry,
  ]),
);

/**
 * Exact lookup. Never searches, never invents a “reasonable” default.
 * Claude / LLM callers must not authorize entries — only this table does.
 */
export function lookupAssumptionRegistryEntry(
  quantityKey: string,
  propertyPath: string,
): AssumptionRegistryEntry | undefined {
  return REGISTRY_BY_KEY.get(registryKey(quantityKey, propertyPath));
}

export function listAssumptionRegistryEntries(): readonly AssumptionRegistryEntry[] {
  return REGISTRY_ENTRIES;
}

export type AssumptionConsultationResult =
  | { outcome: "assumed"; entry: AssumptionRegistryEntry; assumption: Assumption; assumedValue: string | number | boolean }
  | { outcome: "not-registered" }
  | { outcome: "ineligible"; entry: AssumptionRegistryEntry };

/**
 * Deterministic consult-before-block: registry lookup only.
 */
export function consultAssumptionRegistry(input: {
  quantityKey: string;
  propertyPath: string;
  context: AssumptionRegistryContext;
}): AssumptionConsultationResult {
  const entry = lookupAssumptionRegistryEntry(
    input.quantityKey,
    input.propertyPath,
  );
  if (!entry) {
    return { outcome: "not-registered" };
  }
  if (!entry.isEligible(input.context)) {
    return { outcome: "ineligible", entry };
  }
  const assumedValue = entry.resolveAssumedValue(input.context);
  const assumption = entry.createAssumption(input.context);
  return { outcome: "assumed", entry, assumption, assumedValue };
}
