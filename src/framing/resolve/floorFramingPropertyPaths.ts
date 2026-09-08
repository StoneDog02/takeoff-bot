import type { Evidence } from "../../core/schemas/evidence.schema.js";
import {
  floorConstructionPhaseSchema,
  type FloorConstructionPhase,
} from "../schemas/floor-framing.schema.js";
import { isValidSpanDirectionValue } from "./floorLayoutAuthority.js";
import { normalizeFloorScalarFeetCandidate } from "./normalizeFloorScalarFeet.js";

export const FLOOR_SYSTEM_PROPERTY_PATHS = [
  "name",
  "level",
  "constructionPhase",
  "assembly.joistType",
  "assembly.joistSize",
  "assembly.joistSpacingInches",
  "assembly.rimBoard",
] as const;

export const FLOOR_AREA_PROPERTY_PATHS = [
  "layout",
  "framingDirection",
  "spanDirection",
  "joistLayoutLengthFeet",
  "joistMemberLengthFeet",
  "areaSquareFeet",
] as const;

export const FLOOR_AREA_RELATIONSHIP_PROPERTY_PATHS = [
  "parentSystemTag",
  "boundingWallTag",
  "openingTag",
  "structuralMemberTag",
] as const;

export type FloorSystemPropertyPath =
  (typeof FLOOR_SYSTEM_PROPERTY_PATHS)[number];

export type FloorAreaPropertyPath = (typeof FLOOR_AREA_PROPERTY_PATHS)[number];

export type FloorAreaRelationshipPropertyPath =
  (typeof FLOOR_AREA_RELATIONSHIP_PROPERTY_PATHS)[number];

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

const JOIST_SIZE_PLAN_POINTER_PATTERN =
  /\bsee\s+plans?\b|\brefer(?:red)?\s+to\s+(?:the\s+)?plans?\b|\bper\s+plans?\b|\bas\s+noted(?:\s+on\s+plans?)?\b|\bsee\s+(?:schedule|detail|notes?)\b/i;

const JOIST_SIZE_DIMENSIONAL_PATTERN =
  /(\d+\.\d+\/\d|\d+-\d+\/\d|\d+\s+\d+\/\d|\d+\s*[x×]\s*\d+)/i;

/**
 * True when a joist-size candidate is a plan pointer/deferral, not a dimensional size.
 * A string that also contains a dimensional token is treated as a size, not a pointer.
 */
export function isJoistSizePlanPointerValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (!JOIST_SIZE_PLAN_POINTER_PATTERN.test(trimmed)) {
    return false;
  }

  return !JOIST_SIZE_DIMENSIONAL_PATTERN.test(trimmed);
}

/**
 * OCR-ish mixed fractions such as `11.7/8"` are the same construction size as `11-7/8`.
 * Does not rewrite already-established space or hyphen forms, and does not invent size
 * from a TJI series number.
 */
export function normalizeOcrJoistSizeCandidate(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d+)\.(\d+\/\d)\s*"?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  return `${match[1]}-${match[2]}`;
}

/**
 * I-joist material class for floor joist type strings.
 * Matches the I-joist branch of simple-area joist LF eligibility.
 */
export function isIJoistType(joistType: string): boolean {
  const token = normalizeToken(joistType);
  if (
    token.includes("truss") ||
    token.includes("metal") ||
    token.includes("steel")
  ) {
    return false;
  }

  return (
    token === "i-joist" ||
    token === "ijoist" ||
    token.includes("i-joist") ||
    /\btji\b/.test(token) ||
    token.includes("tji-")
  );
}

export function isFloorSystemPropertyPath(
  propertyPath: string,
): propertyPath is FloorSystemPropertyPath {
  return (FLOOR_SYSTEM_PROPERTY_PATHS as readonly string[]).includes(propertyPath);
}

export function isFloorAreaPropertyPath(
  propertyPath: string,
): propertyPath is FloorAreaPropertyPath {
  return (FLOOR_AREA_PROPERTY_PATHS as readonly string[]).includes(propertyPath);
}

export function isFloorAreaRelationshipPropertyPath(
  propertyPath: string,
): propertyPath is FloorAreaRelationshipPropertyPath {
  return (FLOOR_AREA_RELATIONSHIP_PROPERTY_PATHS as readonly string[]).includes(
    propertyPath,
  );
}

export function isFloorFramingPropertyPath(propertyPath: string): boolean {
  return (
    isFloorSystemPropertyPath(propertyPath) ||
    isFloorAreaPropertyPath(propertyPath) ||
    isFloorAreaRelationshipPropertyPath(propertyPath)
  );
}

/** Scalar Floor properties eligible for User Decision resolution (not relationship tags). */
export function isFloorFramingUserDecisionPropertyPath(
  propertyPath: string,
): boolean {
  return (
    isFloorSystemPropertyPath(propertyPath) || isFloorAreaPropertyPath(propertyPath)
  );
}

export function normalizeFloorSystemCandidate(
  propertyPath: FloorSystemPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  switch (propertyPath) {
    case "constructionPhase": {
      if (typeof candidateValue !== "string") {
        return undefined;
      }

      const parsed = floorConstructionPhaseSchema.safeParse(
        normalizeToken(candidateValue),
      );
      return parsed.success ? parsed.data : undefined;
    }
    case "name":
    case "level":
    case "assembly.joistType":
    case "assembly.rimBoard":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
    case "assembly.joistSize": {
      if (typeof candidateValue !== "string" || candidateValue.trim().length === 0) {
        return undefined;
      }

      if (isJoistSizePlanPointerValue(candidateValue)) {
        return undefined;
      }

      return normalizeOcrJoistSizeCandidate(candidateValue);
    }
    case "assembly.joistSpacingInches":
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
  }
}

export function normalizeFloorAreaCandidate(
  propertyPath: FloorAreaPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  switch (propertyPath) {
    case "joistLayoutLengthFeet":
    case "joistMemberLengthFeet":
    case "areaSquareFeet":
      return normalizeFloorScalarFeetCandidate(candidateValue);
    case "layout":
    case "framingDirection":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
    case "spanDirection": {
      if (typeof candidateValue !== "string") {
        return undefined;
      }

      const trimmed = candidateValue.trim();
      if (!isValidSpanDirectionValue(trimmed)) {
        return undefined;
      }

      return trimmed;
    }
  }
}

export function normalizeFloorAreaRelationshipCandidate(
  propertyPath: FloorAreaRelationshipPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  if (typeof candidateValue !== "string" || candidateValue.trim().length === 0) {
    return undefined;
  }

  return candidateValue.trim();
}

export function isResolvedFloorSystemPropertyValue(
  propertyPath: FloorSystemPropertyPath,
  value: string | number | null,
): boolean {
  if (value === null) {
    return false;
  }

  if (propertyPath === "constructionPhase") {
    return (value as FloorConstructionPhase) !== "unknown";
  }

  return true;
}

export function isResolvedFloorAreaPropertyValue(
  propertyPath: FloorAreaPropertyPath,
  value: string | number | null,
): boolean {
  return value !== null;
}
