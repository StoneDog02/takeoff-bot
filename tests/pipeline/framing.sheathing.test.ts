import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  framingCalculationsArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import { buildMultiObjectFramingEvidence } from "../fixtures/multiObjectFramingEvidence.js";
import {
  kingStudMaterialForOpening,
  sheathingMaterialForArea,
  studMaterialForSegment,
} from "../integration/liveFramingProofHelpers.js";

const FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-o001-o002-o003-hdr001-hdr002-text-layer.pdf",
);

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function withInjectedEvidence(
  stages: PipelineStage[],
  evidence: Evidence[],
): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    await original.run(context);
    return createFramingStageArtifact(
      context,
      5,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence },
      { type: "system", identifier: "framing-pipeline" },
    );
  });
}

function unresolvedAreaEvidence() {
  return evidenceSchema.parse({
    id: "E-SHA-002-PARENT",
    type: "note",
    relationship: "supports",
    description: "Parent system without area square footage.",
    source: {
      page: {
        documentId: null,
        pageNumber: 1,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      elementLabel: "SHA-002",
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: "SHA-002 parent SHS-001",
    references: [],
    subjectKind: "sheathing-area",
    subjectKey: "SHA-002",
    propertyPath: "parentSystemTag",
    candidateValue: "SHS-001",
  });
}

describe("framing pipeline sheathing slice", () => {
  it("composes sheathing coverage with wall and opening materials through Stage 12", async () => {
    const artifactRoot = await mkdtemp(
      path.join(tmpdir(), "takeoff-bot-pipeline-sheathing-"),
    );

    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
      const result = await runner.run({
        projectId: "test-project",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(
          createFramingStages(),
          buildMultiObjectFramingEvidence(),
        ),
      });

      assert.equal(result.success, true);
      assert.equal(result.stageResults.length, 15);

      const calculationsStage = result.stageResults.find(
        (entry) => entry.name === "calculations",
      );
      assert.ok(calculationsStage?.artifactPath);
      const calculationsArtifact = framingCalculationsArtifactSchema.parse(
        JSON.parse(await readFile(calculationsStage.artifactPath, "utf8")),
      );
      const reportStage = result.stageResults.find((entry) => entry.name === "report");
      assert.ok(reportStage?.artifactPath);
      const reportArtifact = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(reportStage.artifactPath, "utf8")),
      );

      const calculations = calculationsArtifact.payload;
      assert.equal(studMaterialForSegment(calculations, "WS-001")?.quantity, 16);
      assert.equal(kingStudMaterialForOpening(calculations, "O-001")?.quantity, 3);
      assert.equal(sheathingMaterialForArea(calculations, "SHA-001")?.quantity, 160);
      assert.equal(reportArtifact.payload.summary.sheathingAreaCount, 1);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("blocks only unresolved sheathing areas while preserving unrelated materials", async () => {
    const artifactRoot = await mkdtemp(
      path.join(tmpdir(), "takeoff-bot-pipeline-sheathing-block-"),
    );

    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
      const result = await runner.run({
        projectId: "test-project",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(createFramingStages(), [
          ...buildMultiObjectFramingEvidence(),
          unresolvedAreaEvidence(),
        ]),
      });

      assert.equal(result.success, true);
      const calculationsStage = result.stageResults.find(
        (entry) => entry.name === "calculations",
      );
      assert.ok(calculationsStage?.artifactPath);
      const calculations = framingCalculationsArtifactSchema.parse(
        JSON.parse(await readFile(calculationsStage.artifactPath, "utf8")),
      ).payload;

      assert.equal(sheathingMaterialForArea(calculations, "SHA-001")?.quantity, 160);
      assert.equal(sheathingMaterialForArea(calculations, "SHA-002"), undefined);
      assert.equal(studMaterialForSegment(calculations, "WS-002")?.quantity, 7);
      assert.equal(kingStudMaterialForOpening(calculations, "O-003")?.quantity, 2);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
