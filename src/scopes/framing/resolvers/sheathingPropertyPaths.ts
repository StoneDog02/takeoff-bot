import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import {
  sheathingApplicationSchema,
  sheathingConstructionPhaseSchema,
  type SheathingApplication,
  type SheathingConstructionPhase,
} from "../schemas/sheathing.schema.js";

export const SHEATHING_SYSTEM_PROPERTY_PATHS = [
  "name",
  "level",
  "application",
  "constructionPhase",
  "panelSpecification.panelType",
  "panelSpecification.thickness",
  "panelSpecification.grade",
  "panelSpecification.spanRating",
  "panelSpecification.exposureRating",
  "panelSpecification.edgeTreatment",
  "panelSpecification.specificationReference",
] as const;

export const SHEATHING_AREA_PROPERTY_PATHS = [
  "areaSquareFeet",
  "layout",
] as const;

export const SHEATHING_AREA_RELATIONSHIP_PROPERTY_PATHS = [
  "parentSystemTag",
  "coveredWallTag",
  "openingTag",
] as const;

export type SheathingSystemPropertyPath =
  (typeof SHEATHING_SYSTEM_PROPERTY_PATHS)[number];

export type SheathingAreaPropertyPath =
  (typeof SHEATHING_AREA_PROPERTY_PATHS)[number];

export type SheathingAreaRelationshipPropertyPath =
  (typeof SHEATHING_AREA_RELATIONSHIP_PROPERTY_PATHS)[number];

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

export function isSheathingSystemPropertyPath(
  propertyPath: string,
): propertyPath is SheathingSystemPropertyPath {
  return (SHEATHING_SYSTEM_PROPERTY_PATHS as readonly string[]).includes(
    propertyPath,
  );
}

export function isSheathingAreaPropertyPath(
  propertyPath: string,
): propertyPath is SheathingAreaPropertyPath {
  return (SHEATHING_AREA_PROPERTY_PATHS as readonly string[]).includes(
    propertyPath,
  );
}

export function isSheathingAreaRelationshipPropertyPath(
  propertyPath: string,
): propertyPath is SheathingAreaRelationshipPropertyPath {
  return (
    SHEATHING_AREA_RELATIONSHIP_PROPERTY_PATHS as readonly string[]
  ).includes(propertyPath);
}

export function isSheathingPropertyPath(propertyPath: string): boolean {
  return (
    isSheathingSystemPropertyPath(propertyPath) ||
    isSheathingAreaPropertyPath(propertyPath) ||
    isSheathingAreaRelationshipPropertyPath(propertyPath)
  );
}

export function normalizeSheathingSystemCandidate(
  propertyPath: SheathingSystemPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  switch (propertyPath) {
    case "application": {
      if (typeof candidateValue !== "string") {
        return undefined;
      }

      const parsed = sheathingApplicationSchema.safeParse(
        normalizeToken(candidateValue),
      );
      return parsed.success ? parsed.data : undefined;
    }
    case "constructionPhase": {
      if (typeof candidateValue !== "string") {
        return undefined;
      }

      const parsed = sheathingConstructionPhaseSchema.safeParse(
        normalizeToken(candidateValue),
      );
      return parsed.success ? parsed.data : undefined;
    }
    case "name":
    case "level":
    case "panelSpecification.panelType":
    case "panelSpecification.thickness":
    case "panelSpecification.grade":
    case "panelSpecification.spanRating":
    case "panelSpecification.exposureRating":
    case "panelSpecification.edgeTreatment":
    case "panelSpecification.specificationReference":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
  }
}

export function normalizeSheathingAreaCandidate(
  propertyPath: SheathingAreaPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | undefined {
  if (candidateValue === null || typeof candidateValue === "boolean") {
    return undefined;
  }

  switch (propertyPath) {
    case "areaSquareFeet":
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
    case "layout":
      return typeof candidateValue === "string" && candidateValue.trim().length > 0
        ? candidateValue.trim()
        : undefined;
  }
}

export function normalizeSheathingAreaRelationshipCandidate(
  propertyPath: SheathingAreaRelationshipPropertyPath,
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

export function isResolvedSheathingSystemPropertyValue(
  propertyPath: SheathingSystemPropertyPath,
  value: string | number | null,
): boolean {
  if (value === null) {
    return false;
  }

  if (propertyPath === "application") {
    return (value as SheathingApplication) !== "unknown";
  }

  if (propertyPath === "constructionPhase") {
    return (value as SheathingConstructionPhase) !== "unknown";
  }

  return true;
}

export function isResolvedSheathingAreaPropertyValue(
  propertyPath: SheathingAreaPropertyPath,
  value: string | number | null,
): boolean {
  return value !== null;
}
