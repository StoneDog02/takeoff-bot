import { createHash } from "node:crypto";

import type { PlanIndex } from "./PlanPage.js";

/**
 * Stable fingerprint of plan-source content used for Evidence replay safety.
 *
 * Hashes page numbers and text-layer content only. Excludes `pdfPath` and
 * `indexedAt` so relocating the same PDF does not force re-extraction, while
 * any material text-layer change invalidates replay.
 */
export function computePlanSourceFingerprint(planIndex: PlanIndex): string {
  const pages = [...planIndex.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => `${page.pageNumber}\n${page.textContent}`)
    .join("\n\u001e\n");

  return createHash("sha256")
    .update(`pages=${planIndex.totalPages}\n${pages}`, "utf8")
    .digest("hex");
}
