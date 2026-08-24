import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import type { OpeningCategory } from "../schemas/opening.schema.js";
import {
  applyParentRunDimensionExclusivity,
  governOpeningDimensionOwnership,
} from "./governOpeningDimensionOwnership.js";
import { governOpeningPhysicalRunOwnership } from "./governOpeningPhysicalRunOwnership.js";
import type {
  GovernedOpeningCandidate,
  OpeningGapCandidate,
} from "./openingGovernanceTypes.js";

/**
 * Domain promotion gate: raw gap inventory stays out of Opening objects unless
 * material-authoritative or review-tier (AMBIGUOUS width with parent run).
 */
export function shouldPromoteOpeningToDomain(
  candidate: GovernedOpeningCandidate,
): boolean {
  if (candidate.materialAuthoritative) return true;
  return (
    candidate.dimensionOwnership.status === "AMBIGUOUS" &&
    candidate.physicalRunOwnership.parentPhysicalRunKey != null
  );
}

export const OPENING_GEOMETRY_PASS_ID = "opening-geometry-pbg";

const LABEL_CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: OpeningCategory }> = [
  { pattern: /\bGARAGE\s*DOOR\b/i, category: "garage-door" },
  { pattern: /\bWINDOW\b/i, category: "window" },
  { pattern: /\bDOOR\b/i, category: "door" },
  { pattern: /\bCASED\b/i, category: "cased" },
];

function classifyCategoryFromLabels(
  page: CompiledDrawingPage,
  gapAt: { x: number; y: number },
): OpeningCategory {
  for (const primitive of page.text.primitives) {
    const { normalDist, axialDist } = {
      normalDist: Math.hypot(
        primitive.mid.x - gapAt.x,
        primitive.mid.y - gapAt.y,
      ),
      axialDist: 0,
    };
    if (normalDist > 150) continue;
    for (const { pattern, category } of LABEL_CATEGORY_PATTERNS) {
      if (pattern.test(primitive.rawText)) {
        return category;
      }
    }
  }
  return "unknown";
}

function isPlanLayoutPage(page: CompiledDrawingPage): boolean {
  if (page.pageRole.role === "plan") return true;
  return page.geometry.pbgRuns.some((r) => r.openingGapSuspects.length > 0);
}

function collectGapCandidates(page: CompiledDrawingPage): OpeningGapCandidate[] {
  const out: OpeningGapCandidate[] = [];
  for (const run of page.geometry.pbgRuns) {
    if (run.wallAuthority === "reject") continue;
    run.openingGapSuspects.forEach((gap, gapIndex) => {
      const subjectKey = `opening:p${page.pageNumber}:${run.physicalRunKey}:gap${gapIndex}`;
      out.push({
        openingSubjectKey: subjectKey,
        pageNumber: page.pageNumber,
        physicalRunKey: run.physicalRunKey,
        gapIndex,
        gapAt: gap.at,
        gapPt: gap.gapPt,
        runOrientation: run.orientation,
        runLengthPt: run.lengthPt,
        wallAuthority: run.wallAuthority,
      });
    });
  }
  return out;
}

