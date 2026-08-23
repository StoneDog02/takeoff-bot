import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { detectDimStringCandidates } from "./dimensions/detectDimCandidates.js";
import { rankDimOwnership } from "./dimensions/rankDimOwnership.js";
import {
  collapseParallelLanes,
  mergeCollinearOpeningSafe,
  annotateJunctions,
  annotateNearMissCorners,
  scoreAuthority,
  boostAuthorityFromJunctions,
  applyStubThroughAuthority,
  type B22DRun,
  type PbgRun,
} from "./pbg/consolidatePhysicalRuns.js";
import {
  compiledDrawingPageSchema,
  type CompiledDrawingPage,
} from "./schemas/compiledDrawingPage.schema.js";
import {
  extractSegments,
  filterFaceCandidates,
  discoverGapModes,
  pairWithinModes,
  buildRunsFromPairs,
  type PhysicalWallRunCandidate,
} from "./sgg/extractSegments.js";
import { extractTextPrimitives } from "./text/extractTextPrimitives.js";
import {
  resolveTranscriptions,
  createOcrWorker,
  estimatePtPerFtFromScaleText,
  estimatePtPerFtFromDimTextPairs,
  virtualDimsFromText,
  augmentDimCandidatesNearHighRuns,
  tagDetectedDims,
  UNIQUENESS_MIN,
  LENGTH_RATIO_MIN,
  type SourcedDimCandidate,
  type OcrWorker,
} from "./transcription/resolveTranscriptions.js";
import { classifyCompilerPageRole } from "./page-role/classifyCompilerPageRole.js";
import { governWallPlanLengthObservations,
  type GovernableAssoc,
} from "./governance/governWallPlanLengthObservations.js";
import { governPhysicalRunSemanticBindings } from "./governance/governPhysicalRunSemanticBindings.js";
import { recordTopologicalPropagationOpportunities } from "./governance/recordTopologicalPropagationOpportunities.js";
import { detectTypeIdentifierPrimitives } from "./type-marks/detectTypeIdentifierPrimitives.js";
import { rankTypeMarkOwnership } from "./type-marks/rankTypeMarkOwnership.js";
import { parseImperialLengthToFeet } from "./units/parseImperialLengthToFeet.js";
import { isSemanticMarkRecoveryEnabled } from "./semantic-mark-recovery/isSemanticMarkRecoveryEnabled.js";
import {
  mergeTypeMarkSources,
  recoverSemanticMarkObservations,
  typeMarksFromObservations,
} from "./semantic-mark-recovery/recoverSemanticMarkObservations.js";
import { buildPageGeometryContext } from "./semantic-mark-recovery/auditVisualMarkPage.js";
import type { SemanticMarkRecoveryBlock } from "./semantic-mark-recovery/semanticMarkObservation.schema.js";
import { isSemanticDefinitionExtractionEnabled } from "./semantic-definitions/isSemanticDefinitionExtractionEnabled.js";
import { extractScheduleDefinitions } from "./semantic-definitions/extractScheduleDefinitions.js";
import type { SemanticDefinition } from "./schemas/semanticDefinition.schema.js";
import { recoverPlanSemanticReferences } from "./plan-annotations/recoverPlanSemanticReferences.js";
import { recoverGraphicConventionReferences } from "./plan-annotations/recoverGraphicConventionReferences.js";
import type { ProjectOrientationContext } from "../project-interpreter/projectOrientationContext.js";
import {
  crossPageDefinitionsFromContext,
} from "../project-interpreter/projectOrientationContext.js";
import {
  loadPhase0ReferenceDecision,
  resolveReferenceMechanismFromEnv,
} from "./semantic-dereference/loadPhase0ReferenceDecision.js";
import type { ReferenceMechanism } from "./semantic-dereference/referenceMechanism.schema.js";
import {
  dereferenceSemanticBindings,
  type DereferencedSemanticBinding,
} from "./semantic-dereference/dereferenceSemanticBindings.js";
import { governDereferencedBindings } from "./semantic-dereference/governDereferencedBindings.js";
import { isB2_2L3ProofEnabled } from "./semantic-definitions/isSemanticDefinitionExtractionEnabled.js";

