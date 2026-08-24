import type { OpeningCategory } from "../schemas/opening.schema.js";

export const DIMENSION_OWNERSHIP_STATUSES = [
  "ESTABLISHED",
  "AMBIGUOUS",
  "UNRESOLVED",
] as const;

export type DimensionOwnershipStatus =
  (typeof DIMENSION_OWNERSHIP_STATUSES)[number];

export type OpeningGapCandidate = {
  openingSubjectKey: string;
  pageNumber: number;
  physicalRunKey: string;
  gapIndex: number;
  gapAt: { x: number; y: number };
  gapPt: number;
  runOrientation: "H" | "V";
  runLengthPt: number;
  wallAuthority: "high" | "medium" | "low" | "reject";
};

export type PhysicalRunOwnershipResult = {
  status: "ESTABLISHED" | "AMBIGUOUS" | "UNRESOLVED";
  parentPhysicalRunKey: string | null;
  positionOffsetFeetFromSegmentStart: number | null;
  notes: string[];
};

export type DimensionOwnershipResult = {
  status: DimensionOwnershipStatus;
  roughWidthFeet: number | null;
  nominalWidthFeet: number | null;
  dimId: string | null;
  textPrimitiveId: string | null;
  originalText: string | null;
  /** Lower is better (axial + normal distance to winning dim). Null when unresolved. */
  matchScore: number | null;
  notes: string[];
};

export type GovernedOpeningCandidate = OpeningGapCandidate & {
  category: OpeningCategory;
  physicalRunOwnership: PhysicalRunOwnershipResult;
  dimensionOwnership: DimensionOwnershipResult;
  materialAuthoritative: boolean;
};
