/**
 * Copy Beckstead fresh Run 1 artifacts and rewrite Stage 14/16 with M2
 * candidacy admission (no live extraction).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

import { coordinateFramingCalculations } from "../src/scopes/framing/calculators/calculation-coordinator.js";
import { buildFramingPackageProductState } from "../src/scopes/framing/observability/buildFramingPackageProductState.js";
import { framingPackageProductStateArtifactSchema } from "../src/scopes/framing/schemas/framing-artifacts.schema.js";

const SRC = "artifacts/beckstead-fresh-20260827-144141/framing";
const DEST_ROOT = "artifacts/beckstead-fresh-20260827-144141-m2";
const DEST = join(DEST_ROOT, "framing");
const NEW_PROJECT_ID = "beckstead-fresh-20260827-144141-m2";
const NEW_RUN_ID = `run-m2-${randomBytes(4).toString("hex")}`;

function loadEnvelope(name: string) {
  return JSON.parse(readFileSync(join(SRC, name), "utf8"));
}

function artifactId(order: number, payload: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 12);
  return `artifact-${String(order).padStart(2, "0")}-${digest}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rewriteEnvelopeMeta(
  envelope: Record<string, unknown>,
  order: number,
  payload: unknown,
): Record<string, unknown> {
  const ts = nowIso();
  return {
    ...envelope,
    artifactId: artifactId(order, payload),
    pipelineRunId: NEW_RUN_ID,
    projectId: NEW_PROJECT_ID,
    createdAt: ts,
    lastModifiedAt: ts,
    payload,
  };
}

mkdirSync(DEST_ROOT, { recursive: true });
cpSync(SRC, DEST, { recursive: true });

const wallFraming = loadEnvelope("07-wallFraming.json").payload;
const openings = loadEnvelope("08-openings.json").payload;
const structuralMembers = loadEnvelope("09-structuralMembers.json").payload;
const sheathing = loadEnvelope("10-sheathing.json").payload;
const floorFraming = loadEnvelope("11-floorFraming.json").payload;
const roofFraming = loadEnvelope("12-roofFraming.json").payload;
const validation = loadEnvelope("13-validation.json").payload;
const extracted = loadEnvelope("06-extractedEvidence.json").payload;
const calcEnvelope = loadEnvelope("14-calculations.json");
const confEnvelope = loadEnvelope("15-confidence.json");
const reportEnvelope = loadEnvelope("16-report.json");
const productEnvelope = loadEnvelope("16-report.package-product-state.json");

const calculations = coordinateFramingCalculations({
  wallFraming,
  openings,
  structuralMembers,
  floorFraming,
  roofFraming,
  sheathing,
  validation,
});

const newCalc = rewriteEnvelopeMeta(calcEnvelope, 14, calculations);
writeFileSync(join(DEST, "14-calculations.json"), JSON.stringify(newCalc, null, 2));

// Keep confidence evaluations; only retarget project/run ids for lineage clarity.
const newConf = {
  ...confEnvelope,
  artifactId: artifactId(15, confEnvelope.payload),
  pipelineRunId: NEW_RUN_ID,
  projectId: NEW_PROJECT_ID,
  createdAt: nowIso(),
  lastModifiedAt: nowIso(),
};
writeFileSync(join(DEST, "15-confidence.json"), JSON.stringify(newConf, null, 2));

const confidencePayload = newConf.payload as {
  confidenceEvaluations: Array<{
    id: string;
    target: { kind: string };
    completion: unknown;
    overallLabel: unknown;
    reviewStatus: unknown;
    blockingStatus: unknown;
  }>;
};
const confidence = confidencePayload.confidenceEvaluations.find(
  (evaluation) => evaluation.target.kind === "takeoff",
);
if (!confidence) {
  throw new Error("Takeoff confidence evaluation missing in Stage 15.");
}

const reportPayload = {
  ...reportEnvelope.payload,
  projectId: NEW_PROJECT_ID,
  materials: calculations.materials,
  pendingClaims: calculations.pendingClaims,
  reviewItemIds: validation.reviewItems.map((item: { id: string }) => item.id),
  validationIssueIds: validation.validationIssues.map(
    (issue: { id: string }) => issue.id,
  ),
  confidenceEvaluationId: confidence.id,
  summary: {
    ...reportEnvelope.payload.summary,
    materialLineItemCount: calculations.materials.length,
    pendingClaimCount: calculations.pendingClaims.length,
    reviewItemCount: validation.reviewItems.length,
    validationIssueCount: validation.validationIssues.length,
    completion: confidence.completion,
    confidenceLabel: confidence.overallLabel,
    reviewStatus: confidence.reviewStatus,
    blockingStatus: confidence.blockingStatus,
  },
};

const newReport = rewriteEnvelopeMeta(reportEnvelope, 16, reportPayload);
writeFileSync(join(DEST, "16-report.json"), JSON.stringify(newReport, null, 2));

const productState = buildFramingPackageProductState({
  runLabel: NEW_PROJECT_ID,
  artifacts: {
    evidence: extracted.evidence,
    wallFraming,
    openings,
    structuralMembers,
    floorFraming,
    roofFraming,
    sheathing,
    validation,
    calculations,
    confidence: confidencePayload,
    takeoff: reportPayload,
    extractionAudit: null,
    planReferenceTrace: null,
  },
});

const newProduct = framingPackageProductStateArtifactSchema.parse({
  ...productEnvelope,
  artifactId: artifactId(16, productState),
  pipelineRunId: NEW_RUN_ID,
  projectId: NEW_PROJECT_ID,
  createdAt: nowIso(),
  lastModifiedAt: nowIso(),
  producer: { type: "system", identifier: "m2-candidacy-recompute" },
  payload: productState,
});
writeFileSync(
  join(DEST, "16-report.package-product-state.json"),
  JSON.stringify(newProduct, null, 2),
);

// Stamp remaining stage envelopes with new project/run so UI lineage is consistent.
for (const file of [
  "01-verifiedPlanSet.json",
  "02-pageClassification.json",
  "03-planReadingOrder.json",
  "04-buildingAssemblies.json",
  "05-compiledDrawingPages.json",
  "06-extractedEvidence.json",
  "07-wallFraming.json",
  "08-openings.json",
  "09-structuralMembers.json",
  "10-sheathing.json",
  "11-floorFraming.json",
  "12-roofFraming.json",
  "13-validation.json",
]) {
  const path = join(DEST, file);
  const envelope = JSON.parse(readFileSync(path, "utf8"));
  envelope.projectId = NEW_PROJECT_ID;
  envelope.pipelineRunId = NEW_RUN_ID;
  writeFileSync(path, JSON.stringify(envelope, null, 2));
}

console.log(
  JSON.stringify(
    {
      dest: DEST,
      projectId: NEW_PROJECT_ID,
      pipelineRunId: NEW_RUN_ID,
      materials: calculations.materials.length,
      pendingClaims: calculations.pendingClaims.length,
      assumptions: calculations.assumptions.length,
      reviewItems: validation.reviewItems.length,
      uiCommand: `TAKEOFF_UI_ARTIFACT_DIR="${process.cwd()}/${DEST}" npm run ui:dev`,
    },
    null,
    2,
  ),
);
