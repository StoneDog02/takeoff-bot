import type { Evidence } from "../../core/schemas/evidence.schema.js";
import {
  wallBearingStatusSchema,
  wallConstructionPhaseSchema,
  wallLocationSchema,
} from "../schemas/wall.schema.js";

export const WALL_PROPERTY_PATHS = [
  "wallType",
  "location",
  "bearingStatus",
  "isShearOrBraced",
  "fireRating",
  "constructionPhase",
  "assembly.studSize",
  "assembly.studSpacingInches",
  "assembly.heightFeet",
  "assembly.plateCount",
  "assembly.material",
  "assembly.sheathing",
] as const;

export const SEGMENT_PROPERTY_PATHS = ["lengthFeet"] as const;

export type WallPropertyPath = (typeof WALL_PROPERTY_PATHS)[number];
export type SegmentPropertyPath = (typeof SEGMENT_PROPERTY_PATHS)[number];
export type WallFramingPropertyPath = WallPropertyPath | SegmentPropertyPath;

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

/**
 * Wood-stud wall construction class from wallType alone.
 * Opening framing eligibility uses this identity (plus material checks).
 */
export function isWoodStudWallType(wallType: string): boolean {
  const token = normalizeToken(wallType);
  if (token.includes("metal")) {
    return false;
  }
  return token.includes("wood") && token.includes("stud");
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isPositiveNumber(value) && Number.isInteger(value);
}

export function isSegmentPropertyPath(
  path: string,
): path is SegmentPropertyPath {
  return (SEGMENT_PROPERTY_PATHS as readonly string[]).includes(path);
}

export function isWallFramingPropertyPath(
  propertyPath: string,
): propertyPath is WallFramingPropertyPath {
  return (
    (WALL_PROPERTY_PATHS as readonly string[]).includes(propertyPath) ||
    isSegmentPropertyPath(propertyPath)
  );
}

/**
 * Normalize a candidate only when the Evidence value already matches the
 * target field contract. Free-text is not coerced into construction enums.
 */
export function normalizeWallFramingCandidate(
  propertyPath: WallFramingPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | boolean | undefined {
  if (candidateValue === null) {
    return undefined;
  }

  switch (propertyPath) {
    case "location": {
      const parsed = wallLocationSchema.safeParse(candidateValue);
      return parsed.success ? parsed.data : undefined;
    }
    case "bearingStatus": {
      const parsed = wallBearingStatusSchema.safeParse(candidateValue);
      return parsed.success ? parsed.data : undefined;
    }
    case "constructionPhase": {
      const parsed = wallConstructionPhaseSchema.safeParse(candidateValue);
      return parsed.success ? parsed.data : undefined;
    }
    case "isShearOrBraced":
      return typeof candidateValue === "boolean" ? candidateValue : undefined;
    case "assembly.studSpacingInches":
    case "assembly.heightFeet":
    case "lengthFeet":
      return isPositiveNumber(candidateValue) ? candidateValue : undefined;
    case "assembly.plateCount":
      return isPositiveInteger(candidateValue) ? candidateValue : undefined;
    case "wallType":
    case "fireRating":
    case "assembly.studSize":
    case "assembly.material":
    case "assembly.sheathing":
      return typeof candidateValue === "string" ? candidateValue : undefined;
  }
}
