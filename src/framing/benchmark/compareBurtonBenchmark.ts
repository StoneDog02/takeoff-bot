import type { FramingMaterialLine, FramingTakeoff } from "../schemas/framingTakeoff.schema.js";

import {
  benchmarkComparisonResultSchema,
  type BenchmarkComparisonResult,
  type BenchmarkComparisonRow,
  type ComparisonDiagnosticClass,
  type ComparisonGate,
  type ComparisonStatus,
} from "./benchmarkComparison.schema.js";
import type {
  BurtonBenchmarkFixture,
  BurtonBenchmarkItem,
  BurtonEngineJoin,
  BurtonQuantityLayer,
} from "./burtonBenchmark.schema.js";

const NUMERIC_STATUSES = new Set<ComparisonStatus>([
  "MATCH",
  "WITHIN TARGET — OURS HIGH",
  "WITHIN TARGET — OURS LOW",
  "OUTSIDE TOLERANCE — OURS HIGH",
  "OUTSIDE TOLERANCE — OURS LOW",
]);

const IDENTITY_STATUSES = new Set<ComparisonStatus>([
  ...NUMERIC_STATUSES,
  "MISSING OURS",
  "UNRESOLVED",
]);

export type CompareBurtonBenchmarkInput = {
  takeoff: FramingTakeoff;
  benchmark: BurtonBenchmarkFixture;
  reportingBands?: { inner: number; outer: number };
  runId: string;
  runKind?: "synthetic" | "live" | "replay";
  unresolvedQuantityKeys?: readonly string[];
  unsupportedEmitters?: readonly string[];
};

type Draft = {
  row: BenchmarkComparisonRow;
  mappedIdentity: string | null;
  ourIndex: number | null;
};

function canonicalizeUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  if (normalized === "ea" || normalized === "each") {
    return "each";
  }
  if (normalized === "lf" || normalized === "linear-foot") {
    return "linear-foot";
  }
  if (normalized === "sf" || normalized === "square-foot") {
    return "square-foot";
  }
  return normalized;
}

function unitsAliasMatch(left: string, right: string): boolean {
  return canonicalizeUnit(left) === canonicalizeUnit(right);
}

function isInstallUnit(unit: string): boolean {
  const canonical = canonicalizeUnit(unit);
  return canonical === "linear-foot" || canonical === "square-foot";
}

function stockVersusInstall(
  layer: BurtonQuantityLayer,
  joinUnit: string,
): boolean {
  if (layer === "package_lump") {
    return true;
  }
  return layer === "procurement_stock_ea" && isInstallUnit(joinUnit);
}

function layerGatePass(
  layer: BurtonQuantityLayer,
  joinUnit: string,
): boolean {
  if (layer === "out_of_framing_scope" || layer === "package_lump") {
    return false;
  }
  const canonical = canonicalizeUnit(joinUnit);
  if (layer === "procurement_stock_ea") {
    return canonical === "each";
  }
  if (layer === "procurement_lf") {
    return canonical === "linear-foot";
  }
  return false;
}

function usableJoin(
  join: BurtonEngineJoin | null,
): join is BurtonEngineJoin & { quantityKeys: [string] } {
  return join !== null && join.quantityKeys.length === 1;
}

function mappedIdentity(join: BurtonEngineJoin): string {
  const key = join.quantityKeys[0] ?? "";
  const prefix = join.canonicalClassificationPrefix ?? "";
  return `${key}|${prefix}`;
}

function matchesJoin(
  line: FramingMaterialLine,
  join: BurtonEngineJoin,
): boolean {
  const key = join.quantityKeys[0];
  if (!key || line.quantityKey !== key) {
    return false;
  }
  const prefix = join.canonicalClassificationPrefix;
  if (!prefix) {
    return true;
  }
  return (line.canonicalClassification ?? "").startsWith(prefix);
}

function emptyExplanation(
  whatWeReturned: string,
  burtonCompare: string,
  explanationText: string,
  unresolved: string[] = [],
): BenchmarkComparisonRow["explanationRef"] {
  return {
    whatWeReturned,
    burtonCompare,
    evidencePages: [],
    unresolved,
    provenanceIncomplete: true,
    explanationText,
  };
}

