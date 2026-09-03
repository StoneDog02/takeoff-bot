import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { Evidence } from "../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../core/schemas/evidence.schema.js";
import type { OpeningCategory } from "../schemas/opening.schema.js";
import {
  applyParentRunDimensionExclusivity,
  governOpeningDimensionOwnership,
} from "./governOpeningDimensionOwnership.js";
import {
  applyParentRunMarkExclusivity,
  governOpeningMarkOwnership,
} from "./governOpeningMarkOwnership.js";
import { governOpeningPhysicalRunOwnership } from "./governOpeningPhysicalRunOwnership.js";
import type {
  GovernedOpeningCandidate,
  OpeningGapCandidate,
  OwnedOpeningMarkBinding,
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

function resolveCategory(candidate: {
  markOwnership: GovernedOpeningCandidate["markOwnership"];
}): OpeningCategory {
  return candidate.markOwnership.literalCategory ?? "unknown";
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

      const markEntries = runGaps.map((candidate) => ({
        candidate,
        ownership: governOpeningMarkOwnership(page, run, candidate),
      }));
      const exclusiveMarks = applyParentRunMarkExclusivity(markEntries);

      for (let i = 0; i < runGaps.length; i++) {
        const candidate = runGaps[i]!;
        const dimensionOwnership = exclusiveDims[i]!;
        const markOwnership = exclusiveMarks[i]!;
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

        const category = resolveCategory({ markOwnership });
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
          markOwnership,
          materialAuthoritative,
        });
      }
    }
  }

  return out;
}

export type OpeningGeometryEvidenceBuild = {
  evidence: Evidence[];
  ownedMarks: OwnedOpeningMarkBinding[];
};

/**
 * Build deterministic opening Evidence from compiled drawing pages (Authority A–C)
 * plus governed mark→gap ownership for same-subject category contribution.
 */
export function buildOpeningEvidenceFromCompiledPages(
  pages: readonly CompiledDrawingPage[],
): Evidence[] {
  return buildOpeningEvidenceWithMarkOwnership(pages).evidence;
}

export function buildOpeningEvidenceWithMarkOwnership(
  pages: readonly CompiledDrawingPage[],
): OpeningGeometryEvidenceBuild {
  const evidence: Evidence[] = [];
  const ownedMarks: OwnedOpeningMarkBinding[] = [];

  for (const candidate of discoverGovernedOpeningCandidates(pages)) {
    // Keep raw gap inventory out of Opening domain / review queues.
    if (!shouldPromoteOpeningToDomain(candidate)) continue;

    const { openingSubjectKey, pageNumber } = candidate;
    const notes = [
      ...candidate.physicalRunOwnership.notes,
      ...candidate.dimensionOwnership.notes,
      ...candidate.markOwnership.notes,
    ].join(" ");

    if (
      candidate.markOwnership.status === "ESTABLISHED" &&
      candidate.markOwnership.markText != null
    ) {
      ownedMarks.push({
        geometrySubjectKey: openingSubjectKey,
        pageNumber,
        markText: candidate.markOwnership.markText,
        textPrimitiveId: candidate.markOwnership.textPrimitiveId,
        literalCategory: candidate.markOwnership.literalCategory,
      });
    }

    // Emit non-unknown category only from ESTABLISHED literal label ownership.
    // Type-mark-only ESTABLISHED ownership waits for Claude adopt (same subject).
    if (candidate.category !== "unknown") {
      evidence.push(
        makeOpeningEvidence({
          subjectKey: openingSubjectKey,
          pageNumber,
          propertyPath: "category",
          candidateValue: candidate.category,
          description: `Opening category from ESTABLISHED mark/label ownership (${candidate.category})`,
          originalText: candidate.markOwnership.markText ?? notes,
          type: "geometry",
        }),
      );
    } else {
      evidence.push(
        makeOpeningEvidence({
          subjectKey: openingSubjectKey,
          pageNumber,
          propertyPath: "category",
          candidateValue: "unknown",
          description: `Opening category from plan label near gap (${candidate.category})`,
          originalText: notes,
          type: "geometry",
        }),
      );
    }

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

  return { evidence, ownedMarks };
}
