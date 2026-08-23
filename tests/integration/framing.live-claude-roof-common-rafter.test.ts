import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import { isAnthropicConfigured } from "../../src/config/env.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createFramingStages } from "../../src/scopes/framing/stages/createFramingStages.js";
import { ROOF_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { ROOF_FRAMING_TEXT } from "../fixtures/roofFramingFixtureLines.js";
import {
  hasCandidateForSubject,
  isGroundedInPageText,
  materialLineItemId,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-rfs001-text-layer.pdf",
);

async function runLiveRoofPipeline(
  pdfPath: string,
  projectId: string,
  artifactRoot: string,
) {
  const planIndex = await indexPlan(pdfPath);
  const pageText = planIndex.pages.map((page) => page.textContent).join("\n");
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId,
    pdfPath,
    scopeName: "framing",
    planIndex,
    useMockAi: false,
    stages: createFramingStages(),
  });

  assert.equal(result.success, true, result.errors.join("\n"));
  assert.equal(result.errors.length, 0);
  assert.equal(result.stageResults.length, 16);

  return snapshotLiveFramingPipeline(pageText, result);
}

describe("live Claude wall+roof common-rafter count proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts explicit layout length through deterministic common-rafter count",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-roof-"),
      );

      try {
        const snapshot = await runLiveRoofPipeline(
          FIXTURE,
          "live-proof-w001-rfs001",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, ROOF_FRAMING_TEXT);
        assert.match(
          snapshot.pageText,
          /Rafter layout length along spacing axis: 20 feet/i,
        );

        const roofEvidence = snapshot.evidence.filter(
          (record) =>
            record.subjectKind === "roof-framing-system" ||
            record.subjectKind === "roof-plane",
        );
        assert.ok(roofEvidence.length >= 5);
        assert.ok(
          roofEvidence.every((record) =>
            isGroundedInPageText(record.originalText, snapshot.pageText),
          ),
        );
        assert.ok(
          hasCandidateForSubject(
            snapshot.evidence,
            "RFP-001",
            "rafterLayoutLengthFeet",
            20,
          ),
        );

        assert.equal(studMaterialForSegment(snapshot.calculations, "WS-001")?.quantity, 16);

        const commonRafterLine = snapshot.calculations.materials.find(
          (item) =>
            item.id ===
            materialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, "RFP-001"),
        );
        assert.ok(commonRafterLine);
        assert.equal(commonRafterLine.quantity, 16);
        assert.equal(commonRafterLine.unit, "each");

        assert.equal(snapshot.takeoff.summary.roofFramingSystemCount, 1);
        assert.equal(snapshot.takeoff.summary.roofPlaneCount, 1);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
