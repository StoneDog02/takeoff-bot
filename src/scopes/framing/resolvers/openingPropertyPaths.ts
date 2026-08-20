import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import {
  openingCategorySchema,
  type OpeningCategory,
} from "../schemas/opening.schema.js";

export const OPENING_COMPLETION_PROPERTY_PATHS = [
  "category",
  "dimensions.nominalWidthFeet",
  "dimensions.nominalHeightFeet",
  "dimensions.roughWidthFeet",
  "dimensions.roughHeightFeet",
  "quantity",
] as const;

export const OPENING_OPTIONAL_PROPERTY_PATHS = [
  "scheduleReference",
  "detailReference",
  "fireRating",
  "kingStudCount",
  "jackStudCount",
] as const;

export const OPENING_PROPERTY_PATHS = [
  ...OPENING_COMPLETION_PROPERTY_PATHS,
  ...OPENING_OPTIONAL_PROPERTY_PATHS,
] as const;

export type OpeningCompletionPropertyPath =
  (typeof OPENING_COMPLETION_PROPERTY_PATHS)[number];

export type OpeningPropertyPath = (typeof OPENING_PROPERTY_PATHS)[number];

export const OPENING_RELATIONSHIP_PROPERTY_PATHS = [
  "parentWallTag",
  "headerMemberTag",
] as const;

export type OpeningRelationshipPropertyPath =
  (typeof OPENING_RELATIONSHIP_PROPERTY_PATHS)[number];

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isPositiveNumber(value) && Number.isInteger(value);
}

export function isOpeningPropertyPath(
  propertyPath: string,
): propertyPath is OpeningPropertyPath {
  return (OPENING_PROPERTY_PATHS as readonly string[]).includes(propertyPath);
}

/**
 * Normalize a candidate only when the Evidence value already matches the
 * target field contract. No semantic translation or inference is applied.
 */
export function normalizeOpeningCandidate(
  propertyPath: OpeningPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  switch (propertyPath) {
    case "category": {
      if (typeof candidateValue !== "string") {
        return undefined;
      }

      const parsed = openingCategorySchema.safeParse(candidateValue);
      return parsed.success ? parsed.data : undefined;
    }
    case "scheduleReference":
    case "detailReference":
    case "fireRating":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
    case "dimensions.nominalWidthFeet":
    case "dimensions.nominalHeightFeet":
    case "dimensions.roughWidthFeet":
    case "dimensions.roughHeightFeet":
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
    case "quantity":
      return isPositiveInteger(candidateValue) ? candidateValue : undefined;
    case "kingStudCount":
    case "jackStudCount":
      return isPositiveInteger(candidateValue) ? candidateValue : undefined;
  }
}

export function isOpeningRelationshipPropertyPath(
  propertyPath: string,
): propertyPath is OpeningRelationshipPropertyPath {
  return (OPENING_RELATIONSHIP_PROPERTY_PATHS as readonly string[]).includes(
    propertyPath,
  );
}

/**
 * Normalize an explicit source reference for relationship resolution.
 * Values remain extraction tags, not resolved ObjectIds.
 */
export function normalizeOpeningRelationshipCandidate(
  propertyPath: OpeningRelationshipPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  if (propertyPath === "parentWallTag") {
    return typeof candidateValue === "string" && candidateValue.trim().length > 0
      ? candidateValue.trim()
      : undefined;
  }

  if (propertyPath === "headerMemberTag") {
    return typeof candidateValue === "string" && candidateValue.trim().length > 0
      ? candidateValue.trim()
      : undefined;
  }

  return undefined;
}

export function isResolvedOpeningPropertyValue(
  propertyPath: OpeningCompletionPropertyPath,
  value: string | number | null,
): boolean {
  if (value === null) {
    return false;
  }

  if (propertyPath === "category") {
    return value !== "unknown";
  }

  return true;
}

export type { OpeningCategory };
