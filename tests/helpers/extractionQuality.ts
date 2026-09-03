import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type {
  ExpectedSemanticFact,
  ExtractionFactClass,
  ForbiddenInvention,
} from "../fixtures/realisticResidentialFramingPlan.js";
import { isIJoistType } from "../../src/framing/resolve/floorFramingPropertyPaths.js";
import { isStickCommonRafterFramingType } from "../../src/framing/resolve/roofFramingPropertyPaths.js";
import { isWoodStudWallType } from "../../src/framing/resolve/wallFramingPropertyPaths.js";
import { tryNormalizeProductionCandidate } from "./productionCandidateNormalize.js";

/**
 * Properties whose expected facts must match production enum/canonical
 * acceptance. Free-text fields (sizes, directions, names) use looser scoring.
 */
const PRODUCTION_CANONICAL_PROPERTY_PATHS = new Set([
  "application",
  "constructionPhase",
  "location",
  "bearingStatus",
  "category",
]);

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Compass / span direction aliases seen on plans vs expanded tokens. */
function normalizeDirectionToken(value: string): string {
  const compact = normalizeKey(value);
  const aliases: Record<string, string> = {
    ns: "northsouth",
    sn: "southnorth",
    ew: "eastwest",
    we: "westeast",
    northsouth: "northsouth",
    southnorth: "southnorth",
    eastwest: "eastwest",
    westeast: "westeast",
  };
  return aliases[compact] ?? compact;
}

function subjectKeysMatch(
  actual: string,
  preferred: string,
  alternates: readonly string[] = [],
): boolean {
  const actualNorm = normalizeKey(actual);
  return [preferred, ...alternates].some(
    (candidate) => normalizeKey(candidate) === actualNorm,
  );
}

/**
 * When the expected value is a production construction class, require the
 * actual Evidence value to satisfy the same production classifier. Never
 * broader than production eligibility.
 */
function productionClassEquivalent(
  propertyPath: string,
  expected: string,
  actual: string,
): boolean | undefined {
  if (propertyPath === "wallType") {
    if (isWoodStudWallType(expected)) {
      return isWoodStudWallType(actual);
    }
    return undefined;
  }

  if (propertyPath === "assembly.joistType") {
    if (isIJoistType(expected)) {
      return isIJoistType(actual);
    }
    return undefined;
  }

  if (propertyPath === "assembly.framingType") {
    if (isStickCommonRafterFramingType(expected)) {
      return isStickCommonRafterFramingType(actual);
    }
    return undefined;
  }

  return undefined;
}

/**
 * Equivalence for expected-fact scoring.
 *
 * Canonical enum properties use the same production normalizer acceptance.
 * Class-bearing free-text fields (wallType wood-stud, joistType I-joist,
 * framingType stick/rafter) use shared production classifiers.
 * Other free-text / scalars use exact normalized-key or direction-alias
 * equality (no loose substring containment).
 */
export function valuesSemanticallyEqual(
  expected: string | number | boolean,
  actual: string | number | boolean | null,
  propertyPath?: string,
): boolean {
  if (actual === null || actual === undefined) {
    return false;
  }

  if (
    propertyPath !== undefined &&
    PRODUCTION_CANONICAL_PROPERTY_PATHS.has(propertyPath)
  ) {
    const expectedCanonical = tryNormalizeProductionCandidate(
      propertyPath,
      expected as Evidence["candidateValue"],
    );
    if (expectedCanonical !== undefined) {
      const actualCanonical = tryNormalizeProductionCandidate(
        propertyPath,
        actual as Evidence["candidateValue"],
      );
      return actualCanonical === expectedCanonical;
    }
  }

  if (
    propertyPath !== undefined &&
    typeof expected === "string" &&
    typeof actual === "string"
  ) {
    const classMatch = productionClassEquivalent(
      propertyPath,
      expected,
      actual,
    );
    if (classMatch !== undefined) {
      return classMatch;
    }
  }

  if (typeof expected === "number") {
    if (typeof actual === "number") {
      return Math.abs(actual - expected) < 0.02;
    }
    const parsed = Number.parseFloat(String(actual).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) && Math.abs(parsed - expected) < 0.02;
  }

  if (typeof expected === "boolean") {
    return actual === expected;
  }

  const expectedNorm = normalizeKey(String(expected));
  const actualNorm = normalizeKey(String(actual));
  if (actualNorm === expectedNorm) {
    return true;
  }

  return (
    normalizeDirectionToken(String(expected)) ===
    normalizeDirectionToken(String(actual))
  );
}

