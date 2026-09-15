import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { FramingConstruction } from "../schemas/framingConstruction.schema.js";
import type {
  FramingMaterialLine,
  FramingTakeoff,
} from "../schemas/framingTakeoff.schema.js";

import {
  benchmarkComparisonResultSchema,
  type BenchmarkComparisonResult,
  type BenchmarkComparisonRow,
  type ComparisonDiagnosticClass,
  type ComparisonStatus,
  type ProvenanceHopStatus,
} from "./benchmarkComparison.schema.js";

/**
 * Downstream provenance join over B-CMP-1 rows.
 * Do not import this module from read / resolve / calculate / runFramingTakeoff.
 * Do not import read / resolve / calculate / output from this module.
 */

const PROJECT_SOURCE_BACKED_METHODS = new Set<string>([
  "explicit-project-value",
  "deterministic-calculation",
  "supported-inference",
  "identity-binding-merge",
  "user-override",
]);

const NUMERIC_DIFF_STATUSES = new Set<ComparisonStatus>([
  "WITHIN TARGET — OURS HIGH",
  "WITHIN TARGET — OURS LOW",
  "OUTSIDE TOLERANCE — OURS HIGH",
  "OUTSIDE TOLERANCE — OURS LOW",
]);

const LOCKED_DIAGNOSTIC_CLASSES = new Set<ComparisonDiagnosticClass>([
  "NOT COMPARABLE",
  "OURS ONLY",
  "S5 missing",
  "CALC missing capability",
]);

export type ExplainConstructionKind = "session-post-calc" | "disk-pre-calc";

export type ExplainReadCompleteField = {
  propertyPath: string;
  label?: string;
  status:
    | "established"
    | "unresolved-after-read"
    | "unattempted"
    | "not-applicable";
  attemptedPaths?: ReadonlyArray<{
    pathKind: string;
    wasAttempted: boolean;
  }>;
};

export type ExplainReadCompleteCondition = {
  conditionId: string;
  conditionKind?: string;
  name?: string;
  fields: readonly ExplainReadCompleteField[];
};

export type ExplainReadCompleteReport = {
  generatedAt?: string;
  conditions: readonly ExplainReadCompleteCondition[];
};

export type ExplainBurtonBenchmarkInput = {
  comparison: BenchmarkComparisonResult;
  takeoff: FramingTakeoff;
  construction?: FramingConstruction;
  evidence?: readonly Evidence[];
  readComplete?: ExplainReadCompleteReport;
  constructionKind?: ExplainConstructionKind;
};

type IndexedObject = {
  id: string;
  objectType: string;
  physicalId?: string;
  name?: string;
  absorbedSubjectKeys: string[];
  resolutionTraces: ReadonlyArray<{
    propertyPath: string;
    method: string;
    explanation: string;
    assumptionIds: readonly string[];
  }>;
};

type ProvenanceHops = NonNullable<
  BenchmarkComparisonRow["explanationRef"]["hops"]
>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueSortedPages(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );
}

function indexObject(value: unknown): IndexedObject | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = asString(value.id);
  const objectType = asString(value.objectType);
  if (!id || !objectType) {
    return null;
  }
  const tracesRaw = Array.isArray(value.resolutionTraces)
    ? value.resolutionTraces
    : [];
  const resolutionTraces = tracesRaw.flatMap((trace) => {
    if (!isRecord(trace)) {
      return [];
    }
    const propertyPath = asString(trace.propertyPath);
    const method = asString(trace.method);
    const explanation = asString(trace.explanation);
    if (!propertyPath || !method || !explanation) {
      return [];
    }
    return [
      {
        propertyPath,
        method,
        explanation,
        assumptionIds: asStringArray(trace.assumptionIds),
      },
    ];
  });
  return {
    id,
    objectType,
    physicalId: asString(value.physicalId),
    name: asString(value.name),
    absorbedSubjectKeys: asStringArray(value.absorbedSubjectKeys),
    resolutionTraces,
  };
}