function burtonSide(item: BurtonBenchmarkItem): BenchmarkComparisonRow["burton"] {
  return {
    benchmarkItemId: item.benchmarkItemId,
    section: item.section,
    originalDescription: item.originalDescription,
    originalQuantity: item.originalQuantity,
    originalUnit: item.originalUnit,
    normalizedFamily: item.normalizedFamily,
    normalizedSpec: item.normalizedSpec,
    quantityLayer: item.quantityLayer,
    comparisonEligible: item.comparisonEligible,
    comparisonUnit: item.comparisonUnit,
  };
}

function notComparableRow(
  item: BurtonBenchmarkItem,
  explanationText: string,
  gates: {
    scope: ComparisonGate;
    unit: ComparisonGate;
    layer: ComparisonGate;
  },
  diagnosticClass: ComparisonDiagnosticClass | null,
  s5Status: BenchmarkComparisonRow["s5Status"],
): BenchmarkComparisonRow {
  return {
    status: "NOT COMPARABLE",
    burton: burtonSide(item),
    ours: null,
    absDelta: null,
    pctDelta: null,
    quantityLayerGate: gates.layer,
    unitGate: gates.unit,
    scopeGate: gates.scope,
    engineJoinUsed: item.engineJoin,
    diagnosticClass,
    s5Status,
    explanationRef: emptyExplanation(
      "no numeric Our Takeoff quantity used",
      "NOT COMPARABLE",
      explanationText,
    ),
  };
}

function numericStatus(
  ours: number,
  burton: number,
  outer: number,
): ComparisonStatus {
  if (ours === burton) {
    return "MATCH";
  }
  const pct = ((ours - burton) / burton) * 100;
  const absPct = Math.abs(pct);
  const high = ours > burton;
  if (absPct <= outer) {
    return high ? "WITHIN TARGET — OURS HIGH" : "WITHIN TARGET — OURS LOW";
  }
  return high ? "OUTSIDE TOLERANCE — OURS HIGH" : "OUTSIDE TOLERANCE — OURS LOW";
}

