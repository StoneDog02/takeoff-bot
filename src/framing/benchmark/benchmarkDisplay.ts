import type {
  BenchmarkComparisonRow,
  ComparisonStatus,
  ProvenanceHopStatus,
} from "./benchmarkComparison.schema.js";

/**
 * Presentation tokens for B-UI-1. Do not recompute comparison or diagnostics.
 * Empty evidence pages are provenance unavailable, not "no project evidence."
 */

export const UNAVAILABLE_TOKEN = "unavailable";
export const NULL_TOKEN = "null";
export const AGREEMENT_UNAVAILABLE_LABEL = "unavailable / not yet comparable";
export const EVIDENCE_NOT_JOINED_LABEL = "unavailable / not joined";
export const RELATED_NOT_COMPARED_LABEL = "related / not compared";

export type StatusTone =
  | "match"
  | "within"
  | "outside"
  | "ours-only"
  | "not-comparable"
  | "missing-ours"
  | "unresolved";

export function formatAgreementPercent(value: number | null): string {
  if (value === null) {
    return AGREEMENT_UNAVAILABLE_LABEL;
  }
  return `${value}%`;
}

export function formatQuantityCell(value: number | null): string {
  if (value === null) {
    return UNAVAILABLE_TOKEN;
  }
  return String(value);
}

export function formatNullableText(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return UNAVAILABLE_TOKEN;
  }
  return value;
}

export function statusTone(status: ComparisonStatus): StatusTone {
  if (status === "MATCH") {
    return "match";
  }
  if (status.startsWith("WITHIN TARGET")) {
    return "within";
  }
  if (status.startsWith("OUTSIDE TOLERANCE")) {
    return "outside";
  }
  if (status === "OURS ONLY") {
    return "ours-only";
  }
  if (status === "NOT COMPARABLE") {
    return "not-comparable";
  }
  if (status === "MISSING OURS") {
    return "missing-ours";
  }
  return "unresolved";
}

export function formatEvidencePages(
  pages: readonly number[],
  hop: ProvenanceHopStatus | undefined,
): string {
  if (hop === "joined" && pages.length > 0) {
    return pages.join(" | ");
  }
  if (hop === "partial" && pages.length > 0) {
    return `${pages.join(" | ")} (incomplete)`;
  }
  return EVIDENCE_NOT_JOINED_LABEL;
}

export function csvScalar(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) {
    return NULL_TOKEN;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export function csvHopList(
  hop: ProvenanceHopStatus | undefined,
  values: readonly string[],
): string {
  if (hop === "unavailable" || hop === "not_applicable" || hop === undefined) {
    return UNAVAILABLE_TOKEN;
  }
  return values.join("|");
}

export function evidenceHopForRow(
  row: BenchmarkComparisonRow,
): ProvenanceHopStatus | undefined {
  return row.explanationRef.hops?.evidencePages;
}
