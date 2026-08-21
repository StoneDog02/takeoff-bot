import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Evidence } from "../core/schemas/evidence.schema.js";
import type { PipelineStage } from "../core/pipeline/types.js";
import { extractedFramingEvidenceArtifactSchema } from "../scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../scopes/framing/stages/createFramingStages.js";
import { buildMultiObjectFramingEvidence } from "../scopes/framing/demo/multiObjectFramingEvidence.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export const UI_DEMO_PDF_PATH = path.resolve(
  moduleDirectory,
  "../../tests/fixtures/wall-w001-w002-text-layer.pdf",
);

export const UI_DEMO_PROJECT_ID = "ui-demo-multi-object";

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

export function withInjectedEvidence(
  stages: PipelineStage[],
  evidence: Evidence[],
): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  if (!original) {
    throw new Error("Expected extractedEvidence stage.");
  }

  return replaceStage(stages, "extractedEvidence", async (context) => {
    // Ordinary User Decision Run-2: delegate to production Evidence replay.
    if (context.userDecisionRunInput?.evidenceReplay) {
      return original.run(context);
    }

    return createFramingStageArtifact(
      context,
      5,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence },
      { type: "system", identifier: "framing-ui-demo" },
    );
  });
}

export function createUiDemoFramingStages(): PipelineStage[] {
  return withInjectedEvidence(
    createFramingStages(),
    buildMultiObjectFramingEvidence(),
  );
}