function resolveItem(
  item: BurtonBenchmarkItem,
  materials: readonly FramingMaterialLine[],
  unresolvedKeys: ReadonlySet<string>,
  unsupportedEmitters: ReadonlySet<string>,
  outer: number,
): Draft {
  const unevaluated = {
    scope: "not_evaluated" as const,
    unit: "not_evaluated" as const,
    layer: "not_evaluated" as const,
  };

  if (!item.comparisonEligible) {
    return {
      mappedIdentity: null,
      ourIndex: null,
      row: notComparableRow(
        item,
        "NOT COMPARABLE: comparisonEligible is false. Same-family and candidate engineJoin are not numeric-comparability.",
        { ...unevaluated, scope: "fail" },
        "NOT COMPARABLE",
        "not_applicable",
      ),
    };
  }

  if (!usableJoin(item.engineJoin)) {
    return {
      mappedIdentity: null,
      ourIndex: null,
      row: notComparableRow(
        item,
        "NOT COMPARABLE: engineJoin is null, empty, or unusable. A missing mapping is not MISSING OURS.",
        { scope: "pass", unit: "not_evaluated", layer: "not_evaluated" },
        "NOT COMPARABLE",
        "not_applicable",
      ),
    };
  }

  const join = item.engineJoin;
  const identity = mappedIdentity(join);
  const mappedKey = join.quantityKeys[0]!;
  const s5Missing = stockVersusInstall(item.quantityLayer, join.unit);
  const s5Status = s5Missing ? "not_implemented" : "not_applicable";
  const unitPass = unitsAliasMatch(join.unit, item.comparisonUnit);
  const layerPass = layerGatePass(item.quantityLayer, join.unit);

  if (!unitPass || !layerPass) {
    return {
      mappedIdentity: null,
      ourIndex: null,
      row: notComparableRow(
        item,
        !unitPass
          ? "NOT COMPARABLE: unit gate failed. No procurement-to-install conversion."
          : "NOT COMPARABLE: quantity-layer gate failed. No procurement-to-install conversion.",
        {
          scope: "pass",
          unit: unitPass ? "pass" : "fail",
          layer: layerPass ? "pass" : "fail",
        },
        s5Missing ? "S5 missing" : "NOT COMPARABLE",
        s5Status,
      ),
    };
  }

  const matches: number[] = [];
  for (const [index, line] of materials.entries()) {
    if (matchesJoin(line, join)) {
      matches.push(index);
    }
  }

  if (matches.length > 1) {
    return {
      mappedIdentity: null,
      ourIndex: null,
      row: notComparableRow(
        item,
        "NOT COMPARABLE: ambiguous engineJoin matched multiple Our Takeoff lines. Did not select a numerically nearest line or sum quantities.",
        { scope: "pass", unit: "pass", layer: "pass" },
        "NOT COMPARABLE",
        s5Status,
      ),
    };
  }

  if (matches.length === 1) {
    const ourIndex = matches[0]!;
    const line = materials[ourIndex]!;
    if (!unitsAliasMatch(line.unit, join.unit)) {
      return {
        mappedIdentity: null,
        ourIndex: null,
        row: notComparableRow(
          item,
          "NOT COMPARABLE: Our Takeoff unit does not alias-match the mapped join unit. No conversion applied.",
          { scope: "pass", unit: "fail", layer: "pass" },
          s5Missing ? "S5 missing" : "NOT COMPARABLE",
          s5Status,
        ),
      };
    }
    if (item.originalQuantity === 0) {
      return {
        mappedIdentity: null,
        ourIndex: null,
        row: notComparableRow(
          item,
          "NOT COMPARABLE: Burton quantity is 0; numeric percent is undefined.",
          { scope: "pass", unit: "pass", layer: "pass" },
          "NOT COMPARABLE",
          s5Status,
        ),
      };
    }

    const oursQty = line.quantity;
    const burtonQty = item.originalQuantity;
    const status = numericStatus(oursQty, burtonQty, outer);
    const absDelta = oursQty - burtonQty;
    const pctDelta = (absDelta / burtonQty) * 100;
    const diagnosticClass: ComparisonDiagnosticClass | null =
      status === "MATCH" ? null : "CALC discrepancy";

    return {
      mappedIdentity: identity,
      ourIndex,
      row: {
        status,
        burton: burtonSide(item),
        ours: {
          material: line.material,
          canonicalClassification: line.canonicalClassification ?? null,
          quantity: oursQty,
          unit: line.unit,
          quantityKey: line.quantityKey ?? mappedKey,
        },
        absDelta,
        pctDelta,
        quantityLayerGate: "pass",
        unitGate: "pass",
        scopeGate: "pass",
        engineJoinUsed: join,
        diagnosticClass,
        s5Status,
        explanationRef: emptyExplanation(
          `Our Takeoff ${mappedKey} = ${oursQty} ${line.unit}`,
          `${status}: Burton ${burtonQty} ${item.originalUnit}`,
          `${status}: ours ${oursQty} vs Burton ${burtonQty}. Reporting bands are not calculation targets.`,
        ),
      },
    };
  }

  if (unresolvedKeys.has(mappedKey)) {
    return {
      mappedIdentity: identity,
      ourIndex: null,
      row: {
        status: "UNRESOLVED",
        burton: burtonSide(item),
        ours: {
          material: null,
          canonicalClassification: null,
          quantity: null,
          unit: null,
          quantityKey: mappedKey,
        },
        absDelta: null,
        pctDelta: null,
        quantityLayerGate: "pass",
        unitGate: "pass",
        scopeGate: "pass",
        engineJoinUsed: join,
        diagnosticClass: null,
        s5Status,
        explanationRef: emptyExplanation(
          "no Our Takeoff line for mapped identity",
          "UNRESOLVED",
          `UNRESOLVED: mapped identity ${mappedKey} is listed in unresolvedQuantityKeys. Distinct from MISSING OURS.`,
          [mappedKey],
        ),
      },
    };
  }

  const calcMissing = unsupportedEmitters.has(mappedKey);
  return {
    mappedIdentity: identity,
    ourIndex: null,
    row: {
      status: "MISSING OURS",
      burton: burtonSide(item),
      ours: {
        material: null,
        canonicalClassification: null,
        quantity: null,
        unit: null,
        quantityKey: mappedKey,
      },
      absDelta: null,
      pctDelta: null,
      quantityLayerGate: "pass",
      unitGate: "pass",
      scopeGate: "pass",
      engineJoinUsed: join,
      diagnosticClass: calcMissing ? "CALC missing capability" : null,
      s5Status,
      explanationRef: emptyExplanation(
        "no Our Takeoff line for mapped identity",
        "MISSING OURS",
        calcMissing
          ? `MISSING OURS: mapped identity ${mappedKey} has no Our Takeoff line. diagnosticClass CALC missing capability from explicit unsupportedEmitters only.`
          : `MISSING OURS: mapped identity ${mappedKey} has no Our Takeoff line. Quantity is not zero. diagnosticClass is null without explicit unsupportedEmitters.`,
      ),
    },
  };
}

