import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { FramingExtractionIntent } from "../../pdf/deriveRoleAssignmentsFromPageClassification.js";
import { requiredInputPathsForIntents } from "../read/calculatorRequiredInputs.js";

/**
 * Ledger purpose for the bounded same-bundle missing-required-input pass.
 * Counted like `extract:{intent}` — not a silent extra Claude call.
 */
export const REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE =
  "extract:required-input-followup" as const;

const RECOVERY_SYSTEMS = ["openings", "structural-members"] as const;

type RecoverySystem = (typeof RECOVERY_SYSTEMS)[number];

const SUBJECT_KIND_BY_SYSTEM: Record<
  RecoverySystem,
  "opening" | "structural-member"
> = {
  openings: "opening",
  "structural-members": "structural-member",
};

/** Category / openingType alone is an identity stub, not calculator completeness. */
const IDENTITY_ONLY_PATHS = new Set(["category", "openingType"]);

export type MissingRequiredInputFollowUp = {
  systems: FramingExtractionIntent[];
  missingPropertyPaths: string[];
};

export function isIdentityOnlyPropertyPath(propertyPath: string): boolean {
  return IDENTITY_ONLY_PATHS.has(propertyPath);
}

function subjectIdentity(record: Pick<Evidence, "subjectKind" | "subjectKey">): string {
  return `${record.subjectKind}:${record.subjectKey}`;
}

/**
 * Same-bundle follow-up may restub category/openingType for keys the primary
 * pass already identified. Drop those identity records; keep completeness.
 */
export function dropIdentityRestubsForKnownSubjects(input: {
  followUpEvidence: readonly Evidence[];
  primaryEvidence: readonly Evidence[];
}): Evidence[] {
  const knownKeys = new Set(input.primaryEvidence.map(subjectIdentity));
  return input.followUpEvidence.filter((record) => {
    if (!isIdentityOnlyPropertyPath(record.propertyPath)) {
      return true;
    }
    return !knownKeys.has(subjectIdentity(record));
  });
}

function propertyPathAliases(propertyPath: string): readonly string[] {
  if (propertyPath === "openingType") {
    return ["openingType", "category"];
  }
  if (propertyPath === "category") {
    return ["category", "openingType"];
  }
  return [propertyPath];
}

function recordFillsPath(record: Evidence, requiredPath: string): boolean {
  if (record.candidateValue === null || record.candidateValue === undefined) {
    return false;
  }
  return propertyPathAliases(requiredPath).includes(record.propertyPath);
}

/**
 * Same-bundle `extract:required-input-followup` cannot add calculator
 * completeness (parent, quantity, rough dims, size, length) when the primary
 * already identified openings / structural-members with only identity stubs
 * (`category` / `openingType`) or no completeness records. Completeness-only
 * re-read of the same pages does not fill those paths — frozen W4-C: 4
 * follow-up ledger rows, 0 kept completeness Evidence.
 *
 * Skip the extract and its schema repair. Do not invoke ledger purpose
 * `extract:required-input-followup`.
 */
export function shouldSkipSameBundleRequiredInputFollowUp(input: {
  evidence: readonly Evidence[];
  identifiedSystems: readonly string[];
}): boolean {
  return detectMissingRequiredInputsForIdentifiedSystems(input) != null;
}

/**
 * After a region extract, true when identified openings / structural-members
 * have no calculator-required completeness fields (parent, quantity, rough
 * dims, size, length). Category-only stubs count as empty.
 */
export function detectMissingRequiredInputsForIdentifiedSystems(input: {
  evidence: readonly Evidence[];
  identifiedSystems: readonly string[];
}): MissingRequiredInputFollowUp | null {
  const identified = new Set(input.identifiedSystems);
  const missingSystems: FramingExtractionIntent[] = [];
  const missingPropertyPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const system of RECOVERY_SYSTEMS) {
    if (!identified.has(system)) {
      continue;
    }
    const subjectKind = SUBJECT_KIND_BY_SYSTEM[system];
    const requiredPaths = requiredInputPathsForIntents([system]);
    const completenessPaths = requiredPaths.filter(
      (path) => !IDENTITY_ONLY_PATHS.has(path),
    );
    const records = input.evidence.filter(
      (record) => record.subjectKind === subjectKind,
    );
    const hasCompleteness = records.some((record) =>
      completenessPaths.some((path) => recordFillsPath(record, path)),
    );
    if (hasCompleteness) {
      continue;
    }
    missingSystems.push(system);
    for (const path of completenessPaths) {
      if (seenPaths.has(path)) {
        continue;
      }
      if (records.some((record) => recordFillsPath(record, path))) {
        continue;
      }
      seenPaths.add(path);
      missingPropertyPaths.push(path);
    }
  }

  if (missingSystems.length === 0) {
    return null;
  }
  return { systems: missingSystems, missingPropertyPaths };
}
