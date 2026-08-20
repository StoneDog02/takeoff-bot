import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import {
  floorConstructionPhaseSchema,
  type FloorConstructionPhase,
} from "../schemas/floor-framing.schema.js";

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
    case "assembly.joistSize":
    case "assembly.rimBoard":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
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
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
    case "layout":
    case "framingDirection":
    case "spanDirection":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
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
