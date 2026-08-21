import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import {
  roofConstructionPhaseSchema,
  type RoofConstructionPhase,
} from "../schemas/roof-framing.schema.js";

export const ROOF_SYSTEM_PROPERTY_PATHS = [
  "name",
  "level",
  "constructionPhase",
  "assembly.framingType",
  "assembly.memberSize",
  "assembly.memberSpacingInches",
] as const;

export const ROOF_PLANE_PROPERTY_PATHS = [
  "layout",
  "framingDirection",
  "spanDirection",
  "rafterLayoutLengthFeet",
  "pitch",
  "areaSquareFeet",
] as const;

export const ROOF_PLANE_RELATIONSHIP_PROPERTY_PATHS = [
  "parentSystemTag",
  "boundingWallTag",
  "openingTag",
  "structuralMemberTag",
] as const;

export type RoofSystemPropertyPath =
  (typeof ROOF_SYSTEM_PROPERTY_PATHS)[number];

export type RoofPlanePropertyPath = (typeof ROOF_PLANE_PROPERTY_PATHS)[number];

export type RoofPlaneRelationshipPropertyPath =
  (typeof ROOF_PLANE_RELATIONSHIP_PROPERTY_PATHS)[number];

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

export function isRoofSystemPropertyPath(
  propertyPath: string,
): propertyPath is RoofSystemPropertyPath {
  return (ROOF_SYSTEM_PROPERTY_PATHS as readonly string[]).includes(propertyPath);
}

export function isRoofPlanePropertyPath(
  propertyPath: string,
): propertyPath is RoofPlanePropertyPath {
  return (ROOF_PLANE_PROPERTY_PATHS as readonly string[]).includes(propertyPath);
}

export function isRoofPlaneRelationshipPropertyPath(
  propertyPath: string,
): propertyPath is RoofPlaneRelationshipPropertyPath {
  return (ROOF_PLANE_RELATIONSHIP_PROPERTY_PATHS as readonly string[]).includes(
    propertyPath,
  );
}

export function isRoofFramingPropertyPath(propertyPath: string): boolean {
  return (
    isRoofSystemPropertyPath(propertyPath) ||
    isRoofPlanePropertyPath(propertyPath) ||
    isRoofPlaneRelationshipPropertyPath(propertyPath)
  );
}

/** Scalar Roof properties eligible for User Decision resolution (not relationship tags). */
export function isRoofFramingUserDecisionPropertyPath(
  propertyPath: string,
): boolean {
  return (
    isRoofSystemPropertyPath(propertyPath) || isRoofPlanePropertyPath(propertyPath)
  );
}

export function normalizeRoofSystemCandidate(
  propertyPath: RoofSystemPropertyPath,
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

      const parsed = roofConstructionPhaseSchema.safeParse(
        normalizeToken(candidateValue),
      );
      return parsed.success ? parsed.data : undefined;
    }
    case "name":
    case "level":
    case "assembly.framingType":
    case "assembly.memberSize":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
    case "assembly.memberSpacingInches":
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
  }
}

export function normalizeRoofPlaneCandidate(
  propertyPath: RoofPlanePropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  switch (propertyPath) {
    case "rafterLayoutLengthFeet":
    case "areaSquareFeet":
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
    case "layout":
    case "framingDirection":
    case "spanDirection":
    case "pitch":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
  }
}

export function normalizeRoofPlaneRelationshipCandidate(
  propertyPath: RoofPlaneRelationshipPropertyPath,
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

export function isResolvedRoofSystemPropertyValue(
  propertyPath: RoofSystemPropertyPath,
  value: string | number | null,
): boolean {
  if (value === null) {
    return false;
  }

  if (propertyPath === "constructionPhase") {
    return (value as RoofConstructionPhase) !== "unknown";
  }

  return true;
}

export function isResolvedRoofPlanePropertyValue(
  propertyPath: RoofPlanePropertyPath,
  value: string | number | null,
): boolean {
  return value !== null;
}

/**
 * R1 stick common-rafter eligibility for framingType.
 * Truss / engineered packages are excluded.
 */
export function isStickCommonRafterFramingType(framingType: string): boolean {
  const token = normalizeToken(framingType);
  if (
    token.includes("truss") ||
    token.includes("metal") ||
    token.includes("steel")
  ) {
    return false;
  }

  return (
    token === "rafter" ||
    token === "common-rafter" ||
    token === "common-rafters" ||
    token === "stick" ||
    token === "stick-framed" ||
    token === "stick-frame" ||
    token.includes("rafter")
  );
}
