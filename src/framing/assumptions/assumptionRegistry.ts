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
 * V1 Framing Intelligence Spec §15.5 eligibility states.
 *
 * Only `eligible` creates an Assumption record.
 * `insufficient_resolution` sends work back to READ/resolution.
 * `forbidden` produces Unresolved/diagnostic when the value is required.
 */
export type AssumptionEligibilityState =
  | "eligible"
  | "not_eligible"
  | "insufficient_resolution"
  | "forbidden";

/**
 * V1 assumption rule IDs per Spec §19/§21.
 */
export const WALL_ASSUMPTION_RULE_IDS = {
  kingStudFallback: "WALL-ASSUME-005",
  windowSillMaterial: "WALL-ASSUME-006",
} as const;

export type WallAssumptionRuleId =
  (typeof WALL_ASSUMPTION_RULE_IDS)[keyof typeof WALL_ASSUMPTION_RULE_IDS];

/**
 * Wall classification context for eligibility evaluation per V1 Spec §21.
 *
 * Used to determine if WALL-ASSUME-005 is forbidden when the host wall is
 * identified as engineered/tall/special AND structural jamb design is implicated.
 *
 * Per ticket S3-DEC-1: consume existing identification only, do not invent
 * a tall-wall classifier.
 */
export type WallClassificationContext = {
  /**
   * True when existing evidence has identified the host wall as
   * engineered, tall, or special. Unknown wall class is NOT identified-special.
   */
  isIdentifiedSpecial: boolean;
  /**
   * True when structural jamb design is implicated (e.g., the opening
   * requires design-controlled king/full-height support).
   */
  structuralJambImplicated: boolean;
};

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
  /** V1 assumption rule ID (e.g., WALL-ASSUME-005). Null for non-wall assumptions. */
  ruleId: WallAssumptionRuleId | null;
  /** Fixed scalar, or deterministic derivation with no free choice. */
  resolveAssumedValue: (context: AssumptionRegistryContext) => string | number | boolean;
  createAssumption: (context: AssumptionRegistryContext) => Assumption;
  /**
   * Evaluate eligibility per V1 Spec §15.5.
   *
   * Returns the eligibility state which determines whether an assumption
   * record should be created or an alternative outcome applies.
   */
  evaluateEligibility: (context: AssumptionRegistryContext) => AssumptionEligibilityState;
};

export type AssumptionRegistryContext = {
  objectId: ObjectId;
  /** Optional inputs required by specific registry derivations (e.g. wall stud size). */
  derivationInputs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  /**
   * Wall classification context for WALL-ASSUME-005 eligibility evaluation.
   * When absent, rule A defaults to eligible (unknown class does not
   * force insufficient_resolution or forbidden).
   */
  wallClassification?: WallClassificationContext;
};

function registryKey(quantityKey: string, propertyPath: string): string {
  return `${quantityKey}\0${propertyPath}`;
}

/**
 * WALL-ASSUME-005 eligibility evaluation per V1 Spec §15.5 / §21.
 *
 * Positive-disqualifier rule (A):
 * - 005 may apply to an ordinary eligible opening with no stronger
 *   full-height/header rule UNLESS existing evidence has identified
 *   the host as engineered/tall/special AND structural jamb design
 *   is implicated — then FORBIDDEN.
 * - Unknown wall class does NOT by itself make 005 insufficient_resolution
 *   or forbidden.
 * - Do not require affirmative proof the wall is ordinary.
 *
 * @see docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md §15.5, §21
 */
function evaluateKingStudEligibility(
  context: AssumptionRegistryContext,
): AssumptionEligibilityState {
  const wallClass = context.wallClassification;

  if (!wallClass) {
    return "eligible";
  }

  if (wallClass.isIdentifiedSpecial && wallClass.structuralJambImplicated) {
    return "forbidden";
  }

  return "eligible";
}

/**
 * WALL-ASSUME-006 eligibility evaluation per V1 Spec §15.5.
 *
 * Window sill size follows resolved wall stud size. Eligible when
 * wallStudSize derivation input is available.
 */
