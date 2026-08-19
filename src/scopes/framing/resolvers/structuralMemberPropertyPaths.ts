import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import {
  structuralMemberCategorySchema,
  type StructuralMemberCategory,
} from "../schemas/structural-member.schema.js";

export const STRUCTURAL_MEMBER_PROPERTY_PATHS = [
  "category",
  "materialType",
  "size",
  "lengthFeet",
  "quantity",
  "location",
] as const;

export const STRUCTURAL_MEMBER_RELATIONSHIP_PROPERTY_PATHS = [
  "supportedOpeningTag",
] as const;

export type StructuralMemberRelationshipPropertyPath =
  (typeof STRUCTURAL_MEMBER_RELATIONSHIP_PROPERTY_PATHS)[number];

export type StructuralMemberPropertyPath =
  (typeof STRUCTURAL_MEMBER_PROPERTY_PATHS)[number];

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isPositiveNumber(value) && Number.isInteger(value);
}

export function isStructuralMemberPropertyPath(
  propertyPath: string,
): propertyPath is StructuralMemberPropertyPath {
  return (STRUCTURAL_MEMBER_PROPERTY_PATHS as readonly string[]).includes(
    propertyPath,
  );
}

/**
 * Normalize a candidate only when the Evidence value already matches the
 * target field contract. No semantic translation or inference is applied.
 */
export function normalizeStructuralMemberCandidate(
  propertyPath: StructuralMemberPropertyPath,
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

      const parsed = structuralMemberCategorySchema.safeParse(candidateValue);
      return parsed.success ? parsed.data : undefined;
    }
    case "materialType":
    case "size":
    case "location":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
    case "lengthFeet":
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
    case "quantity":
      return isPositiveInteger(candidateValue) ? candidateValue : undefined;
  }
}

export function isStructuralMemberRelationshipPropertyPath(
  propertyPath: string,
): propertyPath is StructuralMemberRelationshipPropertyPath {
  return (
    STRUCTURAL_MEMBER_RELATIONSHIP_PROPERTY_PATHS as readonly string[]
  ).includes(propertyPath);
}

/**
 * Normalize an explicit source reference for relationship resolution.
 * Values remain extraction tags, not resolved ObjectIds.
 */
export function normalizeStructuralMemberRelationshipCandidate(
  propertyPath: StructuralMemberRelationshipPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  if (propertyPath === "supportedOpeningTag") {
    return typeof candidateValue === "string" && candidateValue.trim().length > 0
      ? candidateValue.trim()
      : undefined;
  }

  return undefined;
}

export type { StructuralMemberCategory };
