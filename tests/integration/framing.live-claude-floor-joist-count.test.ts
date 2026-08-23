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
import { FLOOR_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { FLOOR_FRAMING_TEXT } from "../fixtures/floorFramingFixtureLines.js";
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
  "../fixtures/wall-w001-ffs001-text-layer.pdf",
);

async function runLiveFloorPipeline(
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

describe("live Claude wall+floor joist count and LF proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts explicit member length through deterministic joist count and LF",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-floor-"),
      );

      try {
        const snapshot = await runLiveFloorPipeline(
          FIXTURE,
          "live-proof-w001-ffs001",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, FLOOR_FRAMING_TEXT);
        assert.match(
          snapshot.pageText,
          /Joist layout length along spacing axis: 20 feet/i,
        );
        assert.match(snapshot.pageText, /Joist member length: 12 feet/i);

        const floorEvidence = snapshot.evidence.filter(
          (record) =>
            record.subjectKind === "floor-framing-system" ||
            record.subjectKind === "floor-framing-area",
        );
        assert.ok(floorEvidence.length >= 6);
        assert.ok(
          floorEvidence.every((record) =>
            isGroundedInPageText(record.originalText, snapshot.pageText),
          ),
        );
        assert.ok(
          hasCandidateForSubject(
            snapshot.evidence,
            "FFA-001",
            "joistLayoutLengthFeet",
            20,
          ),
        );
        assert.ok(
          hasCandidateForSubject(
            snapshot.evidence,
            "FFA-001",
            "joistMemberLengthFeet",
            12,
          ),
        );

        assert.equal(studMaterialForSegment(snapshot.calculations, "WS-001")?.quantity, 16);

        const joistLine = snapshot.calculations.materials.find(
          (item) =>
            item.id === materialLineItemId(FLOOR_QUANTITY_KEYS.joists, "FFA-001"),
        );
        assert.ok(joistLine);
        assert.equal(joistLine.quantity, 16);
        assert.equal(joistLine.unit, "each");

        const joistLfLine = snapshot.calculations.materials.find(
          (item) =>
            item.id ===
            materialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, "FFA-001"),
        );
        assert.ok(joistLfLine);
        assert.equal(joistLfLine.quantity, 192);
        assert.equal(joistLfLine.unit, "linear-foot");

        assert.equal(snapshot.takeoff.summary.floorFramingSystemCount, 1);
        assert.equal(snapshot.takeoff.summary.floorFramingAreaCount, 1);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
