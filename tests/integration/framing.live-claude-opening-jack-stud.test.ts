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
import { OPENING_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { WALL_O001_HDR001_JACK2_TEXT } from "../fixtures/wallOpeningHeaderJackStudFixtureLines.js";
import {
  hasCandidateForSubject,
  isGroundedInPageText,
  jackStudMaterialForOpening,
  kingStudMaterialForOpening,
  materialLineItemId,
  memberMaterialForObject,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-o001-hdr001-jack2-text-layer.pdf",
);

describe("live Claude opening jack stud proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts explicit jackStudCount through deterministic jack material line",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-jack-"),
      );

      try {
        const planIndex = await indexPlan(FIXTURE);
        const pageText = planIndex.pages.map((page) => page.textContent).join("\n");
        const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
        const result = await runner.run({
          projectId: "live-proof-w001-o001-jack2",
          pdfPath: FIXTURE,
          scopeName: "framing",
          planIndex,
          useMockAi: false,
          stages: createFramingStages(),
        });

        assert.equal(result.success, true, result.errors.join("\n"));
        assert.equal(result.stageResults.length, 15);

        const snapshot = await snapshotLiveFramingPipeline(pageText, result);
        assert.equal(snapshot.pageText, WALL_O001_HDR001_JACK2_TEXT);
        assert.match(snapshot.pageText, /Jack studs: 2/i);

        assert.ok(
          hasCandidateForSubject(snapshot.evidence, "O-001", "jackStudCount", 2),
        );
        const jackEvidence = snapshot.evidence.filter(
          (record) =>
            record.subjectKey === "O-001" && record.propertyPath === "jackStudCount",
        );
        assert.ok(jackEvidence.length >= 1);
        assert.ok(
          jackEvidence.every((record) =>
            isGroundedInPageText(record.originalText, snapshot.pageText),
          ),
        );

        assert.equal(studMaterialForSegment(snapshot.calculations, "WS-001")?.quantity, 16);
        assert.equal(kingStudMaterialForOpening(snapshot.calculations, "O-001")?.quantity, 2);
        assert.equal(jackStudMaterialForOpening(snapshot.calculations, "O-001")?.quantity, 2);
        assert.equal(
          jackStudMaterialForOpening(snapshot.calculations, "O-001")?.id,
          materialLineItemId(OPENING_QUANTITY_KEYS.jackStuds, "O-001"),
        );
        assert.equal(
          jackStudMaterialForOpening(snapshot.calculations, "O-001")?.assumptionIds.length,
          0,
        );
        assert.equal(memberMaterialForObject(snapshot.calculations, "SM-HDR-001")?.quantity, 6);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