function evaluateSillSizeEligibility(
  context: AssumptionRegistryContext,
): AssumptionEligibilityState {
  const studSize = context.derivationInputs?.wallStudSize;
  if (typeof studSize === "string" && studSize.trim().length > 0) {
    return "eligible";
  }
  return "not_eligible";
}

/**
 * Cripple layout eligibility — always eligible when preconditions
 * are met in the calculator.
 */
function evaluateCrippleLayoutEligibility(): AssumptionEligibilityState {
  return "eligible";
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
    ruleId: WALL_ASSUMPTION_RULE_IDS.kingStudFallback,
    resolveAssumedValue: () => KING_STUD_COUNT_DEFAULT,
    evaluateEligibility: evaluateKingStudEligibility,
    createAssumption: (context) =>
      createOpeningKingStudCountAssumption(context.objectId),
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.roughSill,
    propertyPath: "roughSillSize",
    brainCitation: "knowledge/framing/13-opening-wall-framing-calculations.md",
    ruleId: WALL_ASSUMPTION_RULE_IDS.windowSillMaterial,
    resolveAssumedValue: (context) => {
      const studSize = context.derivationInputs?.wallStudSize;
      if (typeof studSize !== "string" || studSize.trim().length === 0) {
        throw new Error(
          "roughSillSize registry entry requires derivationInputs.wallStudSize.",
        );
      }
      return studSize;
    },
    evaluateEligibility: evaluateSillSizeEligibility,
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
    ruleId: null,
    resolveAssumedValue: () => "layout-continuation-from-rough-width",
    evaluateEligibility: evaluateCrippleLayoutEligibility,
    createAssumption: (context) =>
      createOpeningCrippleLayoutAssumption(context.objectId, [
        OPENING_QUANTITY_KEYS.cripplesAbove,
      ]),
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.cripplesBelow,
    propertyPath: "crippleStudLayout",
    brainCitation: "knowledge/framing/13-opening-wall-framing-calculations.md",
    ruleId: null,
    resolveAssumedValue: () => "layout-continuation-from-rough-width",
    evaluateEligibility: evaluateCrippleLayoutEligibility,
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

/**
 * Consultation result per V1 Spec §15.5 eligibility states.
 *
 * - `assumed`: eligible, Assumption record created
 * - `not-registered`: no registry entry exists for this quantityKey/propertyPath
 * - `not-eligible`: preconditions not met (e.g., missing derivation inputs)
 * - `insufficient-resolution`: needs more resolution work before determination
 * - `forbidden`: assumption is disallowed for this context (produces Unresolved)
 */
export type AssumptionConsultationResult =
  | {
      outcome: "assumed";
      entry: AssumptionRegistryEntry;
      assumption: Assumption;
      assumedValue: string | number | boolean;
      eligibilityState: "eligible";
    }
  | { outcome: "not-registered" }
  | {
      outcome: "not-eligible";
      entry: AssumptionRegistryEntry;
      eligibilityState: "not_eligible";
    }
  | {
      outcome: "insufficient-resolution";
      entry: AssumptionRegistryEntry;
      eligibilityState: "insufficient_resolution";
    }
  | {
      outcome: "forbidden";
      entry: AssumptionRegistryEntry;
      eligibilityState: "forbidden";
    };

/**
 * Deterministic consult-before-block: registry lookup only.
 *
 * Evaluates eligibility per V1 Spec §15.5 and returns the appropriate
 * consultation result with eligibility state.
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

  const eligibilityState = entry.evaluateEligibility(input.context);

  switch (eligibilityState) {
    case "eligible": {
      const assumedValue = entry.resolveAssumedValue(input.context);
      const assumption = entry.createAssumption(input.context);
      return { outcome: "assumed", entry, assumption, assumedValue, eligibilityState };
    }
    case "not_eligible":
      return { outcome: "not-eligible", entry, eligibilityState };
    case "insufficient_resolution":
      return { outcome: "insufficient-resolution", entry, eligibilityState };
    case "forbidden":
      return { outcome: "forbidden", entry, eligibilityState };
  }
}
