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
import { SHEATHING_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { WALL_SHEATHING_TEXT } from "../fixtures/wallSheathingFixtureLines.js";
import {
  hasCandidateForSubject,
  isGroundedInPageText,
  materialLineItemId,
  sheathingMaterialForArea,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-shs001-text-layer.pdf",
);

async function runLiveSheathingPipeline(
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
  assert.equal(result.stageResults.length, 15);

  return snapshotLiveFramingPipeline(pageText, result);
}

describe("live Claude wall+sheathing proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts sheathing evidence through Stage 12 with unchanged wall quantities",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-sheathing-"),
      );

      try {
        const snapshot = await runLiveSheathingPipeline(
          FIXTURE,
          "live-proof-w001-shs001",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, WALL_SHEATHING_TEXT);
        assert.match(snapshot.pageText, /Sheathing coverage area: 160 SF/i);

        const sheathingEvidence = snapshot.evidence.filter(
          (record) =>
            record.subjectKind === "sheathing-system" ||
            record.subjectKind === "sheathing-area",
        );
        assert.ok(sheathingEvidence.length >= 4);
        assert.ok(
          sheathingEvidence.every((record) =>
            isGroundedInPageText(record.originalText, snapshot.pageText),
          ),
        );
        assert.ok(
          hasCandidateForSubject(
            snapshot.evidence,
            "SHA-001",
            "areaSquareFeet",
            160,
          ),
        );

        assert.equal(studMaterialForSegment(snapshot.calculations, "WS-001")?.quantity, 16);
        assert.equal(
          sheathingMaterialForArea(snapshot.calculations, "SHA-001")?.quantity,
          160,
        );
        assert.equal(
          sheathingMaterialForArea(snapshot.calculations, "SHA-001")?.id,
          materialLineItemId(SHEATHING_QUANTITY_KEYS.area, "SHA-001"),
        );
        assert.equal(snapshot.takeoff.summary.sheathingSystemCount, 1);
        assert.equal(snapshot.takeoff.summary.sheathingAreaCount, 1);
        assert.ok(snapshot.takeoff.summary.materialLineItemCount >= 3);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
