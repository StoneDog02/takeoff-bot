/**
 * Offline replay of Beckstead B1.4 live visual classification for audits/CI.
 * Does not call Claude — merges stored matrix into deterministic classification.
 */
import { readFile } from "node:fs/promises";

import type { ClassifiedPlanPage } from "./pageClassification.js";
import {
  mergeVisualPageClassifications,
  visualPageClassificationPayloadSchema,
  type VisualPageClassificationPayload,
} from "./visualPageClassification.js";

type B14MatrixEntry = {
  pageNumber: number;
  pageKind: string;
  scopeHints?: string[];
  titleOrLabel?: string | null;
  evidenceText?: string;
  confidence?: string;
  evidenceOrReason?: string;
};

export function b14MatrixToVisualPayload(
  matrix: readonly B14MatrixEntry[],
): VisualPageClassificationPayload {
  return visualPageClassificationPayloadSchema.parse({
    pages: matrix.map((entry) => ({
      pageNumber: entry.pageNumber,
      pageKind: entry.pageKind,
      scopeHints: entry.scopeHints ?? [],
      contentRoles: [],
      titleOrLabel: entry.titleOrLabel ?? null,
      evidenceText: entry.evidenceText ?? entry.evidenceOrReason ?? "B1.4 fixture",
      confidenceLabel:
        entry.confidence === "high" ||
        entry.confidence === "medium" ||
        entry.confidence === "low"
          ? entry.confidence
          : "medium",
      classificationReason:
        entry.evidenceOrReason ?? "Replay from Beckstead B1.4 live classification fixture",
    })),
  });
}

export async function loadBecksteadB14VisualClassificationFixture(
  fixturePath: string,
): Promise<VisualPageClassificationPayload> {
  const raw = JSON.parse(await readFile(fixturePath, "utf8")) as {
    matrix?: B14MatrixEntry[];
  };
  if (!raw.matrix?.length) {
    throw new Error(`Beckstead B1.4 fixture missing matrix: ${fixturePath}`);
  }
  return b14MatrixToVisualPayload(raw.matrix);
}

export function applyVisualClassificationFixture(
  existing: readonly ClassifiedPlanPage[],
  fixture: VisualPageClassificationPayload,
): ClassifiedPlanPage[] {
  return mergeVisualPageClassifications({
    existing,
    visualPayload: fixture,
  });
}