function shouldExtractScheduleDefinitions(
  pageNumber: number,
  pageRole: { role: string },
): boolean {
  if (!isSemanticDefinitionExtractionEnabled()) return false;
  const pages = process.env.TAKEOFF_SCHEDULE_PAGE_NUMBERS?.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (pages && pages.length > 0) return pages.includes(pageNumber);
  return pageRole.role !== "plan";
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function footprintFromRuns(runs: B22DRun[] | PbgRun[]) {
  const v = runs.filter((r) => r.orientation === "V");
  const h = runs.filter((r) => r.orientation === "H");
  const useV = v.length >= 2 ? v : runs;
  const xs = useV.flatMap((r) => [r.centerline.x1, r.centerline.x2, r.mid.x]);
  const ys = useV.flatMap((r) => [r.centerline.y1, r.centerline.y2, r.mid.y]);
  if (h.length > 0) {
    xs.push(...h.flatMap((r) => [r.centerline.x1, r.centerline.x2]));
    ys.push(...h.flatMap((r) => [r.centerline.y1, r.centerline.y2]));
  }
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

export type CompileDrawingPageOptions = {
  maxOcr?: number;
  smoke?: boolean;
  /** When set, caller owns worker lifecycle (tests may inject a mock). */
  ocrWorker?: OcrWorker;
  /** Optional crop directory; defaults to a temp dir under os.tmpdir(). */
  cropsDir?: string;
  /** Skip virtual-text dim augmentation (metrics-only dims). */
  skipVirtualDims?: boolean;
  /** B2.2L.3 — schedule definitions from other pages for plan-side dereference. */
  crossPageDefinitions?: readonly SemanticDefinition[];
  /** B2.2L.7 — governed project orientation (semantic paths only). */
  orientationContext?: ProjectOrientationContext;
  /** B2.2L.3 — override Phase 0 reference mechanism decision. */
  referenceMechanism?: ReferenceMechanism;
};

/**
 * Single-page drawing compiler orchestrator (B2.2I algorithms, production module).
 * Claude=0. Scope-agnostic geometry + transcription + governance audit.
 */
export async function compileDrawingPage(opts: {
  pdfPath: string;
  pageNumber: number;
  options?: CompileDrawingPageOptions;
}): Promise<CompiledDrawingPage> {
  const tAll = performance.now();
  const { pdfPath, pageNumber } = opts;
  const {
    maxOcr = 30,
    smoke = false,
    ocrWorker: injectedWorker,
    cropsDir: cropsDirOpt,
    skipVirtualDims = false,
    crossPageDefinitions: crossPageDefinitionsOpt = [],
    orientationContext,
    referenceMechanism: referenceMechanismOpt,
  } = opts.options ?? {};
  const crossPageDefinitions =
    crossPageDefinitionsOpt.length > 0
      ? crossPageDefinitionsOpt
      : crossPageDefinitionsFromContext(orientationContext);

  const textLayer = await extractTextPrimitives(pdfPath, pageNumber);
  const pageRole = classifyCompilerPageRole(textLayer.primitives, {
    rawItemCount: textLayer.rawItemCount,
  });

  const extracted = await extractSegments(pdfPath, pageNumber);
  const { pageWidth, pageHeight, segments } = extracted;
  const faces = filterFaceCandidates(segments, pageWidth, pageHeight);
  const byId = new Map(segments.map((s) => [s.id, s]));
  const hModes = discoverGapModes(faces, "H");
  const vModes = discoverGapModes(faces, "V");
  const pairs = [
    ...pairWithinModes(faces, hModes.modes, "H"),
    ...pairWithinModes(faces, vModes.modes, "V"),
  ];
  const physicalRuns = buildRunsFromPairs(pairs, byId, pageNumber);
  const asB22d: B22DRun[] = physicalRuns.map((r: PhysicalWallRunCandidate) => ({
    ...r,
    junctions: r.junctions,
  }));
  const lanes = collapseParallelLanes(asB22d);
  const merged = mergeCollinearOpeningSafe(lanes);
  let scored = scoreAuthority(merged, pageWidth);
  const juncTol = Math.max(
    18,
    median(merged.map((r) => r.thicknessPt ?? 5)) * 1.5,
  );
  annotateJunctions(scored, juncTol);
  annotateNearMissCorners(scored, 250, juncTol);
  boostAuthorityFromJunctions(scored);
  let rejected = scored.filter((r) => r.wallAuthority === "reject");
  let pbg = scored.filter((r) => r.wallAuthority !== "reject");
  const stub = applyStubThroughAuthority(pbg, rejected, { furnitureFpIds: [] });
  pbg = stub.pbg;
  rejected = stub.rejected;

  const footprint = footprintFromRuns(pbg.length >= 4 ? pbg : merged);
  let dims: SourcedDimCandidate[] = augmentDimCandidatesNearHighRuns(
    segments,
    tagDetectedDims(detectDimStringCandidates(segments, footprint)),
    pbg,
  );

  const ownsWorker = injectedWorker == null;
  const worker = injectedWorker ?? (await createOcrWorker());
  const cropsDir =
    cropsDirOpt ??
    (await mkdtemp(path.join(os.tmpdir(), "takeoff-compiler-crops-")));
  const tTx = performance.now();
  let transcriptions = await resolveTranscriptions({
    dims,
    imperialTexts: textLayer.imperialCandidates,
    allPrimitives: textLayer.primitives,
    pdfPath,
    pageNumber,
    pageWidth,
    pageHeight,
    cropsDir,
    worker,
    maxOcr: smoke ? 4 : maxOcr,
  });

  const usedTextIds = new Set(
    transcriptions
      .filter((t) => t.textPrimitiveId)
      .map((t) => t.textPrimitiveId!),
  );
  const ptPerFt =
    estimatePtPerFtFromDimTextPairs(dims, transcriptions) ??
    estimatePtPerFtFromScaleText(textLayer.primitives);
  if (ptPerFt != null && !smoke && !skipVirtualDims) {
    const virtuals = virtualDimsFromText(
      textLayer.imperialCandidates,
      ptPerFt,
      usedTextIds,
      dims.length,
    ).slice(0, 30);
    if (virtuals.length > 0) {
      const virtTx = virtuals.map((d) => {
        const t = textLayer.imperialCandidates.find(
          (x) =>
            x.parseStatus === "ok" &&
            !usedTextIds.has(x.id) &&
            Math.hypot(x.mid.x - d.mid.x, x.mid.y - d.mid.y) < 2,
        );
        if (t) usedTextIds.add(t.id);
        return {
          dimId: d.id,
          authority: "pdf-text-layer" as const,
          rawText: t?.rawText ?? "",
          parsedFeet: t?.parsedFeet ?? null,
          parseStatus: (t?.parseStatus === "ok" ? "ok" : "unresolved") as
            | "ok"
            | "unresolved",
          textPrimitiveId: t?.id ?? null,
          confidence: null,
          rotationDeg: null,
          cropPath: null,
          association: {
            normalDist: 0,
            axialOverlap: 1,
            method: "virtual-dim-from-native-text",
          },
        };
      });
      dims = [...dims, ...virtuals];
      transcriptions = [...transcriptions, ...virtTx];
    }
  }
  if (ownsWorker) {
    await worker.terminate();
  }
  const txMs = performance.now() - tTx;

  const sourceCounts = {
    detected: dims.filter((d) => d.candidateSource === "detected").length,
    "near-high-seed": dims.filter((d) => d.candidateSource === "near-high-seed")
      .length,
    "virtual-text": dims.filter((d) => d.candidateSource === "virtual-text")
      .length,
  };

  const sourceByDim = new Map(dims.map((d) => [d.id, d.candidateSource]));
  const txMap = new Map(
    transcriptions.map((t) => {
      if (t.parseStatus === "ok" && t.parsedFeet != null) {
        return [
          t.dimId,
          {
            ocrText: t.rawText,
            parse: {
              status: "ok" as const,
              feet: t.parsedFeet,
              originalText: t.rawText,
            },
          },
        ];
      }
      return [
        t.dimId,
        {
          ocrText: t.rawText || null,
          parse: parseImperialLengthToFeet(t.rawText || ""),
        },
      ];
    }),
  );

  const dimOwn = rankDimOwnership(dims, pbg, txMap);

  const governable: GovernableAssoc[] = (
    dimOwn.associations as Array<Record<string, unknown>>
  ).map((a) => ({
    dimId: String(a.dimId),
    roleGuess: (a.roleGuess as string | null) ?? null,
    status: String(a.status),
    uniquenessMargin: a.uniquenessMargin as number | undefined,
    lengthOk: a.lengthOk as boolean | undefined,
    lengthRatio: a.lengthRatio as number | undefined,
    runLengthPt: a.runLengthPt as number | undefined,
    dimLengthPt: a.dimLengthPt as number | undefined,
    orientation: a.orientation as "H" | "V" | undefined,
    physicalRunKey: a.physicalRunKey as string | undefined,
    runId: a.runId as string | undefined,
    ocrText: (a.ocrText as string | null) ?? null,
    parse: a.parse as GovernableAssoc["parse"],
    candidateSource: sourceByDim.get(String(a.dimId)) ?? "detected",
    transcriptionAuthority: transcriptions.find((t) => t.dimId === a.dimId)
      ?.authority,
  }));

  const governed = governWallPlanLengthObservations({
    pageRole,
    associations: governable,
  });

  const emptyMarkRecovery: SemanticMarkRecoveryBlock = {
    phase0Decision: null,
    observations: [],
    candidateRegions: [],
    metrics: {
      candidateRegionsGenerated: 0,
      ocrCallsRequired: 0,
      marksRecovered: 0,
      typeIdentifierRecovered: 0,
      candidatePrecisionEstimate: null,
      markRecoveryFailures: 0,
      ownershipFailures: 0,
      timingMs: 0,
    },
  };

  let semanticMarkRecovery: SemanticMarkRecoveryBlock = emptyMarkRecovery;
  let typeMarks = detectTypeIdentifierPrimitives(textLayer.primitives);

  if (isSemanticMarkRecoveryEnabled()) {
    semanticMarkRecovery = await recoverSemanticMarkObservations({
      pdfPath,
      pageNumber,
      pageWidth,
      pageHeight,
      segments,
      pbgRuns: pbg,
      primitives: textLayer.primitives,
    });
    const geometry = buildPageGeometryContext({
      segments,
      pbgRuns: pbg,
      pageNumber,
    });
    const fromObs = typeMarksFromObservations(
      semanticMarkRecovery.observations,
      geometry.leaders,
    );
    typeMarks = mergeTypeMarkSources(typeMarks, fromObs);
  }

  const markOwn = rankTypeMarkOwnership({ marks: typeMarks, pbgRuns: pbg });
  const bindingGov = governPhysicalRunSemanticBindings({
    pageNumber,
    pageRole,
    associations: markOwn.associations,
    pbgRuns: pbg,
  });

  if (isSemanticMarkRecoveryEnabled()) {
    const recoveredIds = new Set(
      semanticMarkRecovery.observations.map((o) => o.observationId),
    );
    const ownershipFailures = markOwn.associations.filter(
      (a) =>
        recoveredIds.has(a.textPrimitiveId) &&
        (a.status === "ambiguous" || a.status === "unassociated"),
    ).length;
    const markRecoveryFailures =
      semanticMarkRecovery.metrics.typeIdentifierRecovered === 0 &&
      semanticMarkRecovery.phase0Decision != null &&
      semanticMarkRecovery.phase0Decision !== "STOP" &&
      semanticMarkRecovery.phase0Decision !== "SCHEDULE_REFERENCE"
        ? 1
        : 0;
    semanticMarkRecovery = {
      ...semanticMarkRecovery,
      metrics: {
        ...semanticMarkRecovery.metrics,
        ownershipFailures,
        markRecoveryFailures,
      },
    };
  }

  const emitBindings = bindingGov.bindings.filter((b) => b.emit);
  const propagationOpportunities = recordTopologicalPropagationOpportunities({
    pbgRuns: pbg,
    emitBindings,
  });

  let semanticDefinitions: CompiledDrawingPage["semanticDefinitions"];
  if (shouldExtractScheduleDefinitions(pageNumber, pageRole)) {
    semanticDefinitions = await extractScheduleDefinitions({
      pdfPath,
      pageNumber,
      pageWidth,
      pageHeight,
      segments,
    });
  }

  let semanticDereference: CompiledDrawingPage["semanticDereference"];
  const proofEnabled = isB2_2L3ProofEnabled();
  if (proofEnabled && pageRole.allowsWallPlanLengthEvidence) {
    const phase0 = await loadPhase0ReferenceDecision();
    const referenceMechanism =
      referenceMechanismOpt ??
      resolveReferenceMechanismFromEnv() ??
      phase0?.referenceMechanism ??
      "NOT_ESTABLISHED";

    const tagRefResult = await recoverPlanSemanticReferences({
      pdfPath,
      pageNumber,
      pageWidth,
      pageHeight,
      segments,
      pbgRuns: pbg,
      referenceMechanism,
    });

    const graphicRefResult = recoverGraphicConventionReferences({
      segments,
      pbgRuns: pbg,
      pageNumber,
      pageWidth,
      pageHeight,
      orientationContext,
      referenceMechanism,
    });

    const refResult = {
      references: [...tagRefResult.references, ...graphicRefResult.references],
      metrics: {
        ...tagRefResult.metrics,
        keysRecovered:
          tagRefResult.metrics.keysRecovered +
          graphicRefResult.metrics.referencesEmitted,
      },
    };

    const definitions = crossPageDefinitions.length > 0
      ? crossPageDefinitions
      : semanticDefinitions?.definitions ?? [];

    const rawBindings = dereferenceSemanticBindings({
      references: refResult.references,
      definitions,
      pageNumber,
    });
    const governed = governDereferencedBindings({
      bindings: rawBindings,
      references: refResult.references,
    });

    semanticDereference = {
      bindings: governed.bindings as DereferencedSemanticBinding[],
      emitBindingIds: governed.emitBindingIds,
      referenceMechanism,
      metrics: {
        referencesRecovered: refResult.references.length,
        definitionsAvailable: definitions.length,
        dereferenceMatches: governed.bindings.filter((b) => b.status === "assigned").length,
        emitCount: governed.emitBindingIds.length,
      },
    };
  }

  const payload: CompiledDrawingPage = {
    pdfPath,
    pageNumber,
    pageWidth,
    pageHeight,
    pageRole,
    text: {
      rawItemCount: textLayer.rawItemCount,
      primitives: textLayer.primitives,
      imperialCandidates: textLayer.imperialCandidates,
    },
    geometry: {
      segmentCount: segments.length,
      faceCount: faces.length,
      pairCount: pairs.length,
      physicalRunCount: physicalRuns.length,
      pbgRuns: pbg,
      rejectedRunCount: rejected.length,
      dims: dims.map((d) => ({
        id: d.id,
        candidateSource: d.candidateSource,
        orientation: d.orientation,
        length: d.length,
      })),
      dimSourceCounts: sourceCounts,
    },
    transcriptions,
    ptPerFt,
    ownership: {
      associatedUnique: dimOwn.associatedUnique,
      ambiguous: dimOwn.ambiguous,
      weakLength: dimOwn.weakLength,
      overallUniqueAndLengthOk: dimOwn.overallUniqueAndLengthOk,
      overallLengthOkRate: dimOwn.overallLengthOkRate,
      associations: governable,
    },
    governance: {
      pageRole,
      decisions: governed.decisions,
      emitDimIds: governed.emitDimIds,
      scaleByDim: governed.scaleByDim,
      counts: governed.counts,
    },
    semanticBinding: {
      emitBindingIds: bindingGov.emitBindingIds,
      bindings: bindingGov.bindings,
      propagationOpportunities,
      ownershipAssociations: markOwn.associations,
    },
    semanticMarkRecovery,
    semanticDefinitions,
    semanticDereference,
    timingMs: {
      total: Number((performance.now() - tAll).toFixed(1)),
      transcription: Number(txMs.toFixed(1)),
    },
  };

  return compiledDrawingPageSchema.parse(payload);
}

export {
  UNIQUENESS_MIN,
  LENGTH_RATIO_MIN,
  type SourcedDimCandidate,
  type OcrWorker,
  type GovernableAssoc,
};
