import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PipelineRunResult } from "../../../core/pipeline/types.js";
import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import { projectFramingReviewWorkspace } from "../review-workspace/projectFramingReviewWorkspace.js";
import {
  compiledDrawingPagesArtifactSchema,
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  floorFramingArtifactSchema,
  framingCalculationsArtifactSchema,
  openingsArtifactSchema,
  projectDictionaryArtifactSchema,
  roofFramingArtifactSchema,
  sheathingArtifactSchema,
  structuralMembersArtifactSchema,
  validationArtifactSchema,
  wallFramingArtifactSchema,
  type CompiledDrawingPagesPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  SEGMENT_PROPERTY_PATHS,
  WALL_PROPERTY_PATHS,
} from "../resolvers/wallFramingPropertyPaths.js";
import type {
  AuditRunMode,
  AutomationCoverage,
  GeometrySummary,
  MaterialOutputSummary,
  ResolutionCoverage,
  RuntimeCost,
  SemanticsSummary,
} from "./auditMetrics.schema.js";
import type { GroundTruthCheck } from "./groundTruthComparators.js";
import {
  checkLengthEvidenceAgainstP4Truth,
  loadBecksteadP4Expected,
} from "./groundTruthComparators.js";

export type LoadedAuditArtifacts = {
  compiledPages: CompiledDrawingPagesPayload;
  evidence: Evidence[];
  wallFraming: ReturnType<typeof wallFramingArtifactSchema.parse>["payload"] | null;
  openings: ReturnType<typeof openingsArtifactSchema.parse>["payload"] | null;
  structuralMembers: ReturnType<typeof structuralMembersArtifactSchema.parse>["payload"] | null;
  floorFraming: ReturnType<typeof floorFramingArtifactSchema.parse>["payload"] | null;
  roofFraming: ReturnType<typeof roofFramingArtifactSchema.parse>["payload"] | null;
  sheathing: ReturnType<typeof sheathingArtifactSchema.parse>["payload"] | null;
  validation: ReturnType<typeof validationArtifactSchema.parse>["payload"] | null;
  calculations: ReturnType<typeof framingCalculationsArtifactSchema.parse>["payload"] | null;
  takeoff: ReturnType<typeof finalFramingTakeoffArtifactSchema.parse>["payload"] | null;
  projectDictionary: ReturnType<typeof projectDictionaryArtifactSchema.parse>["payload"] | null;
};

async function readStageArtifact<T>(
  artifactPath: string,
  parser: (raw: unknown) => { payload: T },
): Promise<T | null> {
  try {
    const raw = JSON.parse(await readFile(artifactPath, "utf8"));
    return parser(raw).payload;
  } catch {
    return null;
  }
}

