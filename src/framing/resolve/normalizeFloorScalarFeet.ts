import { parseImperialLengthToFeet } from "../geometry/parseImperialLengthToFeet.js";

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Splits plan strings that list two or more imperial length alternatives,
 * e.g. `40'-0" / 50'-8"`. Only splits on `/` surrounded by optional spaces
 * when both sides look like dimension fragments.
 */
export function splitImperialLengthAlternatives(rawText: string): string[] {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const parts = trimmed
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return [trimmed];
  }

  const dimensionLike = /['"]|\d\s*'\s*-?\s*\d/;
  if (parts.every((part) => dimensionLike.test(part))) {
    return parts;
  }

  return [trimmed];
}

export type FloorScalarFeetEvaluation =
  | { kind: "resolved"; feet: number }
  | { kind: "multi-value"; parts: string[] }
  | { kind: "invalid" };

/**
 * Evaluates one Floor scalar feet candidate without inventing authority.
 * Multi-value imperial strings fail closed as ambiguous.
 */
export function evaluateFloorScalarFeetCandidate(
  candidateValue: unknown,
): FloorScalarFeetEvaluation {
  if (isPositiveNumber(candidateValue)) {
    return { kind: "resolved", feet: candidateValue };
  }

  if (typeof candidateValue !== "string") {
    return { kind: "invalid" };
  }

  const trimmed = candidateValue.trim();
  if (trimmed.length === 0) {
    return { kind: "invalid" };
  }

  const alternatives = splitImperialLengthAlternatives(trimmed);
  if (alternatives.length > 1) {
    const parsedFeet = alternatives
      .map((part) => parseImperialLengthToFeet(part))
      .filter((result) => result.status === "ok")
      .map((result) => result.feet);

    const distinct = [...new Set(parsedFeet.map((feet) => feet.toFixed(6)))];
    if (distinct.length >= 2) {
      return { kind: "multi-value", parts: alternatives };
    }

    if (parsedFeet.length === 1) {
      return { kind: "resolved", feet: parsedFeet[0]! };
    }

    return { kind: "multi-value", parts: alternatives };
  }

  const parsed = parseImperialLengthToFeet(trimmed);
  if (parsed.status === "ok") {
    return { kind: "resolved", feet: parsed.feet };
  }

  return { kind: "invalid" };
}

/**
 * Normalizes a single unambiguous Floor scalar feet value for property paths.
 */
export function normalizeFloorScalarFeetCandidate(
  candidateValue: unknown,
): number | undefined {
  const evaluation = evaluateFloorScalarFeetCandidate(candidateValue);
  return evaluation.kind === "resolved" ? evaluation.feet : undefined;
}
