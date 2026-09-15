import type {
  BenchmarkComparisonResult,
  BenchmarkComparisonRow,
  ProvenanceHopStatus,
} from "./benchmarkComparison.schema.js";
import {
  csvHopList,
  csvScalar,
  evidenceHopForRow,
} from "./benchmarkDisplay.js";

/**
 * Diagnostic CSV flattening of a canonical CMP+XPL result.
 * Does not recompute statuses, deltas, eligibility, or diagnostics.
 */

export const BURTON_BENCHMARK_CSV_COLUMNS = [
  "benchmark_id",
  "benchmark_version",
  "run_id",
  "run_kind",
  "benchmark_item_id",
  "material_family",
  "material_description",
  "spec",
  "quantity_layer",
  "our_quantity",
  "our_unit",
  "burton_quantity",
  "burton_unit",
  "difference_quantity",
  "difference_percent",
  "comparison_status",
  "diagnostic_class",
  "comparison_eligible",
  "quantity_key",
  "physical_ids",
  "debug_source_ids",
  "project_pages",
  "evidence_ids",
  "read_complete_statuses",
  "house_trace_methods",
  "assumption_ids",
  "unresolved_reason_codes",
  "calc_status",
  "calc_identity",
  "s5_status",
  "provenance_join_status",
  "provenance_incomplete",
  "related_not_compared",
  "quantity_lineage_complete",
  "defensibility_evidence_complete",
  "hop_takeoff_line",
  "hop_construction",
  "hop_physical_id",
  "hop_traces",
  "hop_evidence_pages",
  "hop_read_complete",
  "hop_unresolved",
  "hop_quantity_lineage",
  "hop_defensibility",
  "scope_gate",
  "unit_gate",
  "quantity_layer_gate",
  "numeric_compared_count",
  "eligible_item_count",
  "match_percent",
  "within_inner3_percent",
  "within_outer5_percent",
  "outside_percent",
  "explanation_text",
] as const;

export type BurtonBenchmarkCsvColumn =
  (typeof BURTON_BENCHMARK_CSV_COLUMNS)[number];

function rfc4180(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function hopStatus(
  hop: ProvenanceHopStatus | undefined,
): string {
  return hop ?? "unavailable";
}

function flattenRow(
  result: BenchmarkComparisonResult,
  row: BenchmarkComparisonRow,
): Record<BurtonBenchmarkCsvColumn, string> {
  const hops = row.explanationRef.hops;
  const evidenceHop = evidenceHopForRow(row);
  const grade = result.gradeSheet;
  return {
    benchmark_id: result.benchmarkId,
    benchmark_version: result.benchmarkVersion,
    run_id: result.runId,
    run_kind: result.runKind,
    benchmark_item_id: csvScalar(row.burton?.benchmarkItemId ?? null),
    material_family: csvScalar(row.burton?.normalizedFamily ?? null),
    material_description: csvScalar(
      row.burton?.originalDescription ?? row.ours?.material ?? null,
    ),
    spec: csvScalar(
      row.burton?.normalizedSpec ?? row.ours?.canonicalClassification ?? null,
    ),
    quantity_layer: csvScalar(row.burton?.quantityLayer ?? null),
    our_quantity: csvScalar(row.ours?.quantity ?? null),
    our_unit: csvScalar(row.ours?.unit ?? null),
    burton_quantity: csvScalar(row.burton?.originalQuantity ?? null),
    burton_unit: csvScalar(row.burton?.originalUnit ?? null),
    difference_quantity: csvScalar(row.absDelta),
    difference_percent: csvScalar(row.pctDelta),
    comparison_status: row.status,
    diagnostic_class: csvScalar(row.diagnosticClass),
    comparison_eligible: csvScalar(row.burton?.comparisonEligible ?? null),
    quantity_key: csvScalar(row.ours?.quantityKey ?? null),
    physical_ids: csvHopList(hops?.physicalId, row.explanationRef.physicalIds ?? []),
    debug_source_ids: csvHopList(
      hops?.takeoffLine,
      row.explanationRef.debugSourceIds ?? [],
    ),
    project_pages: csvHopList(
      evidenceHop,
      (row.explanationRef.evidencePages ?? []).map((page) => String(page)),
    ),
    evidence_ids: csvHopList(evidenceHop, row.explanationRef.evidenceIds ?? []),
    read_complete_statuses: csvHopList(
      hops?.readComplete,
      (row.explanationRef.readCompleteFields ?? []).map(
        (field) =>
          `${field.conditionId}:${field.propertyPath}=${field.status}`,
      ),
    ),
    house_trace_methods: csvHopList(
      hops?.traces,
      row.explanationRef.houseTraceMethods ?? [],
    ),
    assumption_ids: csvHopList(
      hops?.traces,
      row.explanationRef.assumptionIds ?? [],
    ),
    unresolved_reason_codes: csvHopList(
      hops?.unresolved,
      (row.explanationRef.unresolvedRecords ?? []).map(
        (record) => record.reasonCode,
      ),
    ),
    calc_status: csvScalar(row.explanationRef.calcStatus ?? null),
    calc_identity: csvScalar(row.explanationRef.calcIdentity ?? null),
    s5_status: row.s5Status,
    provenance_join_status: hopStatus(evidenceHop),
    provenance_incomplete: csvScalar(row.explanationRef.provenanceIncomplete),
    related_not_compared: csvScalar(
      row.explanationRef.relatedNotCompared ?? false,
    ),
    quantity_lineage_complete: csvScalar(
      row.explanationRef.quantityLineageComplete ?? false,
    ),
    defensibility_evidence_complete: csvScalar(
      row.explanationRef.defensibilityEvidenceComplete ?? false,
    ),
    hop_takeoff_line: hopStatus(hops?.takeoffLine),
    hop_construction: hopStatus(hops?.construction),
    hop_physical_id: hopStatus(hops?.physicalId),
    hop_traces: hopStatus(hops?.traces),
    hop_evidence_pages: hopStatus(hops?.evidencePages),
    hop_read_complete: hopStatus(hops?.readComplete),
    hop_unresolved: hopStatus(hops?.unresolved),
    hop_quantity_lineage: hopStatus(hops?.quantityLineage),
    hop_defensibility: hopStatus(hops?.defensibility),
    scope_gate: row.scopeGate,
    unit_gate: row.unitGate,
    quantity_layer_gate: row.quantityLayerGate,
    numeric_compared_count: csvScalar(
      grade.quantityAgreement.numericComparedCount,
    ),
    eligible_item_count: csvScalar(grade.quantityAgreement.eligibleItemCount),
    match_percent: csvScalar(grade.quantityAgreement.matchPercent),
    within_inner3_percent: csvScalar(grade.quantityAgreement.withinInner3Percent),
    within_outer5_percent: csvScalar(grade.quantityAgreement.withinOuter5Percent),
    outside_percent: csvScalar(grade.quantityAgreement.outsidePercent),
    explanation_text: row.explanationRef.explanationText,
  };
}

export function exportBurtonBenchmarkCsv(
  result: BenchmarkComparisonResult,
): string {
  const header = BURTON_BENCHMARK_CSV_COLUMNS.join(",");
  const lines = result.rows.map((row) => {
    const cells = flattenRow(result, row);
    return BURTON_BENCHMARK_CSV_COLUMNS.map((column) =>
      rfc4180(cells[column]),
    ).join(",");
  });
  return [header, ...lines].join("\n");
}