export async function loadAuditArtifactsFromRun(
  result: PipelineRunResult,
): Promise<LoadedAuditArtifacts | null> {
  if (!result.success) {
    return null;
  }

  const byName = new Map(result.stageResults.map((s) => [s.name, s]));

  const compiledStage = byName.get("compiledDrawingPages");
  const evidenceStage = byName.get("extractedEvidence");
  if (!compiledStage || !evidenceStage) {
    return null;
  }

  const compiledRaw = JSON.parse(
    await readFile(compiledStage.artifactPath, "utf8"),
  );
  const compiledPages = compiledDrawingPagesArtifactSchema.parse(compiledRaw).payload;

  const evidenceRaw = JSON.parse(
    await readFile(evidenceStage.artifactPath, "utf8"),
  );
  const evidence = extractedFramingEvidenceArtifactSchema.parse(evidenceRaw).payload
    .evidence as Evidence[];

  const reportStage = byName.get("report");
  const wallStage = byName.get("wallFraming");
  const openingsStage = byName.get("openings");
  const smStage = byName.get("structuralMembers");
  const floorStage = byName.get("floorFraming");
  const roofStage = byName.get("roofFraming");
  const sheathingStage = byName.get("sheathing");
  const validationStage = byName.get("validation");
  const calcStage = byName.get("calculations");

  let projectDictionary: LoadedAuditArtifacts["projectDictionary"] = null;
  const dictCompanion = compiledStage.companionArtifacts?.find(
    (c) => c.fileSuffix === "project-dictionary",
  );
  if (dictCompanion) {
    projectDictionary = await readStageArtifact(
      dictCompanion.artifactPath,
      projectDictionaryArtifactSchema.parse,
    );
  }

  return {
    compiledPages,
    evidence,
    wallFraming: wallStage
      ? await readStageArtifact(wallStage.artifactPath, wallFramingArtifactSchema.parse)
      : null,
    openings: openingsStage
      ? await readStageArtifact(openingsStage.artifactPath, openingsArtifactSchema.parse)
      : null,
    structuralMembers: smStage
      ? await readStageArtifact(smStage.artifactPath, structuralMembersArtifactSchema.parse)
      : null,
    floorFraming: floorStage
      ? await readStageArtifact(floorStage.artifactPath, floorFramingArtifactSchema.parse)
      : null,
    roofFraming: roofStage
      ? await readStageArtifact(roofStage.artifactPath, roofFramingArtifactSchema.parse)
      : null,
    sheathing: sheathingStage
      ? await readStageArtifact(sheathingStage.artifactPath, sheathingArtifactSchema.parse)
      : null,
    validation: validationStage
      ? await readStageArtifact(validationStage.artifactPath, validationArtifactSchema.parse)
      : null,
    calculations: calcStage
      ? await readStageArtifact(calcStage.artifactPath, framingCalculationsArtifactSchema.parse)
      : null,
    takeoff: reportStage
      ? await readStageArtifact(reportStage.artifactPath, finalFramingTakeoffArtifactSchema.parse)
      : null,
    projectDictionary,
  };
}

function countPropertyTraces(
  traces: readonly PropertyResolutionTrace[],
  propertyPaths: readonly string[],
): Array<{
  propertyPath: string;
  resolved: number;
  unresolved: number;
  conflict: number;
}> {
  return propertyPaths.map((propertyPath) => {
    const matching = traces.filter((t) => t.propertyPath === propertyPath);
    let resolved = 0;
    let unresolved = 0;
    let conflict = 0;
    for (const t of matching) {
      if (t.method === "unresolved") unresolved++;
      else if (t.method === "user-override") resolved++;
      else resolved++;
    }
    return { propertyPath, resolved, unresolved, conflict };
  });
}

export function collectResolutionCoverage(
  artifacts: LoadedAuditArtifacts,
): ResolutionCoverage {
  const wallTraces = artifacts.wallFraming?.walls.flatMap((w) => w.resolutionTraces) ?? [];
  const segmentTraces =
    artifacts.wallFraming?.segments.flatMap((s) => s.resolutionTraces) ?? [];

  return {
    walls: {
      count: artifacts.wallFraming?.walls.length ?? 0,
      segments: artifacts.wallFraming?.segments.length ?? 0,
      wallProperties: countPropertyTraces(wallTraces, WALL_PROPERTY_PATHS),
      segmentProperties: countPropertyTraces(segmentTraces, SEGMENT_PROPERTY_PATHS),
    },
    openings: { count: artifacts.openings?.openings.length ?? 0 },
    structuralMembers: {
      count: artifacts.structuralMembers?.structuralMembers.length ?? 0,
    },
    floorFraming: {
      systems: artifacts.floorFraming?.systems.length ?? 0,
      areas: artifacts.floorFraming?.areas.length ?? 0,
    },
    roofFraming: {
      systems: artifacts.roofFraming?.systems.length ?? 0,
      planes: artifacts.roofFraming?.planes.length ?? 0,
    },
    sheathing: {
      systems: artifacts.sheathing?.systems.length ?? 0,
      areas: artifacts.sheathing?.areas.length ?? 0,
    },
  };
}

