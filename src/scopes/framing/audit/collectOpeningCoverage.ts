import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { LoadedAuditArtifacts } from "./collectFramingAuditMetrics.js";
import { calculateWallFraming } from "../calculators/calculateWallFraming.js";
import {
  computeNetStudDeduction,
  countRegularlySpacedStuds,
  roughOpeningZonesOverlap,
} from "../calculators/netStudDeduction.js";
import type { Opening } from "../schemas/opening.schema.js";
import type { OpeningCoverage } from "./auditMetrics.schema.js";

function dimensionOwnershipFromEvidence(
  evidence: readonly Evidence[],
  openingEvidenceIds: readonly string[],
): string | null {
  const record = evidence.find(
    (e) =>
      openingEvidenceIds.includes(e.id) &&
      e.propertyPath === "dimensionOwnershipStatus",
  );
  return typeof record?.candidateValue === "string"
    ? record.candidateValue
    : null;
}

function eligibleOpeningsOnSegment(
  openings: readonly Opening[],
  segmentId: string,
): Opening[] {
  return openings.filter(
    (o) =>
      o.parentObjectId === segmentId &&
      o.positionOffsetFeetFromSegmentStart != null &&
      o.dimensions.roughWidthFeet != null,
  );
}

/** Same overlap fail-safe as calculateWallFraming segmentNetStudDeduction. */
function segmentOpeningsOverlap(eligible: readonly Opening[]): boolean {
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i]!;
      const b = eligible[j]!;
      if (
        roughOpeningZonesOverlap(
          a.positionOffsetFeetFromSegmentStart!,
          a.dimensions.roughWidthFeet!,
          b.positionOffsetFeetFromSegmentStart!,
          b.dimensions.roughWidthFeet!,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function sumStudQuantities(
  materials: ReturnType<typeof calculateWallFraming>,
): number {
  return materials
    .filter((m) => m.unit === "each" && /stud/i.test(m.description))
    .reduce((sum, m) => sum + m.quantity, 0);
}

export function collectOpeningCoverage(
  artifacts: LoadedAuditArtifacts,
): OpeningCoverage {
  const openings = artifacts.openings?.openings ?? [];
  const evidence = artifacts.evidence;
  const wallFraming = artifacts.wallFraming;

  let openingsWithParentWall = 0;
  let openingsWithGovernedWidth = 0;
  let openingsDimensionEstablished = 0;
  let openingsDimensionAmbiguous = 0;
  let openingsDimensionUnresolved = 0;
  let openingsMaterialAuthoritative = 0;

  for (const opening of openings) {
    if (opening.parentWallId != null) openingsWithParentWall++;
    if (opening.dimensions.roughWidthFeet != null) openingsWithGovernedWidth++;

    const dimStatus = dimensionOwnershipFromEvidence(evidence, opening.evidenceIds);
    if (dimStatus === "ESTABLISHED") openingsDimensionEstablished++;
    else if (dimStatus === "AMBIGUOUS") openingsDimensionAmbiguous++;
    else if (dimStatus === "UNRESOLVED") openingsDimensionUnresolved++;

    if (
      opening.parentWallId != null &&
      opening.positionOffsetFeetFromSegmentStart != null &&
      opening.dimensions.roughWidthFeet != null &&
      dimStatus === "ESTABLISHED"
    ) {
      openingsMaterialAuthoritative++;
    }
  }

  let openingsAffectingStudCalculation = 0;
  let regularStudQuantityDelta = 0;
  let segmentsWithNetDeduction = 0;
  let segmentsBlockedByOpeningOverlap = 0;
  const affectingOpeningIds = new Set<string>();

  if (wallFraming) {
    const wallsById = new Map(wallFraming.walls.map((w) => [w.id, w]));

    for (const segment of wallFraming.segments) {
      const wall = wallsById.get(segment.parentWallId);
      if (
        !wall ||
        segment.lengthFeet == null ||
        wall.assembly.studSpacingInches == null ||
        wall.assembly.studSize == null
      ) {
        continue;
      }

      const eligible = eligibleOpeningsOnSegment(openings, segment.id);
      if (eligible.length === 0) continue;

      if (segmentOpeningsOverlap(eligible)) {
        segmentsBlockedByOpeningOverlap++;
        continue;
      }

      let deduct = 0;
      for (const o of eligible) {
        deduct += computeNetStudDeduction({
          lengthFeet: segment.lengthFeet,
          spacingInches: wall.assembly.studSpacingInches,
          positionOffsetFeetFromSegmentStart:
            o.positionOffsetFeetFromSegmentStart!,
          roughWidthFeet: o.dimensions.roughWidthFeet!,
        }).deductCount;
      }
      if (deduct > 0) {
        segmentsWithNetDeduction++;
        regularStudQuantityDelta -= deduct;
        for (const o of eligible) {
          affectingOpeningIds.add(o.id);
        }
      }
    }
  }

  openingsAffectingStudCalculation = affectingOpeningIds.size;

  let productionStudQuantityDelta = 0;
  if (wallFraming) {
    const baseline = sumStudQuantities(calculateWallFraming(wallFraming));
    const withOpenings = sumStudQuantities(
      calculateWallFraming(wallFraming, undefined, { openings }),
    );
    productionStudQuantityDelta = withOpenings - baseline;
  }

  return {
    openingsDetected: openings.length,
    openingsWithParentWall,
    openingsWithGovernedWidth,
    openingsDimensionEstablished,
    openingsDimensionAmbiguous,
    openingsDimensionUnresolved,
    openingsMaterialAuthoritative,
    openingsAffectingStudCalculation,
    regularStudQuantityDelta,
    productionStudQuantityDelta,
    segmentsWithNetDeduction,
    segmentsBlockedByOpeningOverlap,
  };
}
