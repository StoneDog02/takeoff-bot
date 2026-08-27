import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { confidenceArtifactSchema } from "../schemas/framing-artifacts.schema.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  floorFramingArtifactSchema,
  framingCalculationsArtifactSchema,
  openingsArtifactSchema,
  roofFramingArtifactSchema,
  sheathingArtifactSchema,
  structuralMembersArtifactSchema,
  validationArtifactSchema,
  wallFramingArtifactSchema,
} from "../schemas/framing-artifacts.schema.js";
import { extractionBudgetAuditArtifactSchema } from "../schemas/framing-artifacts.schema.js";
import { projectReviewRootCauses } from "../review-workspace/projectReviewRootCauses.js";
import {
  buildResolvedObjectIndex,
  projectFramingReviewWorkspace,
} from "../review-workspace/projectFramingReviewWorkspace.js";
import type { FramingResolvedObject } from "../review-workspace/readResolvedPropertyValue.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import type { ExtractionBudgetAudit } from "../extraction/extractionBudgetAudit.schema.js";
import type { PlanReferenceTrace } from "../extraction/planReferenceTrace.schema.js";
import { planReferenceTraceSchema } from "../extraction/planReferenceTrace.schema.js";
import {
  framingPackageProductStateSchema,
  type FirstBrokenHandoff,
  type FramingPackageProductState,
  type PackageProductStateRow,
} from "./framingPackageProductState.schema.js";
import { buildFloorProductFunnel } from "./floorCalculatorReadiness.js";

export type LoadedFramingRunArtifacts = {
  evidence: Evidence[];
  wallFraming: ReturnType<typeof wallFramingArtifactSchema.parse>["payload"] | null;
  openings: ReturnType<typeof openingsArtifactSchema.parse>["payload"] | null;
  structuralMembers: ReturnType<
    typeof structuralMembersArtifactSchema.parse
  >["payload"] | null;
  floorFraming: ReturnType<typeof floorFramingArtifactSchema.parse>["payload"] | null;
  roofFraming: ReturnType<typeof roofFramingArtifactSchema.parse>["payload"] | null;
  sheathing: ReturnType<typeof sheathingArtifactSchema.parse>["payload"] | null;
  validation: ReturnType<typeof validationArtifactSchema.parse>["payload"] | null;
  calculations: ReturnType<
    typeof framingCalculationsArtifactSchema.parse
  >["payload"] | null;
  confidence: ReturnType<typeof confidenceArtifactSchema.parse>["payload"] | null;
  takeoff: ReturnType<typeof finalFramingTakeoffArtifactSchema.parse>["payload"] | null;
  extractionAudit: ExtractionBudgetAudit | null;
  planReferenceTrace: PlanReferenceTrace | null;
};

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function findStageFile(
  runDir: string,
  stageOrder: string,
  stageName: string,
): Promise<string | null> {
  const exact = path.join(runDir, `${stageOrder}-${stageName}.json`);
  try {
    await readFile(exact, "utf8");
    return exact;
  } catch {
    const entries = await readdir(runDir);
    const match = entries.find(
      (name) => name.startsWith(`${stageOrder}-`) && name.endsWith(`-${stageName}.json`),
    );
    return match ? path.join(runDir, match) : null;
  }
}

async function findCompanionFile(
  runDir: string,
  stageOrder: string,
  suffix: string,
): Promise<string | null> {
  const entries = await readdir(runDir);
  const match = entries.find(
    (name) => name.startsWith(`${stageOrder}-`) && name.endsWith(`.${suffix}.json`),
  );
  return match ? path.join(runDir, match) : null;
}

