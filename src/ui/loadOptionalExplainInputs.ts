import { readFileSync } from "node:fs";
import path from "node:path";

import type { Evidence } from "../core/schemas/evidence.schema.js";
import type { ExplainReadCompleteReport } from "../framing/benchmark/explainBurtonBenchmark.js";
import { extractedFramingEvidencePayloadSchema } from "../framing/schemas/framing-artifacts.schema.js";

function basename(filePath: string): string {
  return path.basename(filePath);
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function parseEvidence(raw: unknown): Evidence[] | undefined {
  const candidate =
    raw && typeof raw === "object" && "payload" in raw
      ? (raw as { payload: unknown }).payload
      : raw;
  const parsed = extractedFramingEvidencePayloadSchema.safeParse(candidate);
  return parsed.success ? parsed.data.evidence : undefined;
}

function parseReadComplete(raw: unknown): ExplainReadCompleteReport | undefined {
  if (!raw || typeof raw !== "object" || !("conditions" in raw)) {
    return undefined;
  }
  const conditions = (raw as { conditions: unknown }).conditions;
  if (!Array.isArray(conditions)) {
    return undefined;
  }
  return raw as ExplainReadCompleteReport;
}

/**
 * Load optional XPL inputs from existing debug artifacts.
 * Does not load reader-construction.json (pre-calc).
 */
export function loadOptionalExplainInputs(debugPaths: readonly string[]): {
  evidence?: Evidence[];
  readComplete?: ExplainReadCompleteReport;
} {
  let evidence: Evidence[] | undefined;
  let readComplete: ExplainReadCompleteReport | undefined;

  for (const filePath of debugPaths) {
    const name = basename(filePath);
    if (name === "reader-construction.json") {
      continue;
    }
    try {
      if (name === "reader-extracted-evidence.json") {
        evidence = parseEvidence(readJson(filePath));
      }
      if (name === "reader-read-complete.json") {
        readComplete = parseReadComplete(readJson(filePath));
      }
    } catch {
      // Missing or unreadable hops stay unavailable in XPL.
    }
  }

  return { evidence, readComplete };
}
