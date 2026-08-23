/**
 * B2.2I — govern wall-plan length Evidence emission.
 * Order: page-role → ownership floors → candidateSource → scale consistency.
 * Claude=0. Does not weaken uniqueness 1.5 / lengthRatio 0.85.
 */
import type { PageRoleResult } from "../page-role/classifyCompilerPageRole.js";
import {
  evaluateScaleConsistency,
  type CandidateSource,
  type ScaleDecision,
  type ScaleTrustInput,
} from "./evaluateScaleConsistency.js";
import { UNIQUENESS_MIN, LENGTH_RATIO_MIN } from "../transcription/resolveTranscriptions.js";

/** Overall wall-plan length Evidence: avoid short OCR confusers that pass pairwise scale. */
export const EVIDENCE_MIN_PARSED_FEET = 12;

export type GovernableAssoc = {
  dimId: string;
  roleGuess: string | null;
  status: string;
  uniquenessMargin?: number;
  lengthOk?: boolean;
  lengthRatio?: number;
  runLengthPt?: number;
  dimLengthPt?: number;
  orientation?: "H" | "V";
  physicalRunKey?: string;
  runId?: string;
  ocrText?: string | null;
  parse?: {
    status: string;
    originalText?: string;
    feet?: number;
  } | null;
  candidateSource: CandidateSource;
  transcriptionAuthority?: string;
};

export type GovernDecision = {
  dimId: string;
  emit: boolean;
  reasons: string[];
  scale: ScaleDecision | null;
  pageRoleOk: boolean;
  ownershipOk: boolean;
  sourceOk: boolean;
};

export type GovernResult = {
  decisions: GovernDecision[];
  emitDimIds: string[];
  scaleByDim: Record<string, ScaleDecision>;
  counts: {
    emit: number;
    rejectPageRole: number;
    rejectOwnership: number;
    rejectVirtual: number;
    rejectScale: number;
    unresolvedScale: number;
    passScale: number;
  };
};

export function governWallPlanLengthEvidence(opts: {
  pageRole: PageRoleResult;
  associations: GovernableAssoc[];
}): GovernResult {
  const { pageRole, associations } = opts;
  const scaleInputs: ScaleTrustInput[] = [];

  for (const a of associations) {
    const feet = a.parse?.status === "ok" ? a.parse.feet : undefined;
    if (
      feet == null ||
      !a.runLengthPt ||
      !a.orientation ||
      a.status === "unassociated"
    ) {
      continue;
    }
    scaleInputs.push({
      dimId: a.dimId,
      orientation: a.orientation,
      runLengthPt: a.runLengthPt,
      parsedFeet: feet,
      uniquenessMargin: a.uniquenessMargin ?? 0,
      lengthOk: a.lengthOk === true,
      ownershipStatus: a.status,
      candidateSource: a.candidateSource,
    });
  }

  const scaleMap = evaluateScaleConsistency(scaleInputs);
  const scaleByDim: Record<string, ScaleDecision> = {};
  for (const [k, v] of scaleMap) scaleByDim[k] = v;

  const decisions: GovernDecision[] = [];
  const counts = {
    emit: 0,
    rejectPageRole: 0,
    rejectOwnership: 0,
    rejectVirtual: 0,
    rejectScale: 0,
    unresolvedScale: 0,
    passScale: 0,
  };

  for (const a of associations) {
    const reasons: string[] = [];
    let pageRoleOk = true;
    let ownershipOk = true;
    let sourceOk = true;
    const scale = scaleMap.get(a.dimId) ?? null;

    if (!pageRole.allowsWallPlanLengthEvidence) {
      pageRoleOk = false;
      reasons.push("page-role-not-plan");
      counts.rejectPageRole++;
    }

    const ownershipPass =
      a.status === "associated" &&
      a.roleGuess === "overall-candidate" &&
      (a.uniquenessMargin ?? 0) >= UNIQUENESS_MIN &&
      a.lengthOk === true &&
      a.parse?.status === "ok" &&
      typeof a.ocrText === "string" &&
      a.ocrText.length > 0 &&
      typeof a.parse.feet === "number" &&
      a.parse.feet >= EVIDENCE_MIN_PARSED_FEET;
    if (!ownershipPass) {
      ownershipOk = false;
      reasons.push(
        typeof a.parse?.feet === "number" &&
          a.parse.feet < EVIDENCE_MIN_PARSED_FEET
          ? "overall-feet-below-evidence-floor"
          : "ownership-or-parse-gate",
      );
      counts.rejectOwnership++;
    }

    if (a.candidateSource === "virtual-text") {
      sourceOk = false;
      reasons.push("virtual-text-no-evidence");
      counts.rejectVirtual++;
    }

    if (scale?.status === "pass") counts.passScale++;
    if (scale?.status === "reject") {
      reasons.push(`scale-reject:${scale.reason}`);
      counts.rejectScale++;
    }
    if (scale?.status === "unresolved") {
      reasons.push(`scale-unresolved:${scale.reason}`);
      counts.unresolvedScale++;
    }

    const scaleOk = scale?.status === "pass";
    const emit =
      pageRoleOk && ownershipOk && sourceOk && scaleOk;

    if (emit) {
      counts.emit++;
      // undo double-count reject tallies for emitted — only count rejects when blocking
    }

    decisions.push({
      dimId: a.dimId,
      emit,
      reasons: emit ? ["pass"] : reasons,
      scale,
      pageRoleOk,
      ownershipOk,
      sourceOk,
    });
  }

  // Recount rejects only for ownership-eligible overalls that failed later gates
  const recount = {
    emit: 0,
    rejectPageRole: 0,
    rejectOwnership: 0,
    rejectVirtual: 0,
    rejectScale: 0,
    unresolvedScale: 0,
    passScale: 0,
  };
  for (const d of decisions) {
    if (d.scale?.status === "pass") recount.passScale++;
    if (d.emit) {
      recount.emit++;
      continue;
    }
    if (!d.pageRoleOk) recount.rejectPageRole++;
    else if (!d.ownershipOk) recount.rejectOwnership++;
    else if (!d.sourceOk) recount.rejectVirtual++;
    else if (d.scale?.status === "reject") recount.rejectScale++;
    else if (d.scale?.status === "unresolved") recount.unresolvedScale++;
  }

  return {
    decisions,
    emitDimIds: decisions.filter((d) => d.emit).map((d) => d.dimId),
    scaleByDim,
    counts: recount,
  };
}

/** Production export name (B2.2J). */
export const governWallPlanLengthObservations = governWallPlanLengthEvidence;

export { UNIQUENESS_MIN, LENGTH_RATIO_MIN };
