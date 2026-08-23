import type { PipelineStage } from "../../../core/pipeline/types.js";
import { buildDereferencedBindingEvidence } from "../geometry/buildSemanticDefinitionEvidenceFromCompiledPages.js";
import { buildGovernedSemanticCompilerEvidence } from "../geometry/buildGovernedSemanticCompilerEvidence.js";
import { buildGeometryEvidenceFromCompiledPages } from "../geometry/buildGeometryEvidenceFromCompiledPages.js";
import { buildSemanticBindingEvidenceFromCompiledPages } from "../geometry/buildSemanticBindingEvidenceFromCompiledPages.js";
import { collectWallAssemblyNoteTexts } from "../geometry/collectWallAssemblyNoteTexts.js";
import { mergeExtractedAndGeometryEvidence } from "../geometry/mergeExtractedAndGeometryEvidence.js";
import { extractFramingEvidenceViaClaude } from "../prompts/extractFramingEvidence.js";
import {
  compiledDrawingPagesArtifactSchema,
  extractedFramingEvidenceArtifactSchema,
  projectDictionaryArtifactSchema,
  type BuildingAssembliesPayload,
  type CompiledDrawingPagesPayload,
  type ExtractedFramingEvidencePayload,
  type PageClassificationPayload,
  type PlanReadingOrderPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../stages/createFramingStages.js";
import type { EvidenceStageVariant } from "./evidenceStageTypes.js";

export type ClaudeUsageHolder = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function getPayload<T>(
  context: Parameters<PipelineStage["run"]>[0],
  stageName: string,
): T {
  const artifact = context.completedArtifacts.get(stageName);
  if (!artifact) {
    throw new Error(`Required artifact from stage '${stageName}' is missing.`);
  }
  return artifact.payload as T;
}

async function appendProductionSemanticEvidence(
  context: Parameters<PipelineStage["run"]>[0],
  compiledPages: CompiledDrawingPagesPayload["pages"],
  evidence: ExtractedFramingEvidencePayload["evidence"],
  variant: EvidenceStageVariant,
): Promise<ExtractedFramingEvidencePayload["evidence"]> {
  const dictionaryEnvelope = context.completedArtifacts.get("projectDictionary");
  const dictionaryPayload = dictionaryEnvelope
    ? projectDictionaryArtifactSchema.parse(dictionaryEnvelope).payload
    : null;

  const noteTexts = await collectWallAssemblyNoteTexts({
    pdfPath: context.planIndex.pdfPath,
    pageNumbers: [1, 3, 4],
    ocrCacheDir: process.env.TAKEOFF_WALL_ASSEMBLY_OCR_CACHE_DIR ?? null,
  });

  let merged = [
    ...evidence,
    ...buildGovernedSemanticCompilerEvidence(compiledPages, dictionaryPayload, {
      noteTexts,
    }),
  ];

  if (variant === "diagnostic") {
    merged = [...merged, ...buildDereferencedBindingEvidence(compiledPages)];
  }

  if (process.env.TAKEOFF_SEMANTIC_BINDING === "1") {
    merged = [
      ...merged,
      ...buildSemanticBindingEvidenceFromCompiledPages(compiledPages),
    ];
  }

  return merged;
}

export function createFramingStagesForAudit(
  variant: EvidenceStageVariant,
  claudeUsage?: ClaudeUsageHolder,
): PipelineStage[] {
  if (variant === "default") {
    return createFramingStages();
  }

  if (variant === "a0_empty") {
    return replaceStage(createFramingStages(), "extractedEvidence", async (context) => {
      return createFramingStageArtifact(
        context,
        6,
        extractedFramingEvidenceArtifactSchema,
        "extracted-framing-evidence",
        { evidence: [] },
        { type: "system", identifier: "framing-audit-a0-empty" },
      );
    });
  }

  if (variant === "live_claude") {
    return replaceStage(createFramingStages(), "extractedEvidence", async (context) => {
      const claudePayload = await extractFramingEvidenceViaClaude({
        planIndex: context.planIndex,
        pageClassification: getPayload<PageClassificationPayload>(
          context,
          "pageClassification",
        ),
        planReadingOrder: getPayload<PlanReadingOrderPayload>(
          context,
          "planReadingOrder",
        ),
        buildingAssemblies: getPayload<BuildingAssembliesPayload>(
          context,
          "buildingAssemblies",
        ),
        onApiCall: () => {
          if (claudeUsage) claudeUsage.calls += 1;
        },
        onUsage: (usage) => {
          if (claudeUsage) {
            claudeUsage.inputTokens += usage.inputTokens;
            claudeUsage.outputTokens += usage.outputTokens;
          }
        },
      });

      const compiledPages = getPayload<CompiledDrawingPagesPayload>(
        context,
        "compiledDrawingPages",
      );
      const geometryEvidence = buildGeometryEvidenceFromCompiledPages(
        compiledPages.pages,
      );
      const merged = mergeExtractedAndGeometryEvidence({
        claudeEvidence: claudePayload.evidence,
        geometryEvidence,
      });

      const evidence = await appendProductionSemanticEvidence(
        context,
        compiledPages.pages,
        merged.evidence,
        "compiler_only",
      );

      return createFramingStageArtifact(
        context,
        6,
        extractedFramingEvidenceArtifactSchema,
        "extracted-framing-evidence",
        { evidence },
        { type: "system", identifier: "framing-audit-live-claude" },
      );
    });
  }

  return replaceStage(createFramingStages(), "extractedEvidence", async (context) => {
    const compiledPages = getPayload<CompiledDrawingPagesPayload>(
      context,
      "compiledDrawingPages",
    );
    const geometryEvidence = buildGeometryEvidenceFromCompiledPages(compiledPages.pages);
    const merged = mergeExtractedAndGeometryEvidence({
      claudeEvidence: [],
      geometryEvidence,
    });
    const evidence = await appendProductionSemanticEvidence(
      context,
      compiledPages.pages,
      merged.evidence,
      variant,
    );

    return createFramingStageArtifact(
      context,
      6,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence },
      {
        type: "system",
        identifier:
          variant === "diagnostic"
            ? "framing-audit-diagnostic"
            : "framing-audit-compiler-only",
      },
    );
  });
}

export function validateCompiledPagesArtifact(raw: unknown): CompiledDrawingPagesPayload {
  return compiledDrawingPagesArtifactSchema.parse(raw).payload;
}
