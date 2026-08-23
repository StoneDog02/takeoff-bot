import { performance } from "node:perf_hooks";

import type { TextPrimitive } from "../text/extractTextPrimitives.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { Segment } from "../sgg/extractSegments.js";
import { renderPagePng } from "../dimensions/dimOwnership.js";
import {
  isTypeOrAssemblyIdentifier,
  normalizeTypeIdentifierKey,
  classifySemanticTextCandidate,
} from "../type-marks/classifySemanticTextCandidate.js";
import type { TypeIdentifierPrimitive } from "../type-marks/detectTypeIdentifierPrimitives.js";
import type { Phase0Decision } from "./phase0Decision.schema.js";
import { buildPageGeometryContext } from "./auditVisualMarkPage.js";
import { regionsForStrategy, type MarkCandidateRegion } from "./candidateRegions.js";
import { createMarkOcrWorker, cropBboxFromRaster, ocrMarkRegion } from "./markOcr.js";
import { scoreMarkOcrText } from "./scoreMarkOcrText.js";
import type {
  CandidateRegionAudit,
  SemanticMarkObservation,
  SemanticMarkRecoveryBlock,
} from "./semanticMarkObservation.schema.js";
import { loadPhase0Decision, resolvePhase0Decision } from "./loadPhase0Decision.js";
import { isB2_2L3ProofEnabled } from "../semantic-definitions/isSemanticDefinitionExtractionEnabled.js";

const OCR_RENDER_SCALE = 3;

function strategiesForDecision(decision: Phase0Decision): Array<
  "run-band" | "enclosure-interior" | "leader-endpoint" | "native-text"
> {
  let strategies: Array<
    "run-band" | "enclosure-interior" | "leader-endpoint" | "native-text"
  >;
  switch (decision) {
    case "DIRECT_OCR":
      strategies = ["native-text", "run-band"];
      break;
    case "ENCLOSURE_OCR":
      strategies = ["native-text", "enclosure-interior"];
      break;
    case "LEADER_CALLOUT":
      strategies = ["native-text", "leader-endpoint", "enclosure-interior"];
      break;
    case "HYBRID":
      strategies = ["native-text", "enclosure-interior", "leader-endpoint", "run-band"];
      break;
    case "VECTOR_GLYPH":
      strategies = ["native-text", "enclosure-interior", "run-band"];
      break;
    case "SCHEDULE_REFERENCE":
      strategies = ["native-text"];
      break;
    case "STOP":
      strategies = [];
      break;
  }
  if (isB2_2L3ProofEnabled()) {
    strategies = strategies.filter((s) => s !== "run-band");
  }
  return strategies;
}

function maxOcrForDecision(decision: Phase0Decision): number {
  switch (decision) {
    case "ENCLOSURE_OCR":
      return 32;
    case "LEADER_CALLOUT":
      return 28;
    case "HYBRID":
      return 36;
    case "DIRECT_OCR":
      return 30;
    default:
      return 24;
  }
}

function dedupeRegions(regions: MarkCandidateRegion[]): MarkCandidateRegion[] {
  const kept: MarkCandidateRegion[] = [];
  for (const r of regions) {
    if (
      kept.some(
        (k) =>
          Math.abs(k.bbox.x0 - r.bbox.x0) < 8 &&
          Math.abs(k.bbox.y0 - r.bbox.y0) < 8 &&
          k.kind === r.kind,
      )
    ) {
      continue;
    }
    kept.push(r);
  }
  return kept;
}

function nativeObservations(
  primitives: readonly TextPrimitive[],
  pageNumber: number,
): SemanticMarkObservation[] {
  const out: SemanticMarkObservation[] = [];
  for (const p of primitives) {
    if (!isTypeOrAssemblyIdentifier(p.rawText)) continue;
    out.push({
      observationId: `obs-native-${p.id}`,
      pageNumber,
      observationKind: "text-identifier",
      rawText: p.rawText.trim(),
      normalizedKey: normalizeTypeIdentifierKey(p.rawText),
      semanticTextCategory: classifySemanticTextCandidate(p.rawText),
      recoveryMethod: "native-text",
      recoveryConfidence: 1,
      bbox: p.bbox,
      mid: p.mid,
      orientation: p.orientation,
      provenance: {
        candidateRegionId: `native-${p.id}`,
        candidateRegionKind: "native-text-bbox",
        cropPath: null,
        sourceSegmentIds: [],
      },
      enclosure: null,
      leader: null,
      visualDescription: null,
    });
  }
  return out;
}

function observationKindForRegion(
  region: MarkCandidateRegion,
): SemanticMarkObservation["observationKind"] {
  if (region.leaderId) return "leader-callout";
  if (region.enclosureId) return "enclosed-identifier";
  return "text-identifier";
}

