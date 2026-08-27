/**
 * Offline Beckstead M2 product-state comparison using existing Stage 7–13
 * artifacts + current calculation/admission code (no live extraction).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { coordinateFramingCalculations } from "../src/scopes/framing/calculators/calculation-coordinator.js";
import { collectPendingClaims } from "../src/scopes/framing/claims/collectPendingClaims.js";
import { buildClaimCandidacyContext } from "../src/scopes/framing/claims/buildClaimCandidacyContext.js";
import type { PendingClaimSuppression } from "../src/scopes/framing/claims/collectPendingClaims.js";
import { projectReviewRootCauses } from "../src/scopes/framing/review-workspace/projectReviewRootCauses.js";

const RUN =
  "artifacts/beckstead-fresh-20260827-144141/framing";

function load(name: string) {
  return JSON.parse(readFileSync(join(RUN, name), "utf8")).payload;
}

const wallFraming = load("07-wallFraming.json");
const openings = load("08-openings.json");
const structuralMembers = load("09-structuralMembers.json");
const sheathing = load("10-sheathing.json");
const floorFraming = load("11-floorFraming.json");
const roofFraming = load("12-roofFraming.json");
const validation = load("13-validation.json");
const beforeCalc = load("14-calculations.json");

const beforePending = beforeCalc.pendingClaims ?? [];
const beforeMaterials = beforeCalc.materials ?? [];
const beforeAssumptions = beforeCalc.assumptions ?? [];

const suppressions: PendingClaimSuppression[] = [];
const candidacyContext = buildClaimCandidacyContext({
  openings,
  wallFraming,
  floorFraming,
  roofFraming,
  sheathing,
});

const after = coordinateFramingCalculations({
  wallFraming,
  openings,
  structuralMembers,
  floorFraming,
  roofFraming,
  sheathing,
  validation,
});

// Re-collect with suppressions audit (coordinator already admitted).
collectPendingClaims({
  validation,
  materials: after.materials,
  candidacyContext,
  suppressionsOut: suppressions,
});

const afterPending = after.pendingClaims;
const rootCauses = projectReviewRootCauses({
  validation,
  openings,
  wallFraming,
  floorFraming,
});

const suppressionByReason: Record<string, number> = {};
const suppressionByKeyReason: Record<string, number> = {};
for (const s of suppressions) {
  suppressionByReason[s.reason] = (suppressionByReason[s.reason] ?? 0) + 1;
  const k = `${s.reason}::${s.quantityKey}`;
  suppressionByKeyReason[k] = (suppressionByKeyReason[k] ?? 0) + 1;
}

const beforeByKey: Record<string, number> = {};
for (const p of beforePending) {
  beforeByKey[p.quantityKey] = (beforeByKey[p.quantityKey] ?? 0) + 1;
}
const afterByKey: Record<string, number> = {};
for (const p of afterPending) {
  afterByKey[p.quantityKey] = (afterByKey[p.quantityKey] ?? 0) + 1;
}

// Completeness: eligible emit keys that were pending before and still blocked
// should remain if still admitted. Flag unexpected disappearances among
// previously-admitted-shaped rows (owner type + category eligible).
const openById = Object.fromEntries(
  openings.openings.map((o: { id: string; category: string }) => [o.id, o]),
);
const eligibleCats: Record<string, Set<string>> = {
  "opening.king-studs": new Set(["door", "window", "cased"]),
  "opening.jack-studs": new Set(["door", "window", "cased"]),
  "opening.rough-sill": new Set(["window"]),
  "opening.cripples-above": new Set(["window", "cased"]),
  "opening.cripples-below": new Set(["window"]),
};
const ownerPrefix: Record<string, (id: string) => boolean> = {
  "wall.studs": (id) => id.startsWith("WS-"),
  "wall.plates": (id) => id.startsWith("WS-"),
  "member.material": (id) => id.startsWith("SM-"),
  "floor.joists": (id) => id.startsWith("FFA-"),
  "floor.joist-linear-feet": (id) => id.startsWith("FFA-"),
  "sheathing.area": (id) => id.startsWith("SHA-"),
  "roof.common-rafters": (id) => id.startsWith("RP-") || id.startsWith("RPLANE"),
};

function wasLegitimateCandidate(p: {
  quantityKey: string;
  sourceObjectIds: string[];
}): boolean {
  const oid = p.sourceObjectIds[0] ?? "";
  const qk = p.quantityKey;
  if (qk.startsWith("opening.") && !["opening.framing", "opening.header"].includes(qk)) {
    const cats = eligibleCats[qk];
    if (!cats) return false;
    const cat = openById[oid]?.category;
    return cats.has(cat);
  }
  const check = ownerPrefix[qk];
  return check ? check(oid) : false;
}

const afterIds = new Set(afterPending.map((p: { id: string }) => p.id));
const unexpectedGone = beforePending.filter((p: {
  id: string;
  quantityKey: string;
  sourceObjectIds: string[];
  claimStatus: string;
}) => {
  if (p.claimStatus === "UNSUPPORTED_CAPABILITY") return false;
  if (!wasLegitimateCandidate(p)) return false;
  // Remapped IDs: wall studs on building-wall become WS-* — skip those
  if (!afterIds.has(p.id)) {
    // Check if same quantityKey+owner still present under same id scheme
    const oid = p.sourceObjectIds[0];
    const still = afterPending.some(
      (a: { quantityKey: string; sourceObjectIds: string[] }) =>
        a.quantityKey === p.quantityKey && a.sourceObjectIds[0] === oid,
    );
    return !still;
  }
  return false;
});

const report = {
  before: {
    materials: beforeMaterials.length,
    pendingClaims: beforePending.length,
    assumptions: beforeAssumptions.length,
    reviewItems: validation.reviewItems.length,
    pendingByKey: beforeByKey,
  },
  after: {
    materials: after.materials.length,
    pendingClaims: afterPending.length,
    assumptions: after.assumptions.length,
    reviewItems: validation.reviewItems.length,
    pendingByKey: afterByKey,
    materialsWithQuantityKey: after.materials.filter(
      (m: { quantityKey?: string }) => m.quantityKey,
    ).length,
  },
  suppressions: {
    totalEvaluations: suppressions.length,
    byReason: suppressionByReason,
    byReasonAndKey: Object.fromEntries(
      Object.entries(suppressionByKeyReason).sort((a, b) => b[1] - a[1]),
    ),
  },
  reviewGovernance: {
    rawReviewItems: rootCauses.summary.rawReviewItems,
    contractorPrimaryQueueCount: rootCauses.summary.contractorPrimaryQueueCount,
    informationalIssues: rootCauses.summary.informationalIssues,
    blockingReviewItems: rootCauses.summary.blockingReviewItems,
    objectSpecificDecisions: rootCauses.summary.objectSpecificDecisions,
    actionableGoverningDecisions: rootCauses.summary.actionableGoverningDecisions,
  },
  unexpectedLegitimatePendingGone: unexpectedGone.map(
    (p: { id: string; quantityKey: string; sourceObjectIds: string[] }) => ({
      id: p.id,
      quantityKey: p.quantityKey,
      owner: p.sourceObjectIds[0],
    }),
  ),
};

const outDir = "artifacts/beckstead-fresh-20260827-144141";
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "m2-candidacy-before-after.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
