import { performance } from "node:perf_hooks";

import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { Segment } from "../sgg/extractSegments.js";
import { renderPagePng } from "../dimensions/dimOwnership.js";
import { detectEnclosureCandidates } from "../semantic-mark-recovery/detectEnclosures.js";
import { detectLeaderCandidates } from "../semantic-mark-recovery/detectLeaders.js";
import { extractAnnotationSegments } from "../semantic-mark-recovery/annotationSegments.js";
import {
  createMarkOcrWorker,
  cropBboxFromRaster,
  ocrMarkRegion,
} from "../semantic-mark-recovery/markOcr.js";
import { scoreMarkOcrText } from "../semantic-mark-recovery/scoreMarkOcrText.js";
import { rankTypeMarkOwnership } from "../type-marks/rankTypeMarkOwnership.js";
import type { TypeIdentifierPrimitive } from "../type-marks/detectTypeIdentifierPrimitives.js";
import type { ReferenceMechanism } from "../semantic-dereference/referenceMechanism.schema.js";
import type { SemanticReferenceInstance } from "../semantic-dereference/dereferenceSemanticBindings.js";
import {
  classifyEnclosureAnnotation,
  isWallTypeTagClass,
} from "./classifyPlanAnnotation.js";

const OCR_SCALE = 3;

function detectLeadersTagAnchored(input: {
  segments: readonly Segment[];
  tagEnclosures: ReturnType<typeof detectEnclosureCandidates>;
  pbgRuns: readonly PbgRun[];
  pageNumber: number;
}) {
  const annSegs = extractAnnotationSegments(input.segments);
  const allLeaders = detectLeaderCandidates({
    segments: annSegs,
    enclosures: input.tagEnclosures,
    pbgRuns: input.pbgRuns,
    pageNumber: input.pageNumber,
  });
  return allLeaders.slice(0, 64);
}

export async function recoverPlanSemanticReferences(input: {
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  segments: readonly Segment[];
  pbgRuns: readonly PbgRun[];
  referenceMechanism: ReferenceMechanism;
}): Promise<{
  references: SemanticReferenceInstance[];
  metrics: {
    wallTypeTagsScanned: number;
    ocrCalls: number;
    keysRecovered: number;
    ownershipGoverned: number;
    timingMs: number;
  };
}> {
  const t0 = performance.now();
  if (
    input.referenceMechanism === "NOT_ESTABLISHED" ||
    input.referenceMechanism === "GRAPHIC_CONVENTION"
  ) {
    return {
      references: [],
      metrics: {
        wallTypeTagsScanned: 0,
        ocrCalls: 0,
        keysRecovered: 0,
        ownershipGoverned: 0,
        timingMs: Number((performance.now() - t0).toFixed(1)),
      },
    };
  }

  const annSegs = extractAnnotationSegments(input.segments);
  const enclosures = detectEnclosureCandidates(annSegs, input.pageNumber);
  const classified = enclosures.map((enc) =>
    classifyEnclosureAnnotation({
      enc,
      pageNumber: input.pageNumber,
      pbgRuns: input.pbgRuns,
      pageWidth: input.pageWidth,
      pageHeight: input.pageHeight,
      isSchedulePage: false,
    }),
  );

  const tagCandidates = classified.filter(isWallTypeTagClass);
  const tagEnclosures = enclosures.filter((enc) =>
    tagCandidates.some((t) => t.id === enc.id),
  );

  const useLeaders =
    input.referenceMechanism === "TAG_LEADER" ||
    input.referenceMechanism === "MIXED";
  const leaders = useLeaders
    ? detectLeadersTagAnchored({
        segments: input.segments,
        tagEnclosures,
        pbgRuns: input.pbgRuns,
        pageNumber: input.pageNumber,
      })
    : [];

  const rendered = await renderPagePng(
    input.pdfPath,
    input.pageNumber,
    OCR_SCALE,
  );
  const worker = await createMarkOcrWorker();
  const references: SemanticReferenceInstance[] = [];
  let ocrCalls = 0;
  let keysRecovered = 0;

  try {
    for (const tag of tagCandidates) {
      const pad = 4;
      const bbox = {
        x0: tag.bbox.x0 - pad,
        y0: tag.bbox.y0 - pad,
        x1: tag.bbox.x1 + pad,
        y1: tag.bbox.y1 + pad,
      };
      const crop = cropBboxFromRaster(
        rendered.png,
        input.pageWidth,
        input.pageHeight,
        bbox,
      );
      const ocr = await ocrMarkRegion(crop.png, worker);
      ocrCalls++;
      const scored = scoreMarkOcrText(ocr.text, ocr.confidence);
      const referenceKey = scored?.normalizedKey ?? null;
      if (referenceKey) keysRecovered++;

      const leader = leaders.find((l) => l.enclosureId === tag.id);

      references.push({
        referenceId: `ref-p${input.pageNumber}-${tag.id}`,
        referenceKey,
        referenceMechanism: leader ? "TAG_LEADER" : "TAG",
        conventionClass: tag.conventionClass,
        sourcePageNumber: input.pageNumber,
        sourceRegion: tag.bbox,
        observationKind: leader ? "leader-callout" : "enclosed-identifier",
        ownership: {
          physicalRunKey: tag.nearRunKey,
          authorityGrade: null,
          method: leader ? "tag-anchored-leader" : "tag-spatial-proximity",
        },
        provenance: {
          observationId: tag.id,
          conventionEntryIds: [tag.id],
        },
      });
    }
  } finally {
    await worker.terminate();
  }

  const typeMarks: TypeIdentifierPrimitive[] = references
    .filter((r) => r.referenceKey)
    .map((r) => ({
      id: r.provenance.observationId,
      rawText: r.referenceKey!,
      semanticSubjectKey: r.referenceKey!,
      semanticTextCategory: "type-or-assembly-identifier" as const,
      mid: {
        x: (r.sourceRegion.x0 + r.sourceRegion.x1) / 2,
        y: (r.sourceRegion.y0 + r.sourceRegion.y1) / 2,
      },
      orientation: "unknown" as const,
      sourceAuthority: "localized-ocr" as const,
      observationId: r.provenance.observationId,
    }));

  const ownership = rankTypeMarkOwnership({
    marks: typeMarks,
    pbgRuns: input.pbgRuns,
  });

  const ownByMark = new Map(
    ownership.associations.map((a) => [a.textPrimitiveId, a]),
  );

  let ownershipGoverned = 0;
  for (const ref of references) {
    const own = ownByMark.get(ref.provenance.observationId);
    if (own?.status === "associated" && own.physicalRunKey) {
      ref.ownership.physicalRunKey = own.physicalRunKey;
      ref.ownership.authorityGrade = "A";
      ownershipGoverned++;
    }
  }

  return {
    references,
    metrics: {
      wallTypeTagsScanned: tagCandidates.length,
      ocrCalls,
      keysRecovered,
      ownershipGoverned,
      timingMs: Number((performance.now() - t0).toFixed(1)),
    },
  };
}