export interface FactScore {
  factId: string;
  classification: ExtractionFactClass;
  matchedSubjectKey?: string;
  matchedValues?: Array<string | number | boolean | null>;
  detail?: string;
}

function recordsForFact(
  evidence: readonly Evidence[],
  fact: ExpectedSemanticFact,
): Evidence[] {
  return evidence.filter(
    (record) =>
      record.propertyPath === fact.propertyPath &&
      subjectKeysMatch(
        record.subjectKey,
        fact.subjectKey,
        fact.alternateSubjectKeys,
      ) &&
      (fact.subjectKind === undefined || record.subjectKind === fact.subjectKind),
  );
}

/**
 * Classify one expected fact against Evidence (semantic, not Evidence-id based).
 */
export function classifyExpectedFact(
  evidence: readonly Evidence[],
  fact: ExpectedSemanticFact,
): FactScore {
  const matches = recordsForFact(evidence, fact);
  if (matches.length === 0) {
    const misattributed = evidence.filter(
      (record) =>
        record.propertyPath === fact.propertyPath &&
        valuesSemanticallyEqual(
          fact.expectedValue,
          record.candidateValue,
          fact.propertyPath,
        ) &&
        !subjectKeysMatch(
          record.subjectKey,
          fact.subjectKey,
          fact.alternateSubjectKeys,
        ),
    );
    if (misattributed.length > 0) {
      return {
        factId: fact.id,
        classification: "MISATTRIBUTED",
        matchedSubjectKey: misattributed[0]?.subjectKey,
        matchedValues: misattributed.map((record) => record.candidateValue),
        detail: `Found ${fact.propertyPath}=${String(fact.expectedValue)} on subjectKey ${misattributed[0]?.subjectKey}`,
      };
    }

    return {
      factId: fact.id,
      classification: "MISSING",
      detail: `No Evidence for ${fact.subjectKey}.${fact.propertyPath}`,
    };
  }

  const values = matches.map((record) => record.candidateValue);
  const distinct = [
    ...new Set(
      values.map((value) =>
        typeof value === "number" ? value : normalizeKey(String(value ?? "")),
      ),
    ),
  ];

  if (distinct.length > 1) {
    const hasCorrect = matches.some((record) =>
      valuesSemanticallyEqual(
        fact.expectedValue,
        record.candidateValue,
        fact.propertyPath,
      ),
    );
    return {
      factId: fact.id,
      classification: "CONFLICTED",
      matchedSubjectKey: matches[0]?.subjectKey,
      matchedValues: values,
      detail: hasCorrect
        ? "Correct value present among conflicting candidates"
        : "Conflicting candidates without expected value",
    };
  }

  if (
    valuesSemanticallyEqual(fact.expectedValue, values[0]!, fact.propertyPath)
  ) {
    return {
      factId: fact.id,
      classification: "CORRECT",
      matchedSubjectKey: matches[0]?.subjectKey,
      matchedValues: values,
    };
  }

  return {
    factId: fact.id,
    classification: "UNEXPECTED",
    matchedSubjectKey: matches[0]?.subjectKey,
    matchedValues: values,
    detail: `Expected ${String(fact.expectedValue)}, got ${String(values[0])}`,
  };
}

export function scoreExpectedFacts(
  evidence: readonly Evidence[],
  facts: readonly ExpectedSemanticFact[],
): FactScore[] {
  return facts.map((fact) => classifyExpectedFact(evidence, fact));
}

export function findForbiddenInventions(
  evidence: readonly Evidence[],
  forbidden: readonly ForbiddenInvention[],
): Array<{ inventionId: string; evidenceId: string; detail: string }> {
  const hits: Array<{ inventionId: string; evidenceId: string; detail: string }> =
    [];

  for (const rule of forbidden) {
    for (const record of evidence) {
      if (
        rule.matches({
          subjectKey: record.subjectKey,
          propertyPath: record.propertyPath,
          candidateValue: record.candidateValue,
        })
      ) {
        hits.push({
          inventionId: rule.id,
          evidenceId: record.id,
          detail: `${rule.description}: ${record.subjectKey}.${record.propertyPath}=${String(record.candidateValue)}`,
        });
      }
    }
  }

  return hits;
}

export function summarizeFactScores(scores: readonly FactScore[]): Record<
  ExtractionFactClass,
  number
> {
  const summary: Record<ExtractionFactClass, number> = {
    CORRECT: 0,
    MISSING: 0,
    CONFLICTED: 0,
    UNEXPECTED: 0,
    MISATTRIBUTED: 0,
  };
  for (const score of scores) {
    summary[score.classification] += 1;
  }
  return summary;
}