export async function loadFramingRunArtifactsFromDirectory(
  runDir: string,
): Promise<LoadedFramingRunArtifacts | null> {
  const evidencePath = await findStageFile(runDir, "06", "extractedEvidence");
  if (!evidencePath) {
    return null;
  }

  const evidenceRaw = await readJsonFile(evidencePath);
  if (!evidenceRaw) {
    return null;
  }
  const evidence = extractedFramingEvidenceArtifactSchema.parse(evidenceRaw).payload
    .evidence as Evidence[];

  async function loadStage<T>(
    order: string,
    name: string,
    parser: (raw: unknown) => { payload: T },
  ): Promise<T | null> {
    const filePath = await findStageFile(runDir, order, name);
    if (!filePath) {
      return null;
    }
    const raw = await readJsonFile(filePath);
    if (!raw) {
      return null;
    }
    return parser(raw).payload;
  }

  const extractionCompanion = await findCompanionFile(
    runDir,
    "06",
    "extraction-work-units",
  );
  let extractionAudit: ExtractionBudgetAudit | null = null;
  if (extractionCompanion) {
    const raw = await readJsonFile(extractionCompanion);
    if (raw) {
      extractionAudit = extractionBudgetAuditArtifactSchema.parse(raw).payload;
    }
  }

  const planRefCompanion = await findCompanionFile(
    runDir,
    "06",
    "plan-reference-queue",
  );
  let planReferenceTrace: PlanReferenceTrace | null = null;
  if (planRefCompanion) {
    const raw = await readJsonFile(planRefCompanion);
    if (raw) {
      planReferenceTrace = planReferenceTraceSchema.parse(
        (raw as { payload?: unknown }).payload ?? raw,
      );
    }
  }

  return {
    evidence,
    wallFraming: await loadStage("07", "wallFraming", wallFramingArtifactSchema.parse),
    openings: await loadStage("08", "openings", openingsArtifactSchema.parse),
    structuralMembers: await loadStage(
      "09",
      "structuralMembers",
      structuralMembersArtifactSchema.parse,
    ),
    sheathing: await loadStage("10", "sheathing", sheathingArtifactSchema.parse),
    floorFraming: await loadStage("11", "floorFraming", floorFramingArtifactSchema.parse),
    roofFraming: await loadStage("12", "roofFraming", roofFramingArtifactSchema.parse),
    validation: await loadStage("13", "validation", validationArtifactSchema.parse),
    calculations: await loadStage("14", "calculations", framingCalculationsArtifactSchema.parse),
    confidence: await loadStage("15", "confidence", confidenceArtifactSchema.parse),
    takeoff: await loadStage("16", "report", finalFramingTakeoffArtifactSchema.parse),
    extractionAudit,
    planReferenceTrace,
  };
}

function countEvidenceBySubjectKind(
  evidence: readonly Evidence[],
  kinds: readonly string[],
): number {
  return evidence.filter((record) => kinds.includes(record.subjectKind)).length;
}

function countUnresolvedObjects(
  objects: ReadonlyArray<{ resolutionTraces: readonly { method: string }[] }>,
): number {
  return objects.filter((object) =>
    object.resolutionTraces.some((trace) => trace.method === "unresolved"),
  ).length;
}

function countConfidenceForTypes(
  confidence: LoadedFramingRunArtifacts["confidence"],
  objectTypes: readonly string[],
): number {
  if (!confidence) {
    return 0;
  }
  return confidence.confidenceEvaluations.filter(
    (evaluation) =>
      evaluation.target.kind === "object" &&
      objectTypes.includes(evaluation.target.objectType),
  ).length;
}

function countReviewForPackage(
  validation: LoadedFramingRunArtifacts["validation"],
  objectTypePrefixes: readonly string[],
): number {
  if (!validation) {
    return 0;
  }
  return validation.reviewItems.filter((item) =>
    item.affectedObjects.some((affected) =>
      objectTypePrefixes.some((prefix) =>
        affected.objectType.startsWith(prefix),
      ),
    ),
  ).length;
}

const PACKAGE_BY_OBJECT_DOMAIN: Record<
  FramingResolvedObject["objectDomain"],
  string
> = {
  "wall-segment": "Walls",
  "building-wall": "Walls",
  opening: "Openings",
  "structural-member": "Structural",
  "floor-framing-system": "Floor",
  "floor-framing-area": "Floor",
  "sheathing-system": "Sheathing",
  "sheathing-area": "Sheathing",
  "roof-framing-system": "Roof",
  "roof-plane": "Roof",
};

function packageForMaterialLine(
  line: FramingMaterialLineItem,
  resolvedObjectIndex: ReadonlyMap<string, FramingResolvedObject>,
): string | null {
  for (const sourceObjectId of line.sourceObjectIds ?? []) {
    const resolved = resolvedObjectIndex.get(sourceObjectId);
    if (resolved) {
      return PACKAGE_BY_OBJECT_DOMAIN[resolved.objectDomain] ?? null;
    }
  }
  return null;
}

