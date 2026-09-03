import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../core/schemas/identity.schema.js";

export const CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID =
  "construction-semantic-relationship-authority";
export const CONSTRUCTION_SEMANTIC_RELATIONSHIP_BUNDLE_ID =
  "construction-semantic-relationship-authority";

export const REGION_VOCABULARY_TOKENS = [
  "CRAWL",
  "GARAGE",
  "PORCH",
  "DECK",
  "MAIN",
  "BASEMENT",
  "UPPER",
  "LOWER",
  "PATIO",
  "ATTIC",
  "LOFT",
] as const;

export type SignalGroupId = "SR" | "RL" | "APC" | "SA" | "SL" | "RB" | "LD" | "DA";

export type ConstructionSemanticRejectionReason =
  | "MISSING-SR"
  | "MISSING-RL"
  | "MISSING-APC"
  | "MISSING-SA"
  | "CS-CONFLICT-REGION"
  | "CS-CONFLICT-ASSEMBLY"
  | "CS-CONFLICT-SYSTEM"
  | "CS-CONFLICT-AREA"
  | "CS-INCOMPATIBLE-AREA-MATERIAL"
  | "AMBIGUOUS_AUTHORITY"
  | "ALREADY-LINKED";

export type AssemblyFingerprint = {
  joistProductClass: "TJI" | "I-JOIST" | "DIMENSIONAL" | "UNKNOWN";
  joistSize: string;
  joistSpacingInches: number | null;
};

export type RegionIdentity = {
  tokens: readonly string[];
  label: string;
  pageNumber: number;
  evidenceIds: readonly EvidenceId[];
};

export type SheetRoleSignal = {
  pageNumber: number;
  titleOrLabel: string;
  pageKind: string;
  evidenceIds: readonly EvidenceId[];
};

export type IndexedSignal = {
  id: SignalGroupId;
  pageNumber: number;
  subjectKey: string | null;
  subjectKind: Evidence["subjectKind"] | null;
  evidenceIds: readonly EvidenceId[];
  tileId: string | null;
  originalText: string | null;
};

export type ConstructionSemanticProofResult =
  | {
      status: "accepted";
      areaSubjectKey: string;
      systemSubjectKey: string;
      authorizingEvidenceIds: EvidenceId[];
      supportScore: number;
    }
  | {
      status: "rejected";
      reason: ConstructionSemanticRejectionReason;
      conflictCandidates?: readonly string[];
      authorizingEvidenceIds?: readonly EvidenceId[];
    };

export type ConstructionSemanticAuditEntry = {
  pageNumber: number;
  regionLabel: string;
  areaSubjectKey: string | null;
  systemSubjectKey: string | null;
  status: "accepted" | "rejected" | "candidate";
  reason: ConstructionSemanticRejectionReason | null;
  supportScore: number | null;
  conflictCandidates: readonly string[];
  authorizingEvidenceIds: readonly EvidenceId[];
};