export function collectMaterialOutputSummary(
  artifacts: LoadedAuditArtifacts,
): MaterialOutputSummary {
  const materials = artifacts.calculations?.materials ?? [];
  const byCategory: Record<string, number> = {};
  for (const m of materials) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
  }

  const allCategories = [
    "lumber",
    "engineered-wood",
    "structural-panel",
    "truss",
    "structural-steel",
    "blocking",
    "connector",
    "fastener",
    "hardware",
    "miscellaneous",
    "unknown",
  ];
  const present = Object.keys(byCategory);
  const absent = allCategories.filter((c) => !present.includes(c));

  return {
    lineItemCount: materials.length,
    byCategory,
    lineItems: materials.map((m) => ({
      id: m.id,
      category: m.category,
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      sourceObjectCount: m.sourceObjectIds.length,
    })),
    absentCategories: absent,
  };
}

export function collectAutomationCoverage(
  artifacts: LoadedAuditArtifacts,
): AutomationCoverage {
  const segments = artifacts.wallFraming?.segments ?? [];
  const walls = artifacts.wallFraming?.walls ?? [];
  const wallById = new Map(walls.map((w) => [w.id, w]));

  let segmentsWithLength = 0;
  let segmentsWithAssembly = 0;
  let segmentsCalculableStuds = 0;
  let segmentsCalculablePlates = 0;

  for (const segment of segments) {
    const wall = wallById.get(segment.parentWallId);
    if (!wall) continue;

    const lengthOk =
      segment.lengthFeet != null &&
      segment.resolutionTraces.some(
        (t) => t.propertyPath === "lengthFeet" && t.method !== "unresolved",
      );
    if (lengthOk) segmentsWithLength++;

    const assemblyOk =
      wall.assembly.studSize != null &&
      wall.assembly.studSpacingInches != null &&
      wall.assembly.plateCount != null;
    if (lengthOk && assemblyOk) segmentsWithAssembly++;

    if (lengthOk && assemblyOk && wall.assembly.studSize != null && wall.assembly.studSpacingInches != null) {
      segmentsCalculableStuds++;
    }
    if (lengthOk && assemblyOk && wall.assembly.plateCount != null) {
      segmentsCalculablePlates++;
    }
  }

  const materials = artifacts.calculations?.materials ?? [];
  const presentCategories: string[] = [...new Set(materials.map((m) => m.category))];
  const allCategories: string[] = [
    "lumber",
    "structural-panel",
    "connector",
    "fastener",
    "hardware",
    "blocking",
  ];

  return {
    denominatorExplanation:
      "Wall stud/plate calc requires segment lengthFeet + wall assembly.studSize + assembly.studSpacingInches + assembly.plateCount",
    segmentsWithLength,
    segmentsWithFullWallAssemblyForStuds: segmentsWithAssembly,
    segmentsCalculableStuds,
    segmentsCalculablePlates,
    materialCategoriesPresent: presentCategories,
    materialCategoriesAbsent: allCategories.filter((c) => !presentCategories.includes(c)),
  };
}

export async function collectGeometrySummary(
  artifacts: LoadedAuditArtifacts,
  repoRoot: string,
  allGroundTruthChecks?: readonly GroundTruthCheck[],
): Promise<GeometrySummary> {
  let pbgRunCount = 0;
  for (const page of artifacts.compiledPages.pages) {
    pbgRunCount += page.geometry.pbgRuns.length;
  }

  const lengthEvidence = artifacts.evidence.filter(
    (e) => e.propertyPath === "lengthFeet" && e.subjectKey.startsWith("physical-run:"),
  );

  let groundTruthChecks =
    allGroundTruthChecks?.filter((c) => c.checkId.startsWith("p4-")) ?? [];

  if (groundTruthChecks.length === 0) {
    const expected = await loadBecksteadP4Expected(repoRoot);
    groundTruthChecks = expected
      ? checkLengthEvidenceAgainstP4Truth(
          artifacts.evidence.map((e) => ({
            subjectKey: e.subjectKey,
            propertyPath: e.propertyPath,
            candidateValue: e.candidateValue,
            originalText: e.originalText ?? undefined,
          })),
          expected,
        )
      : [];
  }

  return {
    pbgRunCount,
    lengthEvidenceCount: lengthEvidence.length,
    physicalRunKeysWithLength: lengthEvidence.map((e) => e.subjectKey),
    groundTruthChecks,
  };
}

