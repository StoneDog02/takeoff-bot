import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import { compareBurtonBenchmark } from "../../../src/framing/benchmark/compareBurtonBenchmark.js";
import { explainBurtonBenchmarkComparison } from "../../../src/framing/benchmark/explainBurtonBenchmark.js";
import { loadBurtonBenchmarkFixture } from "../../../src/framing/benchmark/loadBurtonBenchmarkFixture.js";
import type {
  BurtonBenchmarkFixture,
  BurtonBenchmarkItem,
  BurtonEngineJoin,
} from "../../../src/framing/benchmark/burtonBenchmark.schema.js";
import type { BenchmarkComparisonResult } from "../../../src/framing/benchmark/benchmarkComparison.schema.js";
import {
  emptyFramingConstruction,
  type FramingConstruction,
} from "../../../src/framing/schemas/framingConstruction.schema.js";
import type {
  FramingMaterialLine,
  FramingTakeoff,
} from "../../../src/framing/schemas/framingTakeoff.schema.js";
import { loadBecksteadW4cCharReplayEvidence } from "../../fixtures/becksteadW4cCharReplay.js";

const REPO_ROOT = process.cwd();
const FORBIDDEN_IMPORT = /from ["']\.\.\/(read|resolve|calculate|output)\//;

function takeoff(materials: FramingMaterialLine[]): FramingTakeoff {
  return {
    schemaVersion: 2,
    projectId: "synthetic-b-xpl-1",
    pdfPath: "tests/fixtures/synthetic.pdf",
    createdAt: "2026-09-15T12:00:00.000Z",
    materials,
  };
}

function line(
  partial: Pick<FramingMaterialLine, "material" | "quantity" | "unit"> &
    Partial<FramingMaterialLine>,
): FramingMaterialLine {
  return {
    description: partial.description ?? partial.material,
    lengthOrType: partial.lengthOrType ?? null,
    ...partial,
  };
}

function join(
  quantityKeys: string[],
  unit: string,
  prefix?: string,
): BurtonEngineJoin {
  return {
    quantityKeys,
    unit,
    note: "synthetic join for B-XPL-1 tests only",
    ...(prefix ? { canonicalClassificationPrefix: prefix } : {}),
  };
}

function item(
  overrides: Partial<BurtonBenchmarkItem> &
    Pick<BurtonBenchmarkItem, "benchmarkItemId" | "originalQuantity" | "originalUnit">,
): BurtonBenchmarkItem {
  return {
    pdfPage: 1,
    lineNumber: 1,
    section: "1ST FLOOR WALLS",
    originalDescription: overrides.originalDescription ?? "synthetic",
    productCode: "SYN",
    originalTally: null,
    unitPrice: null,
    extendedPrice: null,
    pricingUnit: overrides.originalUnit,
    normalizedFamily: "stud",
    normalizedSpec: "2x4",
    comparisonUnit: overrides.originalUnit,
    comparisonKey: "synthetic",
    quantityLayer: "procurement_stock_ea",
    inFramingEngineScope: true,
    comparisonEligible: false,
    engineJoin: null,
    normalizationNotes: "synthetic B-XPL-1 item",
    ...overrides,
  };
}

function benchmark(items: BurtonBenchmarkItem[]): BurtonBenchmarkFixture {
  return {
    benchmarkId: "beckstead-burton-benchmark-v1",
    benchmarkVersion: "v1-freeze-candidate",
    status: "freeze-candidate",
    frozenAt: null,
    sourceFile: "benchmarks/beckstead/source/burton-takeoff.pdf",
    quoteNumber: "1343851",
    quoteDate: "2025-07-21",
    customer: "synthetic",
    disclaimer: "synthetic",
    quoteTotals: {
      totalAmount: 0,
      salesTax: 0,
      quotationTotal: 0,
      notes: "synthetic",
    },
    scopePolicy: "synthetic",
    eligibilityPolicy: "synthetic",
    items,
  };
}

function resolvedTrace(propertyPath: string, assumptionIds: string[] = []) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit.`,
    assumptionIds,
  };
}

function wallBag(input: {
  wallId: string;
  segmentId: string;
  name: string;
  physicalId?: string;
  segmentPhysicalId?: string;
  traces?: ReturnType<typeof resolvedTrace>[];
}): FramingConstruction {
  const construction = emptyFramingConstruction();
  construction.walls = {
    walls: [
      {
        id: input.wallId,
        objectType: "building-wall",
        physicalId: input.physicalId ?? input.wallId,
        resolutionTraces: input.traces ?? [
          resolvedTrace("assembly.studSize"),
          resolvedTrace("assembly.studSpacingInches"),
        ],
        name: input.name,
        level: "1",
        wallType: "wood stud wall",
        semanticTypeKey: null,
        bindingAuthorityGrade: null,
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: null,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: [input.segmentId],
      },
    ],
    segments: [
      {
        id: input.segmentId,
        objectType: "wall-segment",
        physicalId: input.segmentPhysicalId ?? input.segmentId,
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: input.wallId,
        lengthFeet: 20,
        openingIds: [],
      },
    ],
  };
  return construction;
}

function evidenceRecord(input: {
  id: string;
  subjectKey: string;
  pageNumber: number;
  type?: Evidence["type"];
}): Evidence {
  return {
    id: input.id,
    type: input.type ?? "dimension",
    relationship: "supports",
    description: "synthetic evidence",
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: "20'-0\"",
    references: [],
    subjectKind: "wall",
    subjectKey: input.subjectKey,
    propertyPath: "lengthFeet",
    candidateValue: 20,
    extractionPassId: null,
    bundleId: null,
  };
}

function comparableCore(result: BenchmarkComparisonResult) {
  return {
    benchmarkId: result.benchmarkId,
    runId: result.runId,
    reportingBands: result.reportingBands,
    coverage: result.gradeSheet.coverage,
    quantityAgreement: result.gradeSheet.quantityAgreement,
    rows: result.rows.map((row) => ({
      status: row.status,
      burton: row.burton,
      ours: row.ours,
      absDelta: row.absDelta,
      pctDelta: row.pctDelta,
      quantityLayerGate: row.quantityLayerGate,
      unitGate: row.unitGate,
      scopeGate: row.scopeGate,
      engineJoinUsed: row.engineJoinUsed,
      s5Status: row.s5Status,
      comparisonEligible: row.burton?.comparisonEligible ?? null,
    })),
  };
}

function eligibleStuds(quantity: number, burtonQuantity = 100) {
  const ours = takeoff([
    line({
      material: "studs",
      quantity,
      unit: "each",
      quantityKey: "wall.studs",
      debugSourceIds: ["WS-SYN-001"],
    }),
  ]);
  const comparison = compareBurtonBenchmark({
    takeoff: ours,
    benchmark: benchmark([
      item({
        benchmarkItemId: "studs",
        originalQuantity: burtonQuantity,
        originalUnit: "ea",
        comparisonEligible: true,
        engineJoin: join(["wall.studs"], "each"),
        originalDescription: "2X4 STUD see page 99",
      }),
    ]),
    runId: "xpl-studs",
  });
  return { ours, comparison };
}

describe("explainBurtonBenchmarkComparison", () => {
  it("joins a complete quantity-producing lineage and may classify Defensible disagreement", () => {
    const { ours, comparison } = eligibleStuds(120, 100);
    const construction = wallBag({
      wallId: "W-SYN-001",
      segmentId: "WS-SYN-001",
      name: "W-001",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction,
      constructionKind: "session-post-calc",
      evidence: [
        evidenceRecord({
          id: "E-SYN-001",
          subjectKey: "WS-SYN-001",
          pageNumber: 3,
        }),
      ],
      readComplete: {
        generatedAt: "2026-09-15T12:00:00.000Z",
        conditions: [
          {
            conditionId: "WS-SYN-001",
            conditionKind: "wall-segment",
            name: "segment",
            fields: [
              {
                propertyPath: "lengthFeet",
                status: "established",
                attemptedPaths: [
                  { pathKind: "explicit-project-value", wasAttempted: true },
                ],
              },
              {
                propertyPath: "assembly.studSpacingInches",
                status: "unattempted",
                attemptedPaths: [],
              },
              {
                propertyPath: "assembly.heightFeet",
                status: "unresolved-after-read",
                attemptedPaths: [
                  { pathKind: "unresolved", wasAttempted: true },
                ],
              },
            ],
          },
        ],
      },
    });

    const row = explained.rows[0]!;
    assert.equal(row.status, "OUTSIDE TOLERANCE — OURS HIGH");
    assert.equal(row.absDelta, 20);
    assert.equal(row.diagnosticClass, "Defensible disagreement");
    assert.deepEqual(row.explanationRef.evidencePages, [3]);
    assert.deepEqual(row.explanationRef.physicalIds, ["WS-SYN-001"]);
    assert.equal(row.explanationRef.quantityLineageComplete, true);
    assert.equal(row.explanationRef.defensibilityEvidenceComplete, true);
    assert.equal(row.explanationRef.provenanceIncomplete, false);
    assert.equal(row.explanationRef.calcIdentity, "wall.studs");
    assert.equal(row.explanationRef.hops?.quantityLineage, "joined");
    assert.equal(row.explanationRef.hops?.defensibility, "joined");
    const fields = row.explanationRef.readCompleteFields ?? [];
    assert.equal(
      fields.find((field) => field.propertyPath === "assembly.studSpacingInches")
        ?.status,
      "unattempted",
    );
    assert.equal(
      fields.find((field) => field.propertyPath === "assembly.heightFeet")
        ?.status,
      "unresolved-after-read",
    );
    assert.notEqual(
      fields.find((field) => field.status === "unattempted")?.status,
      fields.find((field) => field.status === "unresolved-after-read")?.status,
    );
    assert.equal(row.explanationRef.explanationText.includes("S4-LY-1"), false);
    assert.deepEqual(comparableCore(comparison), comparableCore(explained));
  });

  it("does not classify Defensible disagreement from pages and traces without quantity lineage", () => {
    const ours = takeoff([
      line({
        material: "studs",
        quantity: 120,
        unit: "each",
        quantityKey: "wall.studs",
      }),
    ]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "studs",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "no-lineage",
    });
    const construction = wallBag({
      wallId: "W-SYN-001",
      segmentId: "WS-SYN-001",
      name: "W-001",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction,
      constructionKind: "session-post-calc",
      evidence: [
        evidenceRecord({
          id: "E-SYN-001",
          subjectKey: "WS-SYN-001",
          pageNumber: 3,
        }),
      ],
    });

    const row = explained.rows[0]!;
    assert.equal(row.status, "OUTSIDE TOLERANCE — OURS HIGH");
    assert.equal(row.diagnosticClass, "CALC discrepancy");
    assert.equal(row.explanationRef.quantityLineageComplete, false);
    assert.equal(row.explanationRef.defensibilityEvidenceComplete, false);
    assert.equal(row.explanationRef.hops?.defensibility, "unavailable");
    assert.equal(row.explanationRef.hops?.quantityLineage, "unavailable");
    assert.deepEqual(row.explanationRef.evidencePages, []);
  });

  it("does not classify Defensible disagreement when debugSourceIds do not resolve", () => {
    const ours = takeoff([
      line({
        material: "studs",
        quantity: 120,
        unit: "each",
        quantityKey: "wall.studs",
        debugSourceIds: ["WS-MISSING"],
      }),
    ]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "studs",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "unresolved-ids",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: wallBag({
        wallId: "W-SYN-001",
        segmentId: "WS-SYN-001",
        name: "W-001",
      }),
      constructionKind: "session-post-calc",
      evidence: [
        evidenceRecord({
          id: "E-SYN-001",
          subjectKey: "WS-SYN-001",
          pageNumber: 3,
        }),
      ],
    });
    const row = explained.rows[0]!;
    assert.equal(row.status, "OUTSIDE TOLERANCE — OURS HIGH");
    assert.equal(row.diagnosticClass, "CALC discrepancy");
    assert.equal(row.explanationRef.quantityLineageComplete, false);
    assert.equal(row.explanationRef.hops?.construction, "unavailable");
    assert.deepEqual(row.explanationRef.debugSourceIds, ["WS-MISSING"]);
  });

  it("never infers Materialization gap from established ReadComplete plus a missing object", () => {
    const ours = takeoff([]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "missing",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
          originalDescription: "2X4 STUD",
        }),
      ]),
      runId: "no-materialization-inference",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: emptyFramingConstruction(),
      constructionKind: "session-post-calc",
      readComplete: {
        generatedAt: "2026-09-15T12:00:00.000Z",
        conditions: [
          {
            conditionId: "WS-SYN-001",
            conditionKind: "wall-segment",
            name: "segment",
            fields: [
              {
                propertyPath: "lengthFeet",
                status: "established",
                attemptedPaths: [
                  { pathKind: "explicit-project-value", wasAttempted: true },
                ],
              },
            ],
          },
        ],
      },
    });
    const row = explained.rows[0]!;
    assert.equal(row.status, "MISSING OURS");
    assert.equal(row.diagnosticClass, null);
    assert.notEqual(row.diagnosticClass, "Materialization gap");
    assert.equal(row.explanationRef.hops?.construction, "unavailable");
    assert.equal(
      explained.rows.some(
        (entry) => entry.diagnosticClass === "Materialization gap",
      ),
      false,
    );
  });

  it("does not invent evidence pages from Burton text or unmatched evidence", () => {
    const { ours, comparison } = eligibleStuds(100, 100);
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: wallBag({
        wallId: "W-SYN-001",
        segmentId: "WS-SYN-001",
        name: "W-001",
      }),
      constructionKind: "session-post-calc",
      evidence: [
        evidenceRecord({
          id: "E-OTHER",
          subjectKey: "unrelated-wall",
          pageNumber: 7,
        }),
      ],
    });
    const row = explained.rows[0]!;
    assert.deepEqual(row.explanationRef.evidencePages, []);
    assert.equal(row.explanationRef.explanationText.includes("page 99"), false);
    assert.equal(row.explanationRef.hops?.evidencePages, "unavailable");
    assert.equal(row.diagnosticClass, null);
  });

  it("keeps assumption ids from traces", () => {
    const { ours, comparison } = eligibleStuds(100, 100);
    const construction = wallBag({
      wallId: "W-SYN-001",
      segmentId: "WS-SYN-001",
      name: "W-001",
    });
    construction.walls.segments[0]!.resolutionTraces = [
      {
        propertyPath: "lengthFeet",
        method: "supported-inference",
        explanation: "governed assumption applied",
        assumptionIds: ["WALL-ASSUME-001"],
      },
    ];
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction,
      constructionKind: "session-post-calc",
    });
    assert.deepEqual(explained.rows[0]?.explanationRef.assumptionIds, [
      "WALL-ASSUME-001",
    ]);
  });

  it("joins session unresolved records and treats disk-pre-calc unresolved as unavailable", () => {
    const { ours, comparison } = eligibleStuds(120, 100);
    const construction = wallBag({
      wallId: "W-SYN-001",
      segmentId: "WS-SYN-001",
      name: "W-001",
    });
    construction.unresolved = [
      {
        id: "UR-WS-SYN-001-lengthFeet",
        physicalId: "WS-SYN-001",
        propertyPath: "lengthFeet",
        reasonCode: "missing-length",
        diagnosticFamily: "READ_GAP",
        explanation: "length was not established",
      },
    ];
    const session = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction,
      constructionKind: "session-post-calc",
      evidence: [
        evidenceRecord({
          id: "E-SYN-001",
          subjectKey: "WS-SYN-001",
          pageNumber: 3,
        }),
      ],
    });
    assert.equal(session.rows[0]?.status, "OUTSIDE TOLERANCE — OURS HIGH");
    assert.equal(session.rows[0]?.diagnosticClass, "CALC discrepancy");
    assert.equal(session.rows[0]?.explanationRef.hops?.unresolved, "joined");
    assert.equal(session.rows[0]?.explanationRef.unresolvedRecords?.length, 1);
    assert.equal(session.rows[0]?.explanationRef.defensibilityEvidenceComplete, false);

    const disk = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction,
      constructionKind: "disk-pre-calc",
      evidence: [
        evidenceRecord({
          id: "E-SYN-001",
          subjectKey: "WS-SYN-001",
          pageNumber: 3,
        }),
      ],
    });
    assert.equal(disk.rows[0]?.explanationRef.hops?.unresolved, "unavailable");
    assert.deepEqual(disk.rows[0]?.explanationRef.unresolvedRecords, []);
    assert.equal(disk.rows[0]?.diagnosticClass, "CALC discrepancy");
    assert.notEqual(disk.rows[0]?.diagnosticClass, "HOUSE Unresolved");
  });

  it("does not census construction objects for MISSING OURS", () => {
    const ours = takeoff([]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "missing",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "no-census",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: wallBag({
        wallId: "W-SYN-001",
        segmentId: "WS-SYN-001",
        name: "W-001",
      }),
      constructionKind: "session-post-calc",
    });
    const row = explained.rows[0]!;
    assert.equal(row.status, "MISSING OURS");
    assert.deepEqual(row.explanationRef.debugSourceIds, []);
    assert.deepEqual(row.explanationRef.physicalIds, []);
    assert.equal(row.explanationRef.hops?.construction, "unavailable");
    assert.equal(row.diagnosticClass, null);
    assert.notEqual(row.diagnosticClass, "CALC missing capability");
  });

  it("labels related provenance on NOT COMPARABLE and does not treat it as compared", () => {
    const ours = takeoff([
      line({
        material: "studs",
        quantity: 244,
        unit: "each",
        quantityKey: "wall.studs",
        debugSourceIds: ["WS-SYN-001"],
      }),
    ]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "L045",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: false,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "related-not-compared",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: wallBag({
        wallId: "W-SYN-001",
        segmentId: "WS-SYN-001",
        name: "W-001",
      }),
      constructionKind: "session-post-calc",
      evidence: [
        evidenceRecord({
          id: "E-SYN-001",
          subjectKey: "WS-SYN-001",
          pageNumber: 3,
        }),
      ],
    });
    const notComparable = explained.rows.find(
      (row) => row.status === "NOT COMPARABLE",
    );
    const oursOnly = explained.rows.find((row) => row.status === "OURS ONLY");
    assert.equal(notComparable?.ours, null);
    assert.equal(notComparable?.absDelta, null);
    assert.equal(notComparable?.diagnosticClass, "NOT COMPARABLE");
    assert.equal(notComparable?.explanationRef.relatedNotCompared, true);
    assert.equal(notComparable?.explanationRef.quantityLineageComplete, false);
    assert.notEqual(
      notComparable?.diagnosticClass,
      "Defensible disagreement",
    );
    assert.deepEqual(notComparable?.explanationRef.evidencePages, [3]);
    assert.match(
      notComparable?.explanationRef.explanationText ?? "",
      /related\/not compared/,
    );
    assert.equal(oursOnly?.diagnosticClass, "OURS ONLY");
    assert.equal(oursOnly?.explanationRef.quantityLineageComplete, true);
    assert.deepEqual(oursOnly?.explanationRef.evidencePages, [3]);
  });

  it("joins committed W4-C evidence pages by exact subjectKey without Anthropic", () => {
    const replayEvidence = loadBecksteadW4cCharReplayEvidence();
    const subjectKey = "physical-run:p3:fd528cc6dd9f";
    const replayRecord = replayEvidence.find(
      (record) => record.subjectKey === subjectKey,
    );
    assert.ok(replayRecord);
    assert.equal(replayRecord.source.page.pageNumber, 3);

    const ours = takeoff([
      line({
        material: "studs",
        quantity: 10,
        unit: "each",
        quantityKey: "wall.studs",
        debugSourceIds: ["W-P3-FD528"],
      }),
    ]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "w4c",
          originalQuantity: 10,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "w4c-replay",
      runKind: "replay",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: wallBag({
        wallId: "W-P3-FD528",
        segmentId: "WS-P3-FD528",
        name: subjectKey,
      }),
      constructionKind: "session-post-calc",
      evidence: replayEvidence,
    });
    const row = explained.rows[0]!;
    assert.deepEqual(row.explanationRef.evidencePages, [3]);
    assert.ok(row.explanationRef.evidenceIds?.includes(replayRecord.id));
    assert.equal(row.status, "MATCH");
    assert.equal(row.diagnosticClass, null);
  });

  it("preserves freeze-candidate ineligibility after explain", () => {
    const fixture = loadBurtonBenchmarkFixture(REPO_ROOT);
    const ours = takeoff([
      line({
        material: "2x4 stud",
        quantity: 200,
        unit: "each",
        quantityKey: "wall.studs",
        debugSourceIds: ["WS-SYN-001"],
      }),
    ]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: fixture,
      runId: "freeze-candidate-xpl",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: wallBag({
        wallId: "W-SYN-001",
        segmentId: "WS-SYN-001",
        name: "W-001",
      }),
      constructionKind: "session-post-calc",
    });
    assert.equal(
      explained.rows
        .filter((row) => row.burton)
        .every((row) => row.status === "NOT COMPARABLE"),
      true,
    );
    assert.equal(explained.gradeSheet.quantityAgreement.numericComparedCount, 0);
    assert.equal(explained.gradeSheet.quantityAgreement.matchPercent, null);
    assert.equal(
      explained.rows.some((row) => row.burton?.comparisonEligible === true),
      false,
    );
    assert.deepEqual(comparableCore(comparison), comparableCore(explained));
  });

  it("is deterministic and does not import production pipeline modules", () => {
    const { ours, comparison } = eligibleStuds(100, 100);
    const input = {
      comparison,
      takeoff: ours,
      construction: wallBag({
        wallId: "W-SYN-001",
        segmentId: "WS-SYN-001",
        name: "W-001",
      }),
      constructionKind: "session-post-calc" as const,
    };
    const a = explainBurtonBenchmarkComparison(input);
    const b = explainBurtonBenchmarkComparison(input);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));

    const source = readFileSync(
      path.join(REPO_ROOT, "src/framing/benchmark/explainBurtonBenchmark.ts"),
      "utf8",
    );
    assert.equal(FORBIDDEN_IMPORT.test(source), false);
  });
});