function indexConstruction(
  construction: FramingConstruction | undefined,
): Map<string, IndexedObject> {
  const map = new Map<string, IndexedObject>();
  if (!construction) {
    return map;
  }
  const bags: readonly unknown[][] = [
    construction.walls.walls,
    construction.walls.segments,
    construction.openings.openings,
    construction.structuralMembers.structuralMembers,
    construction.floorFraming.systems,
    construction.floorFraming.areas,
    construction.roofFraming.systems,
    construction.roofFraming.planes,
    construction.sheathing.systems,
    construction.sheathing.areas,
    construction.foundationInterface.sillSegments,
  ];
  for (const bag of bags) {
    for (const entry of bag) {
      const indexed = indexObject(entry);
      if (indexed) {
        map.set(indexed.id, indexed);
      }
    }
  }
  return map;
}

function evidenceSubjectKeys(object: IndexedObject): string[] {
  return uniqueSorted([
    object.id,
    ...(object.name ? [object.name] : []),
    ...object.absorbedSubjectKeys,
  ]);
}

function evidenceMatchesObject(
  record: Evidence,
  object: IndexedObject,
): boolean {
  return evidenceSubjectKeys(object).includes(record.subjectKey);
}

function isProjectSourceBackedTrace(trace: {
  method: string;
  assumptionIds: readonly string[];
}): boolean {
  if (trace.assumptionIds.length > 0) {
    return false;
  }
  return PROJECT_SOURCE_BACKED_METHODS.has(trace.method);
}

function linesEqualOurs(
  line: FramingMaterialLine,
  row: BenchmarkComparisonRow,
): boolean {
  const ours = row.ours;
  if (!ours || ours.quantity === null || ours.unit === null) {
    return false;
  }
  if (line.quantity !== ours.quantity || line.unit !== ours.unit) {
    return false;
  }
  if (ours.material !== null && line.material !== ours.material) {
    return false;
  }
  if (ours.quantityKey !== null) {
    return line.quantityKey === ours.quantityKey;
  }
  return true;
}

function findComparedTakeoffLines(
  row: BenchmarkComparisonRow,
  takeoff: FramingTakeoff,
): FramingMaterialLine[] {
  if (!row.ours || row.ours.quantity === null) {
    return [];
  }
  return takeoff.materials.filter((line) => linesEqualOurs(line, row));
}

function relatedQuantityKey(row: BenchmarkComparisonRow): string | null {
  const keys = row.engineJoinUsed?.quantityKeys;
  if (!keys || keys.length !== 1) {
    return null;
  }
  return keys[0] ?? null;
}

function findRelatedTakeoffLines(
  row: BenchmarkComparisonRow,
  takeoff: FramingTakeoff,
): FramingMaterialLine[] {
  if (row.status !== "NOT COMPARABLE" || row.ours !== null) {
    return [];
  }
  const key = relatedQuantityKey(row);
  if (!key) {
    return [];
  }
  return takeoff.materials.filter((line) => line.quantityKey === key);
}

function hopFromCounts(found: number, expected: number): ProvenanceHopStatus {
  if (expected === 0) {
    return "unavailable";
  }
  if (found === expected) {
    return "joined";
  }
  if (found > 0) {
    return "partial";
  }
  return "unavailable";
}

function calcStatusFor(row: BenchmarkComparisonRow): "emitted" | "not_emitted" | "unknown" {
  if (row.ours?.quantity !== null && row.ours?.quantity !== undefined) {
    return "emitted";
  }
  if (row.status === "MISSING OURS" || row.status === "UNRESOLVED") {
    return "not_emitted";
  }
  return "unknown";
}

function assumptionIdsForQuantityKey(
  takeoff: FramingTakeoff,
  quantityKey: string | null,
): string[] {
  if (!quantityKey) {
    return [];
  }
  const ids: string[] = [];
  for (const assumption of takeoff.assumptions ?? []) {
    if (!assumption.id) {
      continue;
    }
    if ((assumption.quantityKeys ?? []).includes(quantityKey)) {
      ids.push(assumption.id);
    }
  }
  return ids;
}

function buildExplanationText(parts: readonly string[]): string {
  return parts.filter((part) => part.trim().length > 0).join(" ");
}

function nextDiagnosticClass(
  row: BenchmarkComparisonRow,
  input: {
    defensibilityEvidenceComplete: boolean;
    relatedNotCompared: boolean;
  },
): ComparisonDiagnosticClass | null {
  const current = row.diagnosticClass;
  if (current !== null && LOCKED_DIAGNOSTIC_CLASSES.has(current)) {
    return current;
  }
  if (
    input.defensibilityEvidenceComplete &&
    !input.relatedNotCompared &&
    NUMERIC_DIFF_STATUSES.has(row.status) &&
    (current === "CALC discrepancy" || current === null)
  ) {
    return "Defensible disagreement";
  }
  return current;
}

