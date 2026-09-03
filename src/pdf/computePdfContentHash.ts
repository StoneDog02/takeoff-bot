import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * SHA-256 of raw PDF bytes. Primary source identity for visual-only plans.
 */
export async function computePdfContentHash(pdfPath: string): Promise<string> {
  const bytes = await readFile(pdfPath);
  return createHash("sha256").update(bytes).digest("hex");
}

export function computePdfContentHashSync(pdfBytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(pdfBytes).digest("hex");
}
