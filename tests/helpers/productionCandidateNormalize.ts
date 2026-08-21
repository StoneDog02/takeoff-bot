import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import {
  isFloorAreaPropertyPath,
  isFloorSystemPropertyPath,
  normalizeFloorAreaCandidate,
  normalizeFloorSystemCandidate,
} from "../../src/scopes/framing/resolvers/floorFramingPropertyPaths.js";
import {
  isOpeningPropertyPath,
  normalizeOpeningCandidate,
} from "../../src/scopes/framing/resolvers/openingPropertyPaths.js";
import {
  isRoofPlanePropertyPath,
  isRoofSystemPropertyPath,
  normalizeRoofPlaneCandidate,
  normalizeRoofSystemCandidate,
} from "../../src/scopes/framing/resolvers/roofFramingPropertyPaths.js";
import {
  isSheathingAreaPropertyPath,
  isSheathingSystemPropertyPath,
  normalizeSheathingAreaCandidate,
  normalizeSheathingSystemCandidate,
} from "../../src/scopes/framing/resolvers/sheathingPropertyPaths.js";
import {
  isStructuralMemberPropertyPath,
  normalizeStructuralMemberCandidate,
} from "../../src/scopes/framing/resolvers/structuralMemberPropertyPaths.js";
import {
  isWallFramingPropertyPath,
  normalizeWallFramingCandidate,
} from "../../src/scopes/framing/resolvers/wallFramingPropertyPaths.js";

/**
 * Applies the same property-specific candidate normalizer production resolvers
 * use. Returns undefined when the candidate is not production-acceptable.
 */
export function tryNormalizeProductionCandidate(
  propertyPath: string,
  candidateValue: Evidence["candidateValue"],
): string | number | boolean | undefined {
  if (isWallFramingPropertyPath(propertyPath)) {
    return normalizeWallFramingCandidate(propertyPath, candidateValue);
  }
  if (isOpeningPropertyPath(propertyPath)) {
    return normalizeOpeningCandidate(propertyPath, candidateValue);
  }
  if (isStructuralMemberPropertyPath(propertyPath)) {
    return normalizeStructuralMemberCandidate(propertyPath, candidateValue);
  }
  if (isSheathingSystemPropertyPath(propertyPath)) {
    return normalizeSheathingSystemCandidate(propertyPath, candidateValue);
  }
  if (isSheathingAreaPropertyPath(propertyPath)) {
    return normalizeSheathingAreaCandidate(propertyPath, candidateValue);
  }
  if (isFloorSystemPropertyPath(propertyPath)) {
    return normalizeFloorSystemCandidate(propertyPath, candidateValue);
  }
  if (isFloorAreaPropertyPath(propertyPath)) {
    return normalizeFloorAreaCandidate(propertyPath, candidateValue);
  }
  if (isRoofSystemPropertyPath(propertyPath)) {
    return normalizeRoofSystemCandidate(propertyPath, candidateValue);
  }
  if (isRoofPlanePropertyPath(propertyPath)) {
    return normalizeRoofPlaneCandidate(propertyPath, candidateValue);
  }
  return undefined;
}