function evidenceId(subjectKey: string, propertyPath: string): string {
  return `E-${OPENING_GEOMETRY_PASS_ID}-${subjectKey}-${propertyPath}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);
}

function makeOpeningEvidence(input: {
  subjectKey: string;
  pageNumber: number;
  propertyPath: string;
  candidateValue: string | number | boolean | null;
  description: string;
  originalText: string;
  type: "geometry" | "note";
}): Evidence {
  return evidenceSchema.parse({
    id: evidenceId(input.subjectKey, input.propertyPath),
    type: input.type,
    relationship: "supports",
    description: input.description,
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: input.subjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: input.originalText,
    references: [],
    subjectKind: "opening",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: OPENING_GEOMETRY_PASS_ID,
    bundleId: "opening-geometry",
  });
}

export function discoverGovernedOpeningCandidates(
  pages: readonly CompiledDrawingPage[],
): GovernedOpeningCandidate[] {
  const out: GovernedOpeningCandidate[] = [];

  for (const page of pages) {
    if (!isPlanLayoutPage(page)) continue;
    const ptPerFt = page.ptPerFt ?? 18;
    const gaps = collectGapCandidates(page);

    const byRun = new Map<string, OpeningGapCandidate[]>();
    for (const candidate of gaps) {
      const list = byRun.get(candidate.physicalRunKey) ?? [];
      list.push(candidate);
      byRun.set(candidate.physicalRunKey, list);
    }

    for (const [physicalRunKey, runGaps] of byRun) {
      const run = page.geometry.pbgRuns.find(
        (r) => r.physicalRunKey === physicalRunKey,
      );
      if (!run) continue;

      const dimEntries = runGaps.map((candidate) => ({
        candidate,
        ownership: governOpeningDimensionOwnership(page, run, candidate),
      }));
      const exclusiveDims = applyParentRunDimensionExclusivity(
        dimEntries,
        run,
        ptPerFt,
      );

      for (let i = 0; i < runGaps.length; i++) {
        const candidate = runGaps[i]!;
        const dimensionOwnership = exclusiveDims[i]!;
        const roughWidth =
          dimensionOwnership.status === "ESTABLISHED"
            ? dimensionOwnership.roughWidthFeet
            : null;

        const physicalRunOwnership = governOpeningPhysicalRunOwnership(
          candidate,
          run,
          ptPerFt,
          roughWidth,
        );

        const category = classifyCategoryFromLabels(page, candidate.gapAt);
        const materialAuthoritative =
          physicalRunOwnership.status === "ESTABLISHED" &&
          dimensionOwnership.status === "ESTABLISHED" &&
          physicalRunOwnership.positionOffsetFeetFromSegmentStart != null &&
          roughWidth != null;

        out.push({
          ...candidate,
          category,
          physicalRunOwnership,
          dimensionOwnership,
          materialAuthoritative,
        });
      }
    }
  }

  return out;
}

/**
 * Build deterministic opening Evidence from compiled drawing pages (Authority A–C).
 */
export function buildOpeningEvidenceFromCompiledPages(
  pages: readonly CompiledDrawingPage[],
): Evidence[] {
  const evidence: Evidence[] = [];

  for (const candidate of discoverGovernedOpeningCandidates(pages)) {
    // Keep raw gap inventory out of Opening domain / review queues.
    if (!shouldPromoteOpeningToDomain(candidate)) continue;

    const { openingSubjectKey, pageNumber } = candidate;
    const notes = [
      ...candidate.physicalRunOwnership.notes,
      ...candidate.dimensionOwnership.notes,
    ].join(" ");

    evidence.push(
      makeOpeningEvidence({
        subjectKey: openingSubjectKey,
        pageNumber,
        propertyPath: "category",
        candidateValue: candidate.category,
        description: `Opening category from plan label near gap (${candidate.category})`,
        originalText: notes,
        type: "geometry",
      }),
    );

    if (candidate.physicalRunOwnership.parentPhysicalRunKey) {
      evidence.push(
        makeOpeningEvidence({
          subjectKey: openingSubjectKey,
          pageNumber,
          propertyPath: "parentPhysicalRunKey",
          candidateValue: candidate.physicalRunOwnership.parentPhysicalRunKey,
          description: "Parent physical run from PBG gap ownership",
          originalText: notes,
          type: "geometry",
        }),
      );
    }

    if (candidate.physicalRunOwnership.positionOffsetFeetFromSegmentStart != null) {
      evidence.push(
        makeOpeningEvidence({
          subjectKey: openingSubjectKey,
          pageNumber,
          propertyPath: "positionOffsetFeetFromSegmentStart",
          candidateValue:
            candidate.physicalRunOwnership.positionOffsetFeetFromSegmentStart,
          description: "Opening left-edge offset from segment start",
          originalText: notes,
          type: "geometry",
        }),
      );
    }

    if (candidate.dimensionOwnership.status === "ESTABLISHED") {
      if (candidate.dimensionOwnership.roughWidthFeet != null) {
        evidence.push(
          makeOpeningEvidence({
            subjectKey: openingSubjectKey,
            pageNumber,
            propertyPath: "dimensions.roughWidthFeet",
            candidateValue: candidate.dimensionOwnership.roughWidthFeet,
            description: `ESTABLISHED opening width: ${candidate.dimensionOwnership.originalText}`,
            originalText: candidate.dimensionOwnership.originalText ?? notes,
            type: "geometry",
          }),
        );
      }
      if (candidate.dimensionOwnership.nominalWidthFeet != null) {
        evidence.push(
          makeOpeningEvidence({
            subjectKey: openingSubjectKey,
            pageNumber,
            propertyPath: "dimensions.nominalWidthFeet",
            candidateValue: candidate.dimensionOwnership.nominalWidthFeet,
            description: `ESTABLISHED opening nominal width: ${candidate.dimensionOwnership.originalText}`,
            originalText: candidate.dimensionOwnership.originalText ?? notes,
            type: "geometry",
          }),
        );
      }
    }

    evidence.push(
      makeOpeningEvidence({
        subjectKey: openingSubjectKey,
        pageNumber,
        propertyPath: "dimensionOwnershipStatus",
        candidateValue: candidate.dimensionOwnership.status,
        description: `Dimension ownership: ${candidate.dimensionOwnership.status}`,
        originalText: notes,
        type: "geometry",
      }),
    );

    evidence.push(
      makeOpeningEvidence({
        subjectKey: openingSubjectKey,
        pageNumber,
        propertyPath: "quantity",
        candidateValue: 1,
        description: "Single labeled opening occurrence at gap location",
        originalText: notes,
        type: "geometry",
      }),
    );
  }

  return evidence;
}