export function collectSemanticsSummary(
  artifacts: LoadedAuditArtifacts,
  groundTruthChecks: readonly GroundTruthCheck[] = [],
): SemanticsSummary {
  const evidenceByPassId: Record<string, number> = {};
  for (const e of artifacts.evidence) {
    const pass = e.extractionPassId ?? "unknown";
    evidenceByPassId[pass] = (evidenceByPassId[pass] ?? 0) + 1;
  }

  let scheduleDefs = 0;
  let dereferenceEmit = 0;
  for (const page of artifacts.compiledPages.pages) {
    scheduleDefs += page.semanticDefinitions?.definitions.length ?? 0;
    dereferenceEmit += page.semanticDereference?.metrics.emitCount ?? 0;
  }

  let semanticBindingsEmit = 0;
  for (const page of artifacts.compiledPages.pages) {
    semanticBindingsEmit += page.semanticBinding.emitBindingIds.length;
  }

  const wallsWithSemantic = artifacts.wallFraming?.walls.filter(
    (w) => w.semanticTypeKey != null,
  ).length ?? 0;

  const scheduleAndOwnershipChecks = groundTruthChecks.filter(
    (c) =>
      c.checkId.startsWith("schedule-") ||
      c.checkId.startsWith("o4-"),
  );

  return {
    evidenceByPassId,
    scheduleDefinitionsOnCompile: scheduleDefs,
    projectDictionaryBindings: artifacts.projectDictionary?.bindings?.length ?? 0,
    semanticBindingsEmit,
    dereferenceEmit,
    wallsWithSemanticTypeKey: wallsWithSemantic,
    groundTruthChecks: scheduleAndOwnershipChecks,
  };
}

export function collectRuntimeCost(
  result: PipelineRunResult,
  totalDurationMs: number,
  artifacts: LoadedAuditArtifacts | null,
  mode?: AuditRunMode,
  claudeUsage?: { calls: number; inputTokens: number; outputTokens: number },
): RuntimeCost {
  const perStageMs: Record<string, number> = {};
  for (const stage of result.stageResults) {
    perStageMs[stage.name] = 0;
  }

  const estimatedTokens =
    claudeUsage != null
      ? claudeUsage.inputTokens + claudeUsage.outputTokens
      : undefined;

  return {
    totalDurationMs,
    perStageMs,
    compiledPageCount: artifacts?.compiledPages.pages.length ?? 0,
    ...(mode === "B" && claudeUsage
      ? {
          claudeCalls: claudeUsage.calls,
          estimatedTokens,
          estimatedCostUsd:
            estimatedTokens != null
              ? Number(((estimatedTokens / 1_000_000) * 15).toFixed(4))
              : undefined,
        }
      : {}),
  };
}

export function countReviewWorkspace(
  artifacts: LoadedAuditArtifacts,
): { activeReviewItems: number; resolvedByDecision: number } {
  if (!artifacts.validation || !artifacts.calculations) {
    return { activeReviewItems: 0, resolvedByDecision: 0 };
  }

  const workspace = projectFramingReviewWorkspace({
    validation: artifacts.validation,
    calculations: artifacts.calculations,
    openings: artifacts.openings ?? { openings: [] },
    structuralMembers: artifacts.structuralMembers ?? { structuralMembers: [] },
    wallFraming: artifacts.wallFraming ?? undefined,
    floorFraming: artifacts.floorFraming ?? undefined,
    roofFraming: artifacts.roofFraming ?? undefined,
    sheathing: artifacts.sheathing ?? undefined,
  });

  return {
    activeReviewItems: workspace.summary.activeReviewItemCount,
    resolvedByDecision: workspace.summary.resolvedByUserDecisionCount,
  };
}