function explainabilitySummary(
  rows: readonly BenchmarkComparisonRow[],
  s5NotImplementedCount: number,
): BenchmarkComparisonResult["gradeSheet"]["explainability"] {
  let rowsWithProvenanceJoin = 0;
  let provenanceIncompleteCount = 0;
  let evidenceJoined = 0;
  let evidencePartial = 0;
  let lineageRows = 0;
  let lineageWithEvidence = 0;

  for (const row of rows) {
    const hops = row.explanationRef.hops;
    if (
      hops?.takeoffLine === "joined" ||
      hops?.construction === "joined" ||
      hops?.construction === "partial"
    ) {
      rowsWithProvenanceJoin += 1;
    }
    if (row.explanationRef.provenanceIncomplete) {
      provenanceIncompleteCount += 1;
    }
    if (hops?.evidencePages === "joined") {
      evidenceJoined += 1;
    }
    if (hops?.evidencePages === "partial") {
      evidencePartial += 1;
    }
    if (row.explanationRef.quantityLineageComplete) {
      lineageRows += 1;
      if (hops?.evidencePages === "joined") {
        lineageWithEvidence += 1;
      }
    }
  }

  let evidenceJoin: "not_joined" | "partial" | "joined" = "not_joined";
  if (evidenceJoined > 0 && evidencePartial === 0 && lineageRows > 0) {
    evidenceJoin =
      lineageWithEvidence === lineageRows ? "joined" : "partial";
  } else if (evidenceJoined > 0 && evidencePartial === 0 && lineageRows === 0) {
    evidenceJoin = "partial";
  } else if (evidenceJoined > 0 || evidencePartial > 0) {
    evidenceJoin = "partial";
  }

  return {
    rowsWithProvenanceJoin,
    provenanceIncompleteCount,
    s5NotImplementedCount,
    evidenceJoin,
  };
}