function demoteToNotComparable(draft: Draft, reason: string): Draft {
  const burton = draft.row.burton;
  if (!burton) {
    return draft;
  }
  return {
    mappedIdentity: null,
    ourIndex: null,
    row: {
      ...draft.row,
      status: "NOT COMPARABLE",
      ours: null,
      absDelta: null,
      pctDelta: null,
      diagnosticClass: "NOT COMPARABLE",
      explanationRef: emptyExplanation(
        "no numeric Our Takeoff quantity used",
        "NOT COMPARABLE",
        reason,
      ),
    },
  };
}

function oursOnlyRow(line: FramingMaterialLine): BenchmarkComparisonRow {
  return {
    status: "OURS ONLY",
    burton: null,
    ours: {
      material: line.material,
      canonicalClassification: line.canonicalClassification ?? null,
      quantity: line.quantity,
      unit: line.unit,
      quantityKey: line.quantityKey ?? null,
    },
    absDelta: null,
    pctDelta: null,
    quantityLayerGate: "not_evaluated",
    unitGate: "not_evaluated",
    scopeGate: "not_evaluated",
    engineJoinUsed: null,
    diagnosticClass: "OURS ONLY",
    s5Status: "not_applicable",
    explanationRef: emptyExplanation(
      `${line.material} ${line.quantity} ${line.unit}`,
      "OURS ONLY",
      "OURS ONLY: Our Takeoff line was not used by an eligible unambiguous Burton mapping. Not a failure.",
    ),
  };
}

function percent(
  count: number,
  denominator: number,
): number | null {
  if (denominator === 0) {
    return null;
  }
  return (count / denominator) * 100;
}

function buildGradeSheet(
  benchmark: BurtonBenchmarkFixture,
  takeoff: FramingTakeoff,
  rows: readonly BenchmarkComparisonRow[],
  inner: number,
): BenchmarkComparisonResult["gradeSheet"] {
  const numericRows = rows.filter((row) => NUMERIC_STATUSES.has(row.status));
  const denominator = numericRows.length;
  const match = numericRows.filter((row) => row.status === "MATCH").length;
  const withinOuter5 = numericRows.filter(
    (row) =>
      row.status === "WITHIN TARGET — OURS HIGH" ||
      row.status === "WITHIN TARGET — OURS LOW",
  ).length;
  const withinInner3 = numericRows.filter((row) => {
    if (
      row.status !== "WITHIN TARGET — OURS HIGH" &&
      row.status !== "WITHIN TARGET — OURS LOW"
    ) {
      return false;
    }
    return row.pctDelta !== null && Math.abs(row.pctDelta) <= inner;
  }).length;
  const outside = numericRows.filter((row) =>
    row.status.startsWith("OUTSIDE TOLERANCE"),
  ).length;
  const oursHigh = numericRows.filter((row) => row.status.endsWith("HIGH"))
    .length;
  const oursLow = numericRows.filter((row) => row.status.endsWith("LOW")).length;

  const families = [
    ...new Set(
      benchmark.items
        .filter((item) => item.inFramingEngineScope)
        .map((item) => item.normalizedFamily),
    ),
  ].sort();

  return {
    coverage: {
      burtonItemCount: benchmark.items.length,
      ourLineCount: takeoff.materials.length,
      burtonFramingFamilies: families,
      notComparable: rows.filter((row) => row.status === "NOT COMPARABLE")
        .length,
      missingOurs: rows.filter((row) => row.status === "MISSING OURS").length,
      oursOnly: rows.filter((row) => row.status === "OURS ONLY").length,
      unresolved: rows.filter((row) => row.status === "UNRESOLVED").length,
    },
    quantityAgreement: {
      eligibleItemCount: benchmark.items.filter((item) => item.comparisonEligible)
        .length,
      numericComparedCount: denominator,
      match,
      withinInner3,
      withinOuter5,
      outside,
      oursHigh,
      oursLow,
      matchPercent: percent(match, denominator),
      withinInner3Percent: percent(withinInner3, denominator),
      withinOuter5Percent: percent(withinOuter5, denominator),
      outsidePercent: percent(outside, denominator),
      oursHighPercent: percent(oursHigh, denominator),
      oursLowPercent: percent(oursLow, denominator),
      note:
        denominator === 0
          ? "Zero eligible numeric comparisons. Quantity-agreement percents are null. Do not divide by Burton line count or OURS ONLY."
          : "Quantity-agreement percents use numericComparedCount only. Reporting bands are not calculation targets.",
    },
    explainability: {
      rowsWithProvenanceJoin: 0,
      provenanceIncompleteCount: rows.length,
      s5NotImplementedCount: rows.filter(
        (row) => row.s5Status === "not_implemented",
      ).length,
      evidenceJoin: "not_joined",
    },
  };
}