function countStage16LinesBySourceObjectAttribution(input: {
  calculations: LoadedFramingRunArtifacts["calculations"];
  wallFraming: LoadedFramingRunArtifacts["wallFraming"];
  openings: LoadedFramingRunArtifacts["openings"];
  structuralMembers: LoadedFramingRunArtifacts["structuralMembers"];
  floorFraming: LoadedFramingRunArtifacts["floorFraming"];
  roofFraming: LoadedFramingRunArtifacts["roofFraming"];
  sheathing: LoadedFramingRunArtifacts["sheathing"];
}): Record<string, number> {
  if (!input.calculations) {
    return {};
  }

  const resolvedObjectIndex = buildResolvedObjectIndex({
    validation: { validationIssues: [], reviewItems: [], validationResults: [] },
    calculations: input.calculations,
    openings: input.openings ?? { openings: [] },
    structuralMembers: input.structuralMembers ?? { structuralMembers: [] },
    wallFraming: input.wallFraming ?? undefined,
    floorFraming: input.floorFraming ?? undefined,
    roofFraming: input.roofFraming ?? undefined,
    sheathing: input.sheathing ?? undefined,
  });

  const counts: Record<string, number> = {};
  for (const line of input.calculations.materials) {
    const pkg = packageForMaterialLine(line, resolvedObjectIndex);
    if (pkg) {
      counts[pkg] = (counts[pkg] ?? 0) + 1;
    }
  }
  return counts;
}

function countStage16LinesByCategory(
  calculations: LoadedFramingRunArtifacts["calculations"],
  categories: readonly string[],
): number {
  if (!calculations) {
    return 0;
  }
  return calculations.materials.filter((line) =>
    categories.includes(line.category),
  ).length;
}

function inferFirstBrokenHandoff(input: {
  productionState: "WIRED" | "DOMAIN_PIPELINE_UNWIRED" | "NOT_REACHED";
  evidence: number;
  materialized: number;
  resolved: number;
  calcEligible: number;
  calculatorReady?: number;
  stage16Lines: number;
  assumed: number;
}): FirstBrokenHandoff | null {
  if (input.productionState === "DOMAIN_PIPELINE_UNWIRED") {
    return "DOMAIN_PIPELINE_UNWIRED";
  }
  if (input.productionState === "NOT_REACHED") {
    return null;
  }
  if (input.evidence === 0) {
    return "ROUTED_NOT_EXTRACTED";
  }
  if (input.materialized === 0) {
    return "EVIDENCE_NOT_MATERIALIZED";
  }
  if (input.resolved === 0) {
    return "MATERIALIZED_NOT_RESOLVED";
  }
  const readiness =
    input.calculatorReady !== undefined ? input.calculatorReady : input.calcEligible;
  if (readiness === 0 && input.assumed === 0) {
    return "CALCULATOR_STARVED";
  }
  if (input.stage16Lines === 0 && readiness > 0) {
    return "CALCULATOR_STARVED";
  }
  if (input.stage16Lines > 0) {
    return null;
  }
  return "CALCULATOR_STARVED";
}

function buildPackageRow(input: {
  package: string;
  productionState: "WIRED" | "DOMAIN_PIPELINE_UNWIRED" | "NOT_REACHED";
  detected: number;
  evidence: number;
  materialized: number;
  resolved: number;
  assumed: number;
  calcEligible: number;
  calculatorReady?: number;
  materialLines?: number;
  productFunnel?: PackageProductStateRow["productFunnel"];
  confidence: number;
  review: number;
  stage16Lines: number;
}): PackageProductStateRow {
  const na =
    input.productionState === "DOMAIN_PIPELINE_UNWIRED" ||
    input.productionState === "NOT_REACHED";
  return {
    package: input.package,
    productionState: input.productionState,
    detected: na ? "N/A" : input.detected,
    evidence: na ? "N/A" : input.evidence,
    materialized: na ? "N/A" : input.materialized,
    resolved: na ? "N/A" : input.resolved,
    assumed: na ? "N/A" : input.assumed,
    calcEligible: na ? "N/A" : input.calcEligible,
    calculatorReady:
      input.calculatorReady === undefined
        ? undefined
        : na
          ? "N/A"
          : input.calculatorReady,
    materialLines:
      input.materialLines === undefined
        ? undefined
        : na
          ? "N/A"
          : input.materialLines,
    productFunnel: na ? undefined : input.productFunnel,
    confidence: na ? "N/A" : input.confidence,
    review: na ? "N/A" : input.review,
    stage16Lines: na ? "N/A" : input.stage16Lines,
    firstBrokenHandoff:
      input.productionState === "DOMAIN_PIPELINE_UNWIRED"
        ? "DOMAIN_PIPELINE_UNWIRED"
        : input.productionState === "NOT_REACHED"
          ? null
          : inferFirstBrokenHandoff(input),
  };
}