export async function recoverSemanticMarkObservations(input: {
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  segments: readonly Segment[];
  pbgRuns: readonly PbgRun[];
  primitives: readonly TextPrimitive[];
  phase0Decision?: Phase0Decision | null;
}): Promise<SemanticMarkRecoveryBlock> {
  const t0 = performance.now();
  const loaded = input.phase0Decision ?? (await loadPhase0Decision());
  const decision = resolvePhase0Decision(loaded, "ENCLOSURE_OCR");

  if (decision === "STOP" || decision === "SCHEDULE_REFERENCE") {
    return {
      phase0Decision: decision,
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
        timingMs: Number((performance.now() - t0).toFixed(1)),
      },
    };
  }

  const geometry = buildPageGeometryContext({
    segments: input.segments,
    pbgRuns: input.pbgRuns,
    pageNumber: input.pageNumber,
  });

  const strategies = strategiesForDecision(decision);
  const allRegions: MarkCandidateRegion[] = [];
  for (const strategy of strategies) {
    allRegions.push(
      ...regionsForStrategy(strategy, {
        pbgRuns: input.pbgRuns,
        enclosures: geometry.enclosures,
        leaders: geometry.leaders,
        primitives: input.primitives,
        maxRunBandRegions: decision === "DIRECT_OCR" ? 35 : 15,
      }),
    );
  }
  const regions = dedupeRegions(allRegions);

  const observations: SemanticMarkObservation[] = nativeObservations(
    input.primitives,
    input.pageNumber,
  );
  const candidateRegions: CandidateRegionAudit[] = [];
  let ocrCalls = 0;
  const maxOcr = maxOcrForDecision(decision);

  const ocrRegions = regions.filter((r) => r.strategy !== "native-text");
  if (ocrRegions.length > 0) {
    const rendered = await renderPagePng(input.pdfPath, input.pageNumber, OCR_RENDER_SCALE);
    const worker = await createMarkOcrWorker();
    try {
      for (const region of ocrRegions) {
        if (ocrCalls >= maxOcr) break;

        const crop = cropBboxFromRaster(
          rendered.png,
          input.pageWidth,
          input.pageHeight,
          region.bbox,
        );
        if (crop.width < 6 || crop.height < 6) {
          candidateRegions.push({
            id: region.id,
            kind: region.kind,
            strategy: region.strategy,
            bbox: region.bbox,
            ocrAttempted: false,
            ocrResolved: false,
            recoveredText: null,
          });
          continue;
        }

        ocrCalls++;
        const ocr = await ocrMarkRegion(crop.png, worker);
        const scored = scoreMarkOcrText(ocr.text, ocr.confidence);
        const recoveredText = scored?.rawText ?? (ocr.text.trim() || null);
        candidateRegions.push({
          id: region.id,
          kind: region.kind,
          strategy: region.strategy,
          bbox: region.bbox,
          ocrAttempted: true,
          ocrResolved: scored?.isTypeIdentifier ?? false,
          recoveredText,
        });

        if (!scored?.isTypeIdentifier) continue;

        const enc = region.enclosureId
          ? geometry.enclosures.find((e) => e.id === region.enclosureId)
          : null;
        const ldr = region.leaderId
          ? geometry.leaders.find((l) => l.id === region.leaderId)
          : null;

        observations.push({
          observationId: `obs-${region.id}`,
          pageNumber: input.pageNumber,
          observationKind: observationKindForRegion(region),
          rawText: scored.rawText,
          normalizedKey: scored.normalizedKey,
          semanticTextCategory: scored.category,
          recoveryMethod: "localized-ocr",
          recoveryConfidence: scored.confidence,
          bbox: region.bbox,
          mid: region.mid,
          orientation: region.orientation,
          provenance: {
            candidateRegionId: region.id,
            candidateRegionKind: region.kind,
            cropPath: null,
            sourceSegmentIds: enc?.segmentIds ?? (ldr ? [ldr.segmentId] : []),
          },
          enclosure: enc
            ? { id: enc.id, bbox: enc.bbox, segmentIds: enc.segmentIds }
            : null,
          leader: ldr
            ? {
                id: ldr.id,
                from: ldr.from,
                to: ldr.to,
                segmentIds: [ldr.segmentId],
              }
            : null,
          visualDescription: null,
        });
      }
    } finally {
      await worker.terminate();
    }
  }

  const typeIdentifierRecovered = observations.filter(
    (o) => o.rawText && isTypeOrAssemblyIdentifier(o.rawText),
  ).length;

  return {
    phase0Decision: decision,
    observations,
    candidateRegions,
    metrics: {
      candidateRegionsGenerated: regions.length,
      ocrCallsRequired: ocrCalls,
      marksRecovered: observations.length,
      typeIdentifierRecovered,
      candidatePrecisionEstimate:
        ocrCalls > 0 ? typeIdentifierRecovered / ocrCalls : null,
      markRecoveryFailures: 0,
      ownershipFailures: 0,
      timingMs: Number((performance.now() - t0).toFixed(1)),
    },
  };
}

export function typeMarksFromObservations(
  observations: readonly SemanticMarkObservation[],
  leaders: readonly { id: string; nearRunKey: string | null }[],
): TypeIdentifierPrimitive[] {
  const leaderById = new Map(leaders.map((l) => [l.id, l]));
  return observations
    .filter((o) => o.rawText && o.normalizedKey && isTypeOrAssemblyIdentifier(o.rawText))
    .map((o) => {
      const leader = o.leader?.id ? leaderById.get(o.leader.id) : null;
      const mid =
        o.observationKind === "leader-callout" && o.leader ? o.leader.to : o.mid;
      return {
        id: o.observationId,
        rawText: o.rawText!,
        semanticSubjectKey: o.normalizedKey!,
        semanticTextCategory: "type-or-assembly-identifier" as const,
        mid,
        orientation: o.orientation,
        sourceAuthority:
          o.recoveryMethod === "native-text" ? "pdf-text-layer" : "localized-ocr",
        leaderTargetRunKey: leader?.nearRunKey ?? null,
        observationId: o.observationId,
      };
    });
}

export function mergeTypeMarkSources(
  fromPrimitives: readonly TypeIdentifierPrimitive[],
  fromObservations: readonly TypeIdentifierPrimitive[],
): TypeIdentifierPrimitive[] {
  const byKey = new Map<string, TypeIdentifierPrimitive>();
  for (const m of [...fromPrimitives, ...fromObservations]) {
    const key = `${m.semanticSubjectKey}:${Math.round(m.mid.x)}:${Math.round(m.mid.y)}`;
    if (!byKey.has(key)) byKey.set(key, m);
  }
  return [...byKey.values()];
}
