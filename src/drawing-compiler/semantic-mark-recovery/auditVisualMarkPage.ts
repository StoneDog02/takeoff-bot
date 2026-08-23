import type { TextPrimitive } from "../text/extractTextPrimitives.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { Segment } from "../sgg/extractSegments.js";
import { renderPagePng } from "../dimensions/dimOwnership.js";
import {
  isTypeOrAssemblyIdentifier,
  normalizeTypeIdentifierKey,
} from "../type-marks/classifySemanticTextCandidate.js";
import { extractAnnotationSegments } from "./annotationSegments.js";
import { detectEnclosureCandidates } from "./detectEnclosures.js";
import { detectLeaderCandidates } from "./detectLeaders.js";
import {
  regionsForStrategy,
  type MarkCandidateRegion,
} from "./candidateRegions.js";
import {
  createMarkOcrWorker,
  cropBboxFromRaster,
  ocrMarkRegion,
  type MarkOcrWorker,
} from "./markOcr.js";
import { scoreMarkOcrText } from "./scoreMarkOcrText.js";
import type { EncodingClass } from "./phase0Decision.schema.js";
import {
  type StrategyTrialMetrics,
  candidateStrategySchema,
} from "./phase0Decision.schema.js";

const OCR_RENDER_SCALE = 3;
const MAX_TRIAL_OCR_PER_STRATEGY = 18;

export type VisualMarkPageAudit = {
  label: string;
  pageNumber: number;
  pdfPath: string;
  nativeTextItemCount: number;
  annotationSegmentCount: number;
  enclosureCount: number;
  leaderCount: number;
  eligibleRunCount: number;
  dominantEncodingClasses: EncodingClass[];
  strategyTrials: StrategyTrialMetrics[];
  recoveredSignals: Array<{
    rawText: string;
    normalizedKey: string;
    strategy: string;
    regionKind: string;
  }>;
  scheduleLikeTextCount: number;
};

export async function auditVisualMarkPage(input: {
  label: string;
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  segments: readonly Segment[];
  pbgRuns: readonly PbgRun[];
  primitives: readonly TextPrimitive[];
  trialOcr?: boolean;
}): Promise<VisualMarkPageAudit> {
  const annotationSegments = extractAnnotationSegments(input.segments);
  const enclosures = detectEnclosureCandidates(annotationSegments, input.pageNumber);
  const leaders = detectLeaderCandidates({
    segments: annotationSegments,
    enclosures,
    pbgRuns: input.pbgRuns,
    pageNumber: input.pageNumber,
  });

  const eligibleRunCount = input.pbgRuns.filter(
    (r) => r.wallAuthority === "high" || r.wallAuthority === "medium",
  ).length;

  const scheduleLikeTextCount = input.primitives.filter((p) =>
    /\bSCHEDULE\b|\bLEGEND\b|\bINDEX\b/i.test(p.rawText),
  ).length;

  const nativeTypeIds = input.primitives.filter((p) =>
    isTypeOrAssemblyIdentifier(p.rawText),
  );

  const strategyTrials: StrategyTrialMetrics[] = [];
  const recoveredSignals: VisualMarkPageAudit["recoveredSignals"] = [];

  for (const native of nativeTypeIds) {
    recoveredSignals.push({
      rawText: native.rawText,
      normalizedKey: normalizeTypeIdentifierKey(native.rawText),
      strategy: "native-text",
      regionKind: "native-text-bbox",
    });
  }

  if (input.trialOcr !== false) {
    const rendered = await renderPagePng(input.pdfPath, input.pageNumber, OCR_RENDER_SCALE);
    const worker = await createMarkOcrWorker();
    try {
      for (const strategy of candidateStrategySchema.options) {
        if (strategy === "native-text") {
          strategyTrials.push({
            strategy,
            candidateRegionsGenerated: input.primitives.length,
            ocrCallsRequired: 0,
            marksRecovered: nativeTypeIds.length,
            typeIdentifierRecovered: nativeTypeIds.length,
            recoveredSamples: nativeTypeIds.slice(0, 5).map((p) => ({
              rawText: p.rawText,
              normalizedKey: normalizeTypeIdentifierKey(p.rawText),
              regionKind: "native-text-bbox",
            })),
          });
          continue;
        }

        const regions = regionsForStrategy(strategy, {
          pbgRuns: input.pbgRuns,
          enclosures,
          leaders,
          primitives: input.primitives,
          maxRunBandRegions: 25,
        });

        const trialRegions = regions.slice(0, MAX_TRIAL_OCR_PER_STRATEGY);
        const samples: StrategyTrialMetrics["recoveredSamples"] = [];
        let marksRecovered = 0;
        let typeIdentifierRecovered = 0;

        for (const region of trialRegions) {
          const crop = cropBboxFromRaster(
            rendered.png,
            input.pageWidth,
            input.pageHeight,
            region.bbox,
          );
          if (crop.width < 8 || crop.height < 8) continue;
          const ocr = await ocrMarkRegion(crop.png, worker);
          const scored = scoreMarkOcrText(ocr.text, ocr.confidence);
          if (scored) {
            marksRecovered++;
            if (scored.isTypeIdentifier) {
              typeIdentifierRecovered++;
              samples.push({
                rawText: scored.rawText,
                normalizedKey: scored.normalizedKey ?? scored.rawText,
                regionKind: region.kind,
              });
              recoveredSignals.push({
                rawText: scored.rawText,
                normalizedKey: scored.normalizedKey ?? scored.rawText,
                strategy,
                regionKind: region.kind,
              });
            }
          }
        }

        strategyTrials.push({
          strategy,
          candidateRegionsGenerated: regions.length,
          ocrCallsRequired: trialRegions.length,
          marksRecovered,
          typeIdentifierRecovered,
          recoveredSamples: samples.slice(0, 8),
        });
      }
    } finally {
      await worker.terminate();
    }
  } else {
    for (const strategy of candidateStrategySchema.options) {
      const regions = regionsForStrategy(strategy, {
        pbgRuns: input.pbgRuns,
        enclosures,
        leaders,
        primitives: input.primitives,
      });
      strategyTrials.push({
        strategy,
        candidateRegionsGenerated: regions.length,
        ocrCallsRequired: 0,
        marksRecovered: strategy === "native-text" ? nativeTypeIds.length : 0,
        typeIdentifierRecovered: strategy === "native-text" ? nativeTypeIds.length : 0,
        recoveredSamples: [],
      });
    }
  }

  const dominantEncodingClasses = inferEncodingClasses({
    nativeTextItemCount: input.primitives.length,
    nativeTypeIds: nativeTypeIds.length,
    enclosureCount: enclosures.length,
    leaderCount: leaders.length,
    scheduleLikeTextCount,
    strategyTrials,
    recoveredSignals,
  });

  return {
    label: input.label,
    pageNumber: input.pageNumber,
    pdfPath: input.pdfPath,
    nativeTextItemCount: input.primitives.length,
    annotationSegmentCount: annotationSegments.length,
    enclosureCount: enclosures.length,
    leaderCount: leaders.length,
    eligibleRunCount,
    dominantEncodingClasses,
    strategyTrials,
    recoveredSignals,
    scheduleLikeTextCount,
  };
}

