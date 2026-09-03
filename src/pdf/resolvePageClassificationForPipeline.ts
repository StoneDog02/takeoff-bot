/**
 * Production page-classification resolution for the framing pipeline.
 *
 * Deterministic text/outline classification always runs first.
 * When live AI is enabled and pages remain visual-pending (typical for
 * OCR-only CAD PDFs like Beckstead), runs the existing full-sheet visual
 * classifier and merges results — without inventing framing quantities.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { classifyPlanPagesDeterministically } from "./classifyPlanPages.js";
import { classifyPlanPagesVisuallyViaClaude } from "./classifyPlanPagesVisually.js";
import {
  applyVisualClassificationFixture,
  loadBecksteadB14VisualClassificationFixture,
} from "./loadBecksteadB14VisualClassificationFixture.js";
import type { ClassifiedPlanPage } from "./pageClassification.js";
import type { PlanIndex } from "./PlanPage.js";
import { renderPlanPageVisuals } from "./renderPlanPageVisuals.js";

export type ResolvePageClassificationResult = {
  pages: ClassifiedPlanPage[];
  visualClassificationRan: boolean;
  visualPendingBefore: number;
  visualPendingAfter: number;
  framingRelevantCount: number;
};

export async function resolvePageClassificationForPipeline(input: {
  planIndex: PlanIndex;
  useMockAi: boolean;
  /** Optional Claude call hook (audit token accounting). */
  onApiCall?: () => void;
}): Promise<ResolvePageClassificationResult> {
  const deterministic = classifyPlanPagesDeterministically(input.planIndex);
  const pendingBefore = deterministic.filter((p) => p.needsVisualClassification)
    .length;

  if (input.useMockAi || pendingBefore === 0) {
    const framingRelevantCount = deterministic.filter(
      (p) => p.relevantToFraming,
    ).length;
    return {
      pages: deterministic,
      visualClassificationRan: false,
      visualPendingBefore: pendingBefore,
      visualPendingAfter: pendingBefore,
      framingRelevantCount,
    };
  }

  const fixturePath = process.env.TAKEOFF_VISUAL_CLASSIFICATION_FIXTURE_PATH?.trim();
  if (fixturePath) {
    const fixture = await loadBecksteadB14VisualClassificationFixture(fixturePath);
    const pages = applyVisualClassificationFixture(deterministic, fixture);
    const pendingAfter = pages.filter((p) => p.needsVisualClassification).length;
    return {
      pages,
      visualClassificationRan: true,
      visualPendingBefore: pendingBefore,
      visualPendingAfter: pendingAfter,
      framingRelevantCount: pages.filter((p) => p.relevantToFraming).length,
    };
  }

  const pendingPages = deterministic
    .filter((p) => p.needsVisualClassification)
    .map((p) => p.pageNumber);

  const outputDir = await mkdtemp(
    path.join(tmpdir(), "takeoff-bot-visual-classify-"),
  );
  const visualSet = await renderPlanPageVisuals({
    pdfPath: input.planIndex.pdfPath,
    pageNumbers: pendingPages,
    outputDir,
    scale: 1,
  });

  const visualResult = await classifyPlanPagesVisuallyViaClaude({
    planIndex: input.planIndex,
    existingClassification: deterministic,
    pageVisuals: visualSet.pages,
    onApiCall: input.onApiCall,
  });

  const pages = visualResult.classifiedPages;
  const pendingAfter = pages.filter((p) => p.needsVisualClassification).length;
  const framingRelevantCount = pages.filter((p) => p.relevantToFraming).length;

  return {
    pages,
    visualClassificationRan: true,
    visualPendingBefore: pendingBefore,
    visualPendingAfter: pendingAfter,
    framingRelevantCount,
  };
}
