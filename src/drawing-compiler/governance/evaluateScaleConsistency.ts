/**
 * B2.2I — geometric scale consistency (leave-one-out / pairwise peers).
 * impliedPtPerFt = runLengthPt / parsedFeet.
 * Pass: ≥1 eligible peer within ±band (avoids dense short-OCR false consensus).
 * Reject: no peer agreement but a strong opposing peer-cluster (≥3) exists.
 * Unresolved: insufficient signal. No self-bootstrap. No fixed arch scale constants.
 * Claude=0.
 */

export type CandidateSource = "detected" | "near-high-seed" | "virtual-text";

export type ScaleTrustInput = {
  dimId: string;
  orientation: "H" | "V";
  runLengthPt: number;
  parsedFeet: number;
  uniquenessMargin: number;
  lengthOk: boolean;
  ownershipStatus: string;
  candidateSource: CandidateSource;
};

export type ScaleDecision =
  | {
      status: "pass";
      impliedPtPerFt: number;
      consensusPtPerFt: number;
      peerCount: number;
      scope: "orientation" | "page";
    }
  | {
      status: "reject";
      impliedPtPerFt: number;
      consensusPtPerFt: number | null;
      peerCount: number;
      scope: "orientation" | "page" | "none";
      reason: string;
    }
  | {
      status: "unresolved";
      impliedPtPerFt: number;
      consensusPtPerFt: number | null;
      peerCount: number;
      scope: "orientation" | "page" | "none";
      reason: string;
    };

export const SCALE_RELATIVE_BAND = 0.25;
export const SCALE_MIN_PARSED_FEET = 3;
export const SCALE_MIN_RUN_PT = 120;
export const SCALE_CONSENSUS_UNIQUENESS_MIN = 1.0;
/** Opposing cluster size that proves a page consensus the candidate fails. */
export const SCALE_OPPOSING_CLUSTER_MIN = 3;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function withinBand(a: number, center: number, band: number): boolean {
  if (center <= 0 || a <= 0) return false;
  return Math.abs(a - center) / center <= band;
}

export function largestScaleCluster(
  values: number[],
  band = SCALE_RELATIVE_BAND,
): { members: number[]; median: number } {
  if (values.length === 0) return { members: [], median: 0 };
  if (values.length === 1) return { members: [...values], median: values[0]! };
  const sorted = [...values].sort((a, b) => a - b);
  let best: number[] = [sorted[0]!];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i; j < sorted.length; j++) {
      const slice = sorted.slice(i, j + 1);
      const med = median(slice);
      if (slice.every((v) => withinBand(v, med, band)) && slice.length > best.length) {
        best = slice;
      }
    }
  }
  return { members: best, median: median(best) };
}

export function isScaleConsensusEligible(c: ScaleTrustInput): boolean {
  const statusOk =
    c.ownershipStatus === "associated" || c.ownershipStatus === "ambiguous";
  return (
    statusOk &&
    c.lengthOk &&
    c.uniquenessMargin >= SCALE_CONSENSUS_UNIQUENESS_MIN &&
    c.parsedFeet >= SCALE_MIN_PARSED_FEET &&
    c.runLengthPt >= SCALE_MIN_RUN_PT &&
    (c.candidateSource === "detected" || c.candidateSource === "near-high-seed")
  );
}

export function evaluateScaleConsistency(
  inputs: ScaleTrustInput[],
): Map<string, ScaleDecision> {
  const out = new Map<string, ScaleDecision>();
  const eligible = inputs.filter(isScaleConsensusEligible).map((c) => ({
    ...c,
    impliedPtPerFt: c.runLengthPt / c.parsedFeet,
  }));

  const decide = (
    self: (typeof eligible)[0],
    pool: typeof eligible,
    scope: "orientation" | "page",
  ): ScaleDecision | null => {
    const peers = pool.filter((p) => p.dimId !== self.dimId);
    if (peers.length === 0) return null;

    const agreeing = peers.filter((p) =>
      withinBand(p.impliedPtPerFt, self.impliedPtPerFt, SCALE_RELATIVE_BAND),
    );
    if (agreeing.length >= 1) {
      const consensus = median([
        self.impliedPtPerFt,
        ...agreeing.map((p) => p.impliedPtPerFt),
      ]);
      // Leave-one-out: consensus from agreeing peers only (excludes self)
      const loo = median(agreeing.map((p) => p.impliedPtPerFt));
      if (withinBand(self.impliedPtPerFt, loo, SCALE_RELATIVE_BAND)) {
        return {
          status: "pass",
          impliedPtPerFt: self.impliedPtPerFt,
          consensusPtPerFt: loo,
          peerCount: agreeing.length,
          scope,
        };
      }
      return {
        status: "pass",
        impliedPtPerFt: self.impliedPtPerFt,
        consensusPtPerFt: consensus,
        peerCount: agreeing.length,
        scope,
      };
    }

    const opposing = largestScaleCluster(peers.map((p) => p.impliedPtPerFt));
    if (opposing.members.length >= SCALE_OPPOSING_CLUSTER_MIN) {
      return {
        status: "reject",
        impliedPtPerFt: self.impliedPtPerFt,
        consensusPtPerFt: opposing.median,
        peerCount: opposing.members.length,
        scope,
        reason: `no peer within ±${SCALE_RELATIVE_BAND * 100}% of self; opposing cluster n=${opposing.members.length} @ ${opposing.median.toFixed(2)} (${scope})`,
      };
    }
    return null;
  };

  for (const self of eligible) {
    const oriPool = eligible.filter((p) => p.orientation === self.orientation);
    let decision = decide(self, oriPool, "orientation");
    if (!decision) decision = decide(self, eligible, "page");
    if (!decision) {
      decision = {
        status: "unresolved",
        impliedPtPerFt: self.impliedPtPerFt,
        consensusPtPerFt: null,
        peerCount: 0,
        scope: "none",
        reason: "no agreeing peer and no strong opposing cluster",
      };
    }
    out.set(self.dimId, decision);
  }

  for (const c of inputs) {
    if (out.has(c.dimId)) continue;
    const implied =
      c.parsedFeet > 0 && c.runLengthPt > 0
        ? c.runLengthPt / c.parsedFeet
        : 0;
    out.set(c.dimId, {
      status: "unresolved",
      impliedPtPerFt: implied,
      consensusPtPerFt: null,
      peerCount: 0,
      scope: "none",
      reason: "not scale-consensus-eligible",
    });
  }

  return out;
}
