import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compiledDrawingPageSchema } from "../../src/compiler/schemas/compiledDrawingPage.schema.js";
import type { CompiledDrawingPage } from "../../src/compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../src/compiler/schemas/physicalWallRun.schema.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { extractedFramingEvidencePayloadSchema } from "../../src/framing/schemas/framing-artifacts.schema.js";
import {
  governedProjectDictionarySchema,
  type GovernedProjectDictionary,
} from "../../src/project-reading/schemas/projectDictionary.schema.js";

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "beckstead-w4c-char-replay",
);

/**
 * Frozen W4-C characterization replay (no Anthropic).
 *
 * Evidence is a committed copy of
 * `artifacts/beckstead-w4c-char-20260905-183009/framing/reader-extracted-evidence.json`
 * (224 records; envelope `{ evidence: [...] }`).
 *
 * The live run never wrote `reader-project-dictionary.json`. Dictionary sizes
 * below are reconstructed from that run's `reader-construction.json` traces
 * (`Plan Dictionary schedule size applied to identified mark`), not invented
 * and not taken from harvest/interpret candidates (`reader-project-learning.json`
 * is not a governed dictionary; OCR schedule cells are too noisy for size
 * authority):
 *
 *   WB2-11.88LVL → (2)-1.3/4"x11.7/8" LVL
 *   WB2-10DF     → (2)-2x10 DF#2
 *   WB3-10DF     → (3)-2x10 DF#2
 *
 * WB2-8DF size is already in Evidence. Do not mint members from dictionary-only keys.
 * Frozen `reader-construction.json` predates W5-A/B and is not expected output.
 */
export function loadBecksteadW4cCharReplayEvidence(): Evidence[] {
  const envelope = JSON.parse(
    readFileSync(path.join(fixtureDir, "reader-extracted-evidence.json"), "utf8"),
  ) as unknown;
  return extractedFramingEvidencePayloadSchema.parse(
    envelope && typeof envelope === "object" && "payload" in envelope
      ? (envelope as { payload: unknown }).payload
      : envelope,
  ).evidence;
}

export function loadBecksteadW4cCharReplayDictionary(): GovernedProjectDictionary {
  return governedProjectDictionarySchema.parse(
    JSON.parse(
      readFileSync(
        path.join(fixtureDir, "governed-project-dictionary.json"),
        "utf8",
      ),
    ),
  );
}

const FULL_COMPILED_PAGES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../artifacts/beckstead-w4c-char-20260905-183009/framing/reader-compiled-drawing-pages.json",
);

export type BecksteadW4cCompiledPagesLoad = {
  pages: CompiledDrawingPage[];
  source: "full-artifact" | "slim-fixture";
};

type SlimOpeningGapPage = {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  pageRole: CompiledDrawingPage["pageRole"];
  ptPerFt: number | null;
  emitDimIds: string[];
  pbgRuns: PhysicalWallRunRecord[];
  dims: CompiledDrawingPage["geometry"]["dims"];
  transcriptions: CompiledDrawingPage["transcriptions"];
  associations: CompiledDrawingPage["ownership"]["associations"];
};

function emptySemanticMarkRecovery(): CompiledDrawingPage["semanticMarkRecovery"] {
  return {
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
}

function inflateSlimOpeningGapPage(page: SlimOpeningGapPage): CompiledDrawingPage {
  return {
    pdfPath: "tests/fixtures/beckstead-w4c-char-replay/compiled-opening-gaps.slim.json",
    pageNumber: page.pageNumber,
    pageWidth: page.pageWidth,
    pageHeight: page.pageHeight,
    pageRole: page.pageRole,
    text: {
      rawItemCount: 0,
      primitives: [],
      imperialCandidates: [],
    },
    geometry: {
      segmentCount: 0,
      faceCount: 0,
      pairCount: 0,
      physicalRunCount: page.pbgRuns.length,
      pbgRuns: page.pbgRuns,
      rejectedRunCount: 0,
      dims: page.dims,
      dimSourceCounts: { detected: 0, "near-high-seed": 0, "virtual-text": 0 },
    },
    transcriptions: page.transcriptions,
    ptPerFt: page.ptPerFt,
    ownership: {
      associatedUnique: 0,
      ambiguous: 0,
      weakLength: 0,
      overallUniqueAndLengthOk: 0,
      overallLengthOkRate: null,
      associations: page.associations,
    },
    governance: {
      pageRole: page.pageRole,
      decisions: [],
      emitDimIds: page.emitDimIds,
      scaleByDim: {},
      counts: {
        emit: 0,
        rejectPageRole: 0,
        rejectOwnership: 0,
        rejectVirtual: 0,
        rejectScale: 0,
        unresolvedScale: 0,
        passScale: 0,
      },
    },
    semanticBinding: {
      emitBindingIds: [],
      bindings: [],
      propagationOpportunities: [],
      ownershipAssociations: [],
    },
    semanticMarkRecovery: emptySemanticMarkRecovery(),
    timingMs: { total: 0, transcription: 0 },
  };
}

export function loadBecksteadW4cCharReplaySlimCompiledPages(): CompiledDrawingPage[] {
  const envelope = JSON.parse(
    readFileSync(path.join(fixtureDir, "compiled-opening-gaps.slim.json"), "utf8"),
  ) as { pages: SlimOpeningGapPage[] };
  return envelope.pages.map(inflateSlimOpeningGapPage);
}

/**
 * Frozen W4-C compiled drawing pages for opening-geometry replay.
 * Prefers the gitignored characterization artifact when present; otherwise
 * the committed slim pbgRuns / openingGapSuspects fixture.
 */
export function loadBecksteadW4cCharReplayCompiledPages(): BecksteadW4cCompiledPagesLoad {
  if (existsSync(FULL_COMPILED_PAGES)) {
    const envelope = JSON.parse(readFileSync(FULL_COMPILED_PAGES, "utf8")) as {
      pages?: unknown;
    };
    const pages = (envelope.pages ?? envelope) as unknown;
    return {
      pages: compiledDrawingPageSchema.array().parse(pages),
      source: "full-artifact",
    };
  }

  return {
    pages: loadBecksteadW4cCharReplaySlimCompiledPages(),
    source: "slim-fixture",
  };
}
