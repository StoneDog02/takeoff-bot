import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../compiler/schemas/physicalWallRun.schema.js";
import type { TextPrimitiveRecord } from "../../compiler/schemas/textPrimitive.schema.js";
import type {
  MarkOwnershipResult,
  OpeningGapCandidate,
} from "./openingGovernanceTypes.js";
import {
  isOpeningMarkOrLabelText,
  literalOpeningCategoryFromText,
} from "./openingMarkText.js";

/** Max normal distance (PDF pt) from gap to mark text for opening-mark candidacy. */
const MAX_NORMAL_DIST_PT = 120;
/** Max axial distance (PDF pt) along run from gap to mark text. */
const MAX_AXIAL_DIST_PT = 200;

type MarkCandidate = {
  textPrimitiveId: string;
  rawText: string;
  normalDist: number;
  axialDist: number;
};

function gapRelativeDistances(
  run: PhysicalWallRunRecord,
  gapAt: { x: number; y: number },
  pt: { x: number; y: number },
): { normalDist: number; axialDist: number } {
  if (run.orientation === "H") {
    const runY = (run.centerline.y1 + run.centerline.y2) / 2;
    return {
      normalDist: Math.abs(pt.y - runY),
      axialDist: Math.abs(pt.x - gapAt.x),
    };
  }
  const runX = (run.centerline.x1 + run.centerline.x2) / 2;
  return {
    normalDist: Math.abs(pt.x - runX),
    axialDist: Math.abs(pt.y - gapAt.y),
  };
}

function collectMarkTextCandidates(
  page: CompiledDrawingPage,
  run: PhysicalWallRunRecord,
  gapAt: { x: number; y: number },
): MarkCandidate[] {
  const primitives: TextPrimitiveRecord[] = [
    ...page.text.primitives,
    ...page.text.imperialCandidates,
  ];
  const seen = new Set<string>();
  const out: MarkCandidate[] = [];

  const consider = (
    id: string,
    rawText: string,
    mid: { x: number; y: number },
  ) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (!isOpeningMarkOrLabelText(rawText)) return;

    const { normalDist, axialDist } = gapRelativeDistances(run, gapAt, mid);
    if (normalDist > MAX_NORMAL_DIST_PT || axialDist > MAX_AXIAL_DIST_PT) {
      return;
    }

    out.push({
      textPrimitiveId: id,
      rawText: rawText.trim(),
      normalDist,
      axialDist,
    });
  };

  for (const primitive of primitives) {
    consider(primitive.id, primitive.rawText, primitive.mid);
  }

  // Reuse semantic mark recovery OCR observations when present (empty-text plans).
  for (const observation of page.semanticMarkRecovery?.observations ?? []) {
    if (observation.rawText == null) continue;
    consider(
      `smr:${observation.observationId}`,
      observation.rawText,
      observation.mid,
    );
  }

  return out.sort(
    (a, b) => a.axialDist + a.normalDist - (b.axialDist + b.normalDist),
  );
}

function unresolved(notes: string[]): MarkOwnershipResult {
  return {
    status: "UNRESOLVED",
    markText: null,
    textPrimitiveId: null,
    literalCategory: null,
    matchScore: null,
    notes,
  };
}

function established(
  winner: MarkCandidate,
  notes: string[],
): MarkOwnershipResult {
  return {
    status: "ESTABLISHED",
    markText: winner.rawText,
    textPrimitiveId: winner.textPrimitiveId,
    literalCategory: literalOpeningCategoryFromText(winner.rawText),
    matchScore: winner.axialDist + winner.normalDist,
    notes,
  };
}

function markKey(ownership: MarkOwnershipResult): string | null {
  if (ownership.status !== "ESTABLISHED") return null;
  if (ownership.textPrimitiveId) return `text:${ownership.textPrimitiveId}`;
  if (ownership.markText) return `mark:${ownership.markText}`;
  return null;
}

function downgradeToAmbiguous(
  ownership: MarkOwnershipResult,
  reason: string,
): MarkOwnershipResult {
  return {
    status: "AMBIGUOUS",
    markText: ownership.markText,
    textPrimitiveId: ownership.textPrimitiveId,
    literalCategory: null,
    matchScore: ownership.matchScore,
    notes: [...ownership.notes, reason],
  };
}

/**
 * Authority — opening mark/label belongs to a physical gap on its parent run.
 * Mirrors dimension ownership: unique co-location required; never nearest-alone
 * across competing marks, and one mark ESTABLISHES at most one gap per run.
 */
export function governOpeningMarkOwnership(
  page: CompiledDrawingPage,
  run: PhysicalWallRunRecord,
  candidate: OpeningGapCandidate,
): MarkOwnershipResult {
  const candidates = collectMarkTextCandidates(page, run, candidate.gapAt);

  if (candidates.length === 0) {
    return unresolved([
      "No opening mark/label geometrically co-located with opening gap on parent run.",
    ]);
  }

  if (candidates.length > 1) {
    const withinTolerance = candidates.filter(
      (c) => c.axialDist < MAX_AXIAL_DIST_PT * 0.6,
    );
    if (withinTolerance.length === 1) {
      const winner = withinTolerance[0]!;
      return established(winner, [
        `Single co-located opening mark within tight axial band: ${winner.rawText}`,
      ]);
    }

    return {
      status: "AMBIGUOUS",
      markText: null,
      textPrimitiveId: null,
      literalCategory: null,
      matchScore: null,
      notes: [
        `${candidates.length} opening mark candidates near gap; cannot establish unique ownership.`,
        ...candidates.slice(0, 3).map(
          (c) =>
            `  candidate ${c.rawText} (axial=${c.axialDist.toFixed(0)}pt, normal=${c.normalDist.toFixed(0)}pt)`,
        ),
      ],
    };
  }

  const winner = candidates[0]!;
  return established(winner, [
    `Single co-located opening mark: ${winner.rawText}.`,
  ]);
}

/**
 * Parent-run exclusivity: a single mark text primitive may ESTABLISH at most
 * one gap on the same physical run.
 */
export function applyParentRunMarkExclusivity(
  entries: Array<{
    candidate: OpeningGapCandidate;
    ownership: MarkOwnershipResult;
  }>,
): MarkOwnershipResult[] {
  const results = entries.map((e) => e.ownership);

  const byMark = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const key = markKey(results[i]!);
    if (!key) continue;
    const list = byMark.get(key) ?? [];
    list.push(i);
    byMark.set(key, list);
  }

  for (const [, indices] of byMark) {
    if (indices.length < 2) continue;
    let winner = indices[0]!;
    for (const idx of indices.slice(1)) {
      const scoreA = results[idx]!.matchScore ?? Number.POSITIVE_INFINITY;
      const scoreB = results[winner]!.matchScore ?? Number.POSITIVE_INFINITY;
      if (scoreA < scoreB) {
        winner = idx;
      } else if (
        scoreA === scoreB &&
        entries[idx]!.candidate.gapIndex < entries[winner]!.candidate.gapIndex
      ) {
        winner = idx;
      }
    }
    for (const idx of indices) {
      if (idx === winner) continue;
      results[idx] = downgradeToAmbiguous(
        results[idx]!,
        `Mark exclusivity: same mark already ESTABLISHED on sibling gap ${entries[winner]!.candidate.openingSubjectKey}.`,
      );
    }
  }

  return results;
}