function explainRow(
  row: BenchmarkComparisonRow,
  takeoff: FramingTakeoff,
  objectsById: Map<string, IndexedObject>,
  construction: FramingConstruction | undefined,
  evidence: readonly Evidence[],
  readComplete: ExplainReadCompleteReport | undefined,
  constructionKind: ExplainConstructionKind | undefined,
): BenchmarkComparisonRow {
  const comparedLines = findComparedTakeoffLines(row, takeoff);
  const relatedLines = findRelatedTakeoffLines(row, takeoff);
  const relatedNotCompared =
    comparedLines.length === 0 && relatedLines.length > 0;
  const sourceLines =
    comparedLines.length > 0
      ? comparedLines
      : relatedNotCompared
        ? relatedLines
        : [];

  let takeoffLineHop: ProvenanceHopStatus = "unavailable";
  if (comparedLines.length === 1) {
    takeoffLineHop = "joined";
  } else if (comparedLines.length > 1) {
    takeoffLineHop = "partial";
  } else if (relatedNotCompared) {
    takeoffLineHop = "joined";
  }

  const debugSourceIds = [
    ...new Set(sourceLines.flatMap((line) => line.debugSourceIds ?? [])),
  ];
  const uniqueSourceIds = debugSourceIds;
  const joinedObjects = uniqueSourceIds
    .map((id) => objectsById.get(id))
    .filter((object): object is IndexedObject => object !== undefined);

  const constructionProvided = construction !== undefined;
  const skipObjectCensus =
    row.status === "MISSING OURS" && comparedLines.length === 0;

  let constructionHop: ProvenanceHopStatus = "unavailable";
  if (skipObjectCensus) {
    constructionHop = "unavailable";
  } else if (!constructionProvided) {
    constructionHop = "unavailable";
  } else if (uniqueSourceIds.length === 0) {
    constructionHop = "unavailable";
  } else {
    constructionHop = hopFromCounts(joinedObjects.length, uniqueSourceIds.length);
  }

  const objectsForJoin = skipObjectCensus ? [] : joinedObjects;
  const physicalIds = objectsForJoin
    .map((object) => object.physicalId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const physicalIdHop =
    objectsForJoin.length === 0
      ? "unavailable"
      : hopFromCounts(physicalIds.length, objectsForJoin.length);

  const objectsWithTraces = objectsForJoin.filter(
    (object) => object.resolutionTraces.length > 0,
  );
  const tracesHop =
    objectsForJoin.length === 0
      ? "unavailable"
      : hopFromCounts(objectsWithTraces.length, objectsForJoin.length);

  const houseTraceMethods = uniqueSorted(
    objectsForJoin.flatMap((object) =>
      object.resolutionTraces.map((trace) => trace.method),
    ),
  );
  const traceAssumptionIds = objectsForJoin.flatMap((object) =>
    object.resolutionTraces.flatMap((trace) => [...trace.assumptionIds]),
  );
  const quantityKey =
    row.ours?.quantityKey ??
    (relatedNotCompared ? relatedQuantityKey(row) : null);
  const assumptionIds = uniqueSorted([
    ...traceAssumptionIds,
    ...assumptionIdsForQuantityKey(takeoff, quantityKey),
  ]);

  const matchedEvidence =
    objectsForJoin.length === 0
      ? []
      : evidence.filter((record) =>
          objectsForJoin.some((object) => evidenceMatchesObject(record, object)),
        );
  const objectsWithEvidence = objectsForJoin.filter((object) =>
    evidence.some((record) => evidenceMatchesObject(record, object)),
  );
  const evidencePages = uniqueSortedPages(
    matchedEvidence
      .map((record) => record.source.page.pageNumber)
      .filter((page): page is number => Number.isInteger(page) && page > 0),
  );
  const evidenceIds = uniqueSorted(matchedEvidence.map((record) => record.id));
  const evidencePagesHop =
    objectsForJoin.length === 0 || evidencePages.length === 0
      ? "unavailable"
      : hopFromCounts(objectsWithEvidence.length, objectsForJoin.length);

  const conditionIds = skipObjectCensus ? [] : uniqueSourceIds;
  const conditions = (readComplete?.conditions ?? []).filter((condition) =>
    conditionIds.includes(condition.conditionId),
  );
  const readCompleteFields = conditions.flatMap((condition) =>
    condition.fields.map((field) => ({
      conditionId: condition.conditionId,
      propertyPath: field.propertyPath,
      status: field.status,
      attemptedPaths: [...(field.attemptedPaths ?? [])],
    })),
  );
  const readCompleteHop = (() => {
    if (!readComplete) {
      return "unavailable";
    }
    if (conditionIds.length === 0) {
      return "unavailable";
    }
    const matchedIds = new Set(conditions.map((condition) => condition.conditionId));
    return hopFromCounts(matchedIds.size, conditionIds.length);
  })();

  const sessionUnresolved = constructionKind !== "disk-pre-calc";
  const unresolvedHop: ProvenanceHopStatus = (() => {
    if (!constructionProvided || skipObjectCensus) {
      return "unavailable";
    }
    if (!sessionUnresolved) {
      return "unavailable";
    }
    if (physicalIds.length === 0) {
      return "unavailable";
    }
    return "joined";
  })();
  const physicalIdSet = new Set(physicalIds);
  const unresolvedRecords =
    unresolvedHop === "joined"
      ? (construction?.unresolved ?? [])
          .filter((record) => physicalIdSet.has(record.physicalId))
          .map((record) => ({
            physicalId: record.physicalId,
            propertyPath: record.propertyPath,
            reasonCode: record.reasonCode,
            diagnosticFamily: record.diagnosticFamily,
          }))
      : [];
  const unresolvedLabels =
    unresolvedHop === "joined"
      ? uniqueSorted(
          unresolvedRecords.map(
            (record) => `${record.physicalId}:${record.propertyPath}`,
          ),
        )
      : [...row.explanationRef.unresolved];

  const quantityLineageComplete =
    !relatedNotCompared &&
    comparedLines.length === 1 &&
    uniqueSourceIds.length > 0 &&
    constructionHop === "joined";
  const quantityLineageHop: ProvenanceHopStatus = quantityLineageComplete
    ? "joined"
    : uniqueSourceIds.length > 0 && constructionHop === "partial"
      ? "partial"
      : "unavailable";

  const hasProjectSourceBackedTrace = objectsForJoin.some((object) =>
    object.resolutionTraces.some((trace) => isProjectSourceBackedTrace(trace)),
  );
  const defensibilityEvidenceComplete =
    quantityLineageComplete &&
    physicalIdHop === "joined" &&
    tracesHop === "joined" &&
    evidencePagesHop === "joined" &&
    evidencePages.length > 0 &&
    hasProjectSourceBackedTrace &&
    unresolvedHop === "joined" &&
    unresolvedRecords.length === 0;
  const defensibilityHop: ProvenanceHopStatus = defensibilityEvidenceComplete
    ? "joined"
    : "unavailable";

  const hops: ProvenanceHops = {
    takeoffLine: takeoffLineHop,
    construction: constructionHop,
    physicalId: physicalIdHop,
    traces: tracesHop,
    evidencePages: evidencePagesHop,
    readComplete: readCompleteHop,
    unresolved: unresolvedHop,
    quantityLineage: quantityLineageHop,
    defensibility: defensibilityHop,
  };

  const provenanceIncomplete = Object.values(hops).some(
    (status) => status !== "joined" && status !== "not_applicable",
  );

  const unavailableHops = Object.entries(hops)
    .filter(([, status]) => status === "unavailable" || status === "partial")
    .map(([name, status]) => `${name}=${status}`);

  const diagnosticClass = nextDiagnosticClass(row, {
    defensibilityEvidenceComplete,
    relatedNotCompared,
  });

  const explanationText = buildExplanationText([
    row.explanationRef.explanationText,
    relatedNotCompared
      ? "Related Our Takeoff provenance is labeled related/not compared and was not used as a numeric match."
      : "",
    quantityKey ? `calcIdentity=${quantityKey}.` : "calcIdentity unavailable.",
    debugSourceIds.length > 0
      ? `debugSourceIds=${debugSourceIds.join(",")}.`
      : "unavailable: debugSourceIds.",
    objectsForJoin.length > 0
      ? `constructionObjectIds=${objectsForJoin.map((object) => object.id).join(",")}.`
      : "unavailable: construction objects.",
    physicalIds.length > 0
      ? `physicalIds=${uniqueSorted(physicalIds).join(",")}.`
      : "unavailable: physicalIds.",
    evidencePages.length > 0
      ? `evidencePages=${evidencePages.join(",")}.`
      : "unavailable: evidencePages.",
    readCompleteFields.length > 0
      ? `readComplete=${readCompleteFields
          .map(
            (field) =>
              `${field.conditionId}:${field.propertyPath}=${field.status}`,
          )
          .join(",")}.`
      : "unavailable: ReadComplete.",
    unresolvedHop === "unavailable"
      ? "unavailable: unresolved (session construction required)."
      : unresolvedRecords.length > 0
        ? `unresolved=${unresolvedLabels.join(",")}.`
        : "unresolved records: none on joined physicalIds.",
    `quantityLineageComplete=${quantityLineageComplete}.`,
    `defensibilityEvidenceComplete=${defensibilityEvidenceComplete}.`,
    unavailableHops.length > 0
      ? `unavailable hops: ${unavailableHops.join(", ")}.`
      : "",
  ]);

  return {
    ...row,
    diagnosticClass,
    explanationRef: {
      whatWeReturned: row.explanationRef.whatWeReturned,
      burtonCompare: row.explanationRef.burtonCompare,
      evidencePages,
      unresolved: unresolvedLabels,
      provenanceIncomplete,
      explanationText,
      relatedNotCompared: relatedNotCompared ? true : undefined,
      debugSourceIds,
      physicalIds: uniqueSorted(physicalIds),
      evidenceIds,
      houseTraceMethods,
      assumptionIds,
      calcStatus: calcStatusFor(row),
      calcIdentity: quantityKey,
      quantityLineageComplete,
      defensibilityEvidenceComplete,
      readCompleteFields,
      unresolvedRecords,
      hops,
    },
  };
}

export function explainBurtonBenchmarkComparison(
  input: ExplainBurtonBenchmarkInput,
): BenchmarkComparisonResult {
  const objectsById = indexConstruction(input.construction);
  const evidence = input.evidence ?? [];
  const rows = input.comparison.rows.map((row) =>
    explainRow(
      row,
      input.takeoff,
      objectsById,
      input.construction,
      evidence,
      input.readComplete,
      input.constructionKind,
    ),
  );

  const result: BenchmarkComparisonResult = {
    ...input.comparison,
    rows,
    gradeSheet: {
      ...input.comparison.gradeSheet,
      explainability: explainabilitySummary(
        rows,
        input.comparison.gradeSheet.explainability.s5NotImplementedCount,
      ),
    },
  };

  return benchmarkComparisonResultSchema.parse(result);
}
