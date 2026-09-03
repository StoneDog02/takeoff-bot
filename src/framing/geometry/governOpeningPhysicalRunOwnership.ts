import type { PhysicalWallRunRecord } from "../../compiler/schemas/physicalWallRun.schema.js";
import type {
  OpeningGapCandidate,
  PhysicalRunOwnershipResult,
} from "./openingGovernanceTypes.js";

const MIN_AUTHORITY = new Set<PhysicalWallRunRecord["wallAuthority"]>([
  "high",
  "medium",
]);

function runAxisPosition(
  run: PhysicalWallRunRecord,
  pt: { x: number; y: number },
): number {
  if (run.orientation === "H") {
    return pt.x;
  }
  return pt.y;
}

function runAxisStart(run: PhysicalWallRunRecord): number {
  if (run.orientation === "H") {
    return Math.min(run.centerline.x1, run.centerline.x2);
  }
  return Math.min(run.centerline.y1, run.centerline.y2);
}

/**
 * Authority B — opening belongs to physical wall run.
 * Gap suspects are already emitted on a specific PBG run; govern authority grade
 * and compute position offset when rough width is known.
 */
export function governOpeningPhysicalRunOwnership(
  candidate: OpeningGapCandidate,
  run: PhysicalWallRunRecord,
  ptPerFt: number,
  roughWidthFeet: number | null,
): PhysicalRunOwnershipResult {
  if (candidate.physicalRunKey !== run.physicalRunKey) {
    return {
      status: "UNRESOLVED",
      parentPhysicalRunKey: null,
      positionOffsetFeetFromSegmentStart: null,
      notes: ["Gap candidate run key does not match supplied run."],
    };
  }

  if (!MIN_AUTHORITY.has(run.wallAuthority)) {
    return {
      status: "UNRESOLVED",
      parentPhysicalRunKey: null,
      positionOffsetFeetFromSegmentStart: null,
      notes: [`Run wallAuthority=${run.wallAuthority} is below governed threshold.`],
    };
  }

  let positionOffsetFeetFromSegmentStart: number | null = null;
  const notes: string[] = [
    `Gap on governed run ${run.physicalRunKey} (${run.wallAuthority} authority).`,
  ];

  if (roughWidthFeet != null && ptPerFt > 0) {
    const axisStart = runAxisStart(run);
    const gapAxis = runAxisPosition(run, candidate.gapAt);
    const gapCenterFeet = (gapAxis - axisStart) / ptPerFt;
    const leftEdge = gapCenterFeet - roughWidthFeet / 2;
    const runLengthFeet = run.lengthPt / ptPerFt;

    if (leftEdge < -0.5 || leftEdge + roughWidthFeet > runLengthFeet + 0.5) {
      return {
        status: "AMBIGUOUS",
        parentPhysicalRunKey: run.physicalRunKey,
        positionOffsetFeetFromSegmentStart: null,
        notes: [
          ...notes,
          "Rough opening zone extends outside parent run length; block position offset.",
        ],
      };
    }

    positionOffsetFeetFromSegmentStart = Math.max(0, Number(leftEdge.toFixed(4)));
    notes.push(
      `Position offset ${positionOffsetFeetFromSegmentStart} ft from segment start (gap center ${gapCenterFeet.toFixed(2)} ft, width ${roughWidthFeet} ft).`,
    );
  }

  return {
    status: "ESTABLISHED",
    parentPhysicalRunKey: run.physicalRunKey,
    positionOffsetFeetFromSegmentStart,
    notes,
  };
}