function oursOnlySortKey(line: FramingMaterialLine): string {
  return [
    line.quantityKey ?? "",
    line.canonicalClassification ?? "",
    line.material,
  ].join("|");
}

export function compareBurtonBenchmark(
  input: CompareBurtonBenchmarkInput,
): BenchmarkComparisonResult {
  const inner = input.reportingBands?.inner ?? 3;
  const outer = input.reportingBands?.outer ?? 5;
  const unresolvedKeys = new Set(input.unresolvedQuantityKeys ?? []);
  const unsupportedEmitters = new Set(input.unsupportedEmitters ?? []);
  const materials = input.takeoff.materials;

  let drafts = input.benchmark.items.map((item) =>
    resolveItem(item, materials, unresolvedKeys, unsupportedEmitters, outer),
  );

  const identityCounts = new Map<string, number>();
  const ourIndexCounts = new Map<number, number>();
  for (const draft of drafts) {
    if (draft.mappedIdentity && IDENTITY_STATUSES.has(draft.row.status)) {
      identityCounts.set(
        draft.mappedIdentity,
        (identityCounts.get(draft.mappedIdentity) ?? 0) + 1,
      );
    }
    if (draft.ourIndex !== null) {
      ourIndexCounts.set(
        draft.ourIndex,
        (ourIndexCounts.get(draft.ourIndex) ?? 0) + 1,
      );
    }
  }

  drafts = drafts.map((draft) => {
    if (
      draft.mappedIdentity &&
      IDENTITY_STATUSES.has(draft.row.status) &&
      (identityCounts.get(draft.mappedIdentity) ?? 0) > 1
    ) {
      return demoteToNotComparable(
        draft,
        "NOT COMPARABLE: multiple eligible Burton items resolve to the same mapped identity without a unique prefix discriminator.",
      );
    }
    if (draft.ourIndex !== null && (ourIndexCounts.get(draft.ourIndex) ?? 0) > 1) {
      return demoteToNotComparable(
        draft,
        "NOT COMPARABLE: multiple eligible Burton items resolved to the same Our Takeoff line.",
      );
    }
    return draft;
  });

  const consumed = new Set<number>();
  for (const draft of drafts) {
    if (draft.ourIndex !== null && NUMERIC_STATUSES.has(draft.row.status)) {
      consumed.add(draft.ourIndex);
    }
  }

  const oursOnly = materials
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => !consumed.has(index))
    .sort((a, b) => oursOnlySortKey(a.line).localeCompare(oursOnlySortKey(b.line)))
    .map(({ line }) => oursOnlyRow(line));

  const rows = [...drafts.map((draft) => draft.row), ...oursOnly];
  const result = {
    benchmarkId: input.benchmark.benchmarkId,
    benchmarkVersion: input.benchmark.benchmarkVersion,
    runId: input.runId,
    runKind: input.runKind ?? "synthetic",
    reportingBands: { inner, outer },
    rows,
    gradeSheet: buildGradeSheet(input.benchmark, input.takeoff, rows, inner),
  };

  return benchmarkComparisonResultSchema.parse(result);
}
