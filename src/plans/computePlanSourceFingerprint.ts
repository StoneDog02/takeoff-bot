import { createHash } from "node:crypto";

import type { PlanIndex } from "./PlanPage.js";

/**
 * Stable fingerprint of plan-source content used for Evidence replay safety.
 *
 * Includes:
 * - sourceContentHash (PDF bytes) when present — required for visual-only plans
 * - page numbers + text-layer content — catches text-layer fixtures / changes
 *
 * Excludes `pdfPath` and `indexedAt` so relocating the same PDF does not force
 * re-extraction.
 */
export function computePlanSourceFingerprint(planIndex: PlanIndex): string {
  const pages = [...planIndex.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => `${page.pageNumber}\n${page.textContent}`)
    .join("\n\u001e\n");

  const contentHash = planIndex.sourceContentHash ?? "";

  return createHash("sha256")
    .update(
      `contentHash=${contentHash}\npages=${planIndex.totalPages}\n${pages}`,
      "utf8",
    )
    .digest("hex");
}