export function buildFramingPackageProductState(input: {
  runLabel: string;
  artifacts: LoadedFramingRunArtifacts;
}): FramingPackageProductState {
  const { artifacts } = input;
  const evidence = artifacts.evidence;

  const bySubjectKind: Record<string, number> = {};
  const byProvenance: Record<string, number> = {};
  for (const record of evidence) {
    bySubjectKind[record.subjectKind] = (bySubjectKind[record.subjectKind] ?? 0) + 1;
    const pass = record.extractionPassId ?? "non-claude";
    byProvenance[pass] = (byProvenance[pass] ?? 0) + 1;
  }

  const intentsExecuted = artifacts.extractionAudit?.intents ?? [];
  const pagesByIntent: Record<string, number[]> = {};
  const brainPacksByIntent: Record<string, string[]> = {};
  for (const unit of artifacts.extractionAudit?.workUnits ?? []) {
    const pages = pagesByIntent[unit.intent] ?? [];
    for (const pageNumber of unit.orderedPageNumbers) {
      if (!pages.includes(pageNumber)) {
        pages.push(pageNumber);
      }
    }
    pagesByIntent[unit.intent] = pages.sort((a, b) => a - b);
    if (unit.brainPackPaths?.length) {
      brainPacksByIntent[unit.intent] = [...unit.brainPackPaths];
    }
  }

  const walls = artifacts.wallFraming;
  const openings = artifacts.openings;
  const sm = artifacts.structuralMembers;
  const floor = artifacts.floorFraming;
  const roof = artifacts.roofFraming;
  const sheathing = artifacts.sheathing;
  const validation = artifacts.validation;
  const calculations = artifacts.calculations;
  const confidence = artifacts.confidence;

  const stage16LinesByPackage = countStage16LinesBySourceObjectAttribution({
    calculations,
    wallFraming: walls,
    openings,
    structuralMembers: sm,
    floorFraming: floor,
    roofFraming: roof,
    sheathing,
  });

  const wallEvidence = countEvidenceBySubjectKind(evidence, [
    "building-wall",
    "wall-segment",
    "physical-run",
  ]);
  const openingEvidence = countEvidenceBySubjectKind(evidence, ["opening"]);
  const smEvidence = countEvidenceBySubjectKind(evidence, ["structural-member"]);
  const floorEvidence = countEvidenceBySubjectKind(evidence, [
    "floor-framing-system",
    "floor-framing-area",
  ]);
  const roofEvidence = countEvidenceBySubjectKind(evidence, [
    "roof-framing-system",
    "roof-plane",
  ]);
  const sheathingEvidence = countEvidenceBySubjectKind(evidence, [
    "sheathing-system",
    "sheathing-area",
  ]);

  const wallSegmentsCalcEligible =
    walls?.segments.filter(
      (segment) =>
        segment.lengthFeet != null &&
        !segment.resolutionTraces.some(
          (trace) =>
            trace.propertyPath === "lengthFeet" && trace.method === "unresolved",
        ),
    ).length ?? 0;

  const floorStage16Lines = stage16LinesByPackage.Floor ?? 0;
  const floorFunnel =
    floor && calculations
      ? buildFloorProductFunnel({
          floorFraming: floor,
          validation: validation ?? undefined,
          materials: calculations.materials,
          stage16FloorLines: floorStage16Lines,
        })
      : null;

  const packages: PackageProductStateRow[] = [
    buildPackageRow({
      package: "Walls",
      productionState: walls ? "WIRED" : "NOT_REACHED",
      detected: walls?.walls.length ?? 0,
      evidence: wallEvidence,
      materialized: (walls?.walls.length ?? 0) + (walls?.segments.length ?? 0),
      resolved:
        (walls?.walls.length ?? 0) +
        (walls?.segments.length ?? 0) -
        countUnresolvedObjects(walls?.walls ?? []) -
        countUnresolvedObjects(walls?.segments ?? []),
      assumed: 0,
      calcEligible: wallSegmentsCalcEligible,
      confidence: countConfidenceForTypes(confidence, [
        "building-wall",
        "wall-segment",
      ]),
      review: countReviewForPackage(validation, ["building-wall", "wall-segment"]),
      stage16Lines: stage16LinesByPackage.Walls ?? 0,
    }),
    buildPackageRow({
      package: "Openings",
      productionState: openings ? "WIRED" : "NOT_REACHED",
      detected: openings?.openings.length ?? 0,
      evidence: openingEvidence,
      materialized: openings?.openings.length ?? 0,
      resolved:
        (openings?.openings.length ?? 0) -
        countUnresolvedObjects(openings?.openings ?? []),
      assumed: 0,
      calcEligible: 0,
      confidence: countConfidenceForTypes(confidence, ["opening"]),
      review: countReviewForPackage(validation, ["opening"]),
      stage16Lines: stage16LinesByPackage.Openings ?? 0,
    }),
    buildPackageRow({
      package: "Floor",
      productionState: floor ? "WIRED" : "NOT_REACHED",
      detected:
        (floor?.systems.length ?? 0) + (floor?.areas.length ?? 0),
      evidence: floorEvidence,
      materialized:
        (floor?.systems.length ?? 0) + (floor?.areas.length ?? 0),
      resolved:
        (floor?.systems.length ?? 0) +
        (floor?.areas.length ?? 0) -
        countUnresolvedObjects(floor?.systems ?? []) -
        countUnresolvedObjects(floor?.areas ?? []),
      assumed: 0,
      calcEligible: floor?.areas.length ?? 0,
      calculatorReady: floorFunnel?.calculatorReady,
      materialLines: floorFunnel?.stage16MaterialLines ?? floorStage16Lines,
      productFunnel: floorFunnel ?? undefined,
      confidence: countConfidenceForTypes(confidence, [
        "floor-framing-system",
        "floor-framing-area",
      ]),
      review: countReviewForPackage(validation, ["floor-framing"]),
      stage16Lines: floorStage16Lines,
    }),
    buildPackageRow({
      package: "Structural",
      productionState: sm ? "WIRED" : "NOT_REACHED",
      detected: sm?.structuralMembers.length ?? 0,
      evidence: smEvidence,
      materialized: sm?.structuralMembers.length ?? 0,
      resolved:
        (sm?.structuralMembers.length ?? 0) -
        countUnresolvedObjects(sm?.structuralMembers ?? []),
      assumed: 0,
      calcEligible: sm?.structuralMembers.filter((m) => m.lengthFeet != null)
        .length ?? 0,
      confidence: countConfidenceForTypes(confidence, ["structural-member"]),
      review: countReviewForPackage(validation, ["structural-member"]),
      stage16Lines: stage16LinesByPackage.Structural ?? 0,
    }),
    buildPackageRow({
      package: "Sheathing",
      productionState: sheathing ? "WIRED" : "NOT_REACHED",
      detected:
        (sheathing?.systems.length ?? 0) + (sheathing?.areas.length ?? 0),
      evidence: sheathingEvidence,
      materialized:
        (sheathing?.systems.length ?? 0) + (sheathing?.areas.length ?? 0),
      resolved:
        (sheathing?.systems.length ?? 0) +
        (sheathing?.areas.length ?? 0) -
        countUnresolvedObjects(sheathing?.systems ?? []) -
        countUnresolvedObjects(sheathing?.areas ?? []),
      assumed: 0,
      calcEligible: sheathing?.areas.length ?? 0,
      confidence: countConfidenceForTypes(confidence, [
        "sheathing-system",
        "sheathing-area",
      ]),
      review: countReviewForPackage(validation, ["sheathing"]),
      stage16Lines: stage16LinesByPackage.Sheathing ?? 0,
    }),
    buildPackageRow({
      package: "Roof",
      productionState: roof ? "WIRED" : "NOT_REACHED",
      detected: (roof?.systems.length ?? 0) + (roof?.planes.length ?? 0),
      evidence: roofEvidence,
      materialized: (roof?.systems.length ?? 0) + (roof?.planes.length ?? 0),
      resolved:
        (roof?.systems.length ?? 0) +
        (roof?.planes.length ?? 0) -
        countUnresolvedObjects(roof?.systems ?? []) -
        countUnresolvedObjects(roof?.planes ?? []),
      assumed: 0,
      calcEligible: roof?.planes.length ?? 0,
      confidence: countConfidenceForTypes(confidence, [
        "roof-framing-system",
        "roof-plane",
      ]),
      review: countReviewForPackage(validation, ["roof"]),
      stage16Lines: stage16LinesByPackage.Roof ?? 0,
    }),
    buildPackageRow({
      package: "Blocking",
      productionState: "DOMAIN_PIPELINE_UNWIRED",
      detected: 0,
      evidence: 0,
      materialized: 0,
      resolved: 0,
      assumed: 0,
      calcEligible: 0,
      confidence: 0,
      review: 0,
      stage16Lines: 0,
    }),
    buildPackageRow({
      package: "Connectors",
      productionState: "DOMAIN_PIPELINE_UNWIRED",
      detected: 0,
      evidence: 0,
      materialized: 0,
      resolved: 0,
      assumed: 0,
      calcEligible: 0,
      confidence: 0,
      review: 0,
      stage16Lines: 0,
    }),
    buildPackageRow({
      package: "Hardware",
      productionState: "DOMAIN_PIPELINE_UNWIRED",
      detected: 0,
      evidence: 0,
      materialized: 0,
      resolved: 0,
      assumed: 0,
      calcEligible: 0,
      confidence: 0,
      review: 0,
      stage16Lines: 0,
    }),
    buildPackageRow({
      package: "Fasteners",
      productionState: "DOMAIN_PIPELINE_UNWIRED",
      detected: 0,
      evidence: 0,
      materialized: 0,
      resolved: 0,
      assumed: 0,
      calcEligible: 0,
      confidence: 0,
      review: 0,
      stage16Lines: countStage16LinesByCategory(calculations, ["fastener"]),
    }),
  ];

  let primaryQueueCount: number | null = null;
  if (validation && walls && openings) {
    const rootCauses = projectReviewRootCauses({
      validation,
      openings,
      wallFraming: walls,
      floorFraming: floor ?? undefined,
    });
    primaryQueueCount = rootCauses.primaryQueue.length;
  }

  let activeReviewItems = 0;
  if (validation && calculations) {
    const workspace = projectFramingReviewWorkspace({
      validation,
      calculations,
      openings: openings ?? { openings: [] },
      structuralMembers: sm ?? { structuralMembers: [] },
      wallFraming: walls ?? undefined,
      floorFraming: floor ?? undefined,
      roofFraming: roof ?? undefined,
      sheathing: sheathing ?? undefined,
    });
    activeReviewItems = workspace.summary.activeReviewItemCount;
  }

  const quantitiesByPackage: Record<string, number> = {};
  for (const pkg of packages) {
    if (typeof pkg.stage16Lines === "number") {
      quantitiesByPackage[pkg.package] = pkg.stage16Lines;
    }
  }

  return framingPackageProductStateSchema.parse({
    runLabel: input.runLabel,
    capturedAt: new Date().toISOString(),
    evidence: {
      totalCount: evidence.length,
      bySubjectKind,
      byProvenance,
    },
    extraction: {
      intentsExecuted,
      pagesByIntent,
      brainPacksByIntent,
    },
    planReference: {
      discovered: artifacts.planReferenceTrace?.inventoryReferenceCount ?? 0,
      queued: artifacts.planReferenceTrace?.queue.items.length ?? 0,
      followed: artifacts.planReferenceTrace?.followUp.referencesFollowed ?? 0,
      skipped: artifacts.planReferenceTrace?.followUp.referencesSkipped ?? 0,
    },
    assumptions: {
      count: calculations?.assumptions?.length ?? 0,
    },
    review: {
      rawReviewItemCount: validation?.reviewItems.length ?? 0,
      activeReviewItems,
      primaryQueueCount,
    },
    stage16: {
      materialLineCount: calculations?.materials.length ?? 0,
      quantitiesByPackage,
    },
    packages,
  });
}