function inferEncodingClasses(input: {
  nativeTextItemCount: number;
  nativeTypeIds: number;
  enclosureCount: number;
  leaderCount: number;
  scheduleLikeTextCount: number;
  strategyTrials: StrategyTrialMetrics[];
  recoveredSignals: VisualMarkPageAudit["recoveredSignals"];
}): EncodingClass[] {
  const classes: EncodingClass[] = [];

  if (input.nativeTypeIds > 0) classes.push("A-native-text");
  if (input.nativeTextItemCount === 0 && input.recoveredSignals.some((s) => s.strategy === "run-band")) {
    classes.push("B-run-adjacent-graphical-text");
  }
  if (input.enclosureCount > 0) classes.push("C-enclosed-bubbled");
  if (input.leaderCount > 0) classes.push("D-leader-callout");
  if (input.nativeTextItemCount === 0 && input.enclosureCount > 0) {
    classes.push("E-vector-glyph");
  }
  if (input.scheduleLikeTextCount > 0) classes.push("F-schedule-reference");
  if (classes.length === 0 && input.recoveredSignals.length === 0) {
    classes.push("H-no-usable-mark");
  }
  return classes;
}

export type PageGeometryContext = {
  segments: Segment[];
  pbgRuns: PbgRun[];
  enclosures: ReturnType<typeof detectEnclosureCandidates>;
  leaders: ReturnType<typeof detectLeaderCandidates>;
  annotationSegments: Segment[];
};

export function buildPageGeometryContext(input: {
  segments: readonly Segment[];
  pbgRuns: readonly PbgRun[];
  pageNumber: number;
}): PageGeometryContext {
  const annotationSegments = extractAnnotationSegments(input.segments);
  const enclosures = detectEnclosureCandidates(annotationSegments, input.pageNumber);
  const leaders = detectLeaderCandidates({
    segments: annotationSegments,
    enclosures,
    pbgRuns: input.pbgRuns,
    pageNumber: input.pageNumber,
  });
  return {
    segments: [...input.segments],
    pbgRuns: [...input.pbgRuns],
    enclosures,
    leaders,
    annotationSegments,
  };
}

export type { MarkCandidateRegion, MarkOcrWorker };
