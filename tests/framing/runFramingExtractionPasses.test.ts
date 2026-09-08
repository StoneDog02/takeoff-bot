import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { aggregateExtractionEvidencePasses } from "../../src/pdf/aggregateExtractionEvidencePasses.js";
import {
  classifiedPlanPageSchema,
  type ClassifiedPlanPage,
  inferContentRolesFromVisualEvidence,
} from "../../src/pdf/pageClassification.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../src/pdf/visualImageBudget.js";
import {
  buildFramingExtractionWorkPlan,
} from "../../src/framing/extract/buildFramingExtractionWorkPlan.js";
import {
  REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE,
  runFramingExtractionPasses,
  type ExtractFramingEvidenceFn,
} from "../../src/framing/extract/runFramingExtractionPasses.js";
import {
  detectMissingRequiredInputsForIdentifiedSystems,
  dropIdentityRestubsForKnownSubjects,
  shouldSkipSameBundleRequiredInputFollowUp,
} from "../../src/framing/extract/detectMissingRequiredInputs.js";
import type { ExtractedFramingEvidencePayload } from "../../src/framing/schemas/framing-artifacts.schema.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";

function planIndexWithPages(pageCount: number): PlanIndex {
  return {
    pdfPath: "/tmp/beckstead.pdf",
    totalPages: pageCount,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "b".repeat(64),
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      sheetId: `S${index + 1}`,
      label: `Sheet ${index + 1}`,
      textContent: "",
    })),
  };
}

function loadBecksteadClassification(): ClassifiedPlanPage[] {
  const fixturePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../fixtures/beckstead-b1.4-live-classification.json",
  );
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    pages: ClassifiedPlanPage[];
  };
  return fixture.pages.map((page) => classifiedPlanPageSchema.parse(page));
}

function wallEvidence(input: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number;
  pageNumber: number;
  tileId?: string | null;
}): Evidence {
  return {
    id: input.id,
    type: "note",
    relationship: "supports",
    description: "synthetic",
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
      tileId: input.tileId ?? null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: "synthetic",
    references: [],
    subjectKind: "wall",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: null,
    bundleId: null,
  };
}

describe("inferContentRolesFromVisualEvidence", () => {
  it("infers notes/schedule/index for live-style Beckstead page 1 without contentRoles", () => {
    const roles = inferContentRolesFromVisualEvidence({
      pageKind: "mixed",
      contentRoles: [],
      titleOrLabel: "S1.1 - Index, General Structural Notes, Schedules",
      evidenceText:
        "INDEX, GENERAL STRUCTURAL NOTES, SCHEDULES / METAL HOLDOWN SCHEDULE",
    });
    assert.ok(roles.includes("notes"));
    assert.ok(roles.includes("schedule"));
    assert.ok(roles.includes("index"));
  });

  it("infers plan-layout for live-style Beckstead page 5 roof layout mixed sheet", () => {
    const roles = inferContentRolesFromVisualEvidence({
      pageKind: "mixed",
      contentRoles: [],
      titleOrLabel: "S3.1 - Roof Layout and Electrical Plan",
      evidenceText: "ROOF LAYOUT AND ELECTRICAL PLAN, ROOF LAYOUT",
    });
    assert.ok(roles.includes("plan-layout"));
  });
});

describe("buildFramingExtractionWorkPlan Beckstead routing", () => {
  it("produces >20 total images across work units while each unit stays within budget", () => {
    const pages = loadBecksteadClassification();
    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(11),
      pages,
      scopeName: "framing",
    });

    assert.ok(plan.audit.totalEstimatedImages > MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST);
    assert.ok(plan.audit.totalWorkUnits >= 3);
    for (const unit of plan.audit.workUnits) {
      assert.ok(unit.estimatedImages <= MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST);
      assert.ok(unit.pageCount >= 2);
    }
  });

  it("includes page 1 global context when live classification omitted contentRoles", () => {
    const pages = loadBecksteadClassification().map((page) =>
      page.pageNumber === 1 ? { ...page, contentRoles: [] as const } : page,
    );
    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(11),
      pages,
      scopeName: "framing",
      intents: ["wall-framing"],
    });

    assert.ok(
      plan.workUnits.every((unit) =>
        unit.bundle.members.some(
          (member) => member.role === "global" && member.pageNumber === 1,
        ),
      ),
    );
  });
});

describe("buildFramingExtractionWorkPlan Beckstead routing (fixture)", () => {
  it("includes page 1 as global context in wall-framing bundles and excludes detail sheets", () => {
    const pages = loadBecksteadClassification();
    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(11),
      pages,
      scopeName: "framing",
      intents: ["wall-framing"],
    });

    assert.equal(plan.workUnits.length, 2);
    for (const unit of plan.workUnits) {
      assert.ok(
        unit.bundle.members.some(
          (member) => member.role === "global" && member.pageNumber === 1,
        ),
      );
      assert.ok(
        unit.bundle.members.every(
          (member) => member.pageNumber < 6 || member.pageNumber === 1,
        ),
      );
    }
  });

  it("uses default wall, floor, roof, openings, structural-members, and sheathing intents", () => {
    const pages = loadBecksteadClassification();
    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(11),
      pages,
      scopeName: "framing",
    });

    assert.equal(plan.workUnits.length, 3);
    assert.equal(plan.audit.totalWorkUnits, 3);
    const crawlPrimaries = plan.audit.workUnits.filter((unit) =>
      unit.primaryPageNumbers.includes(3),
    );
    assert.equal(crawlPrimaries.length, 1);
    const primaryPages = plan.audit.workUnits.flatMap(
      (unit) => unit.primaryPageNumbers,
    );
    assert.deepEqual([...primaryPages].sort((a, b) => a - b), [3, 4, 5]);
    const primaryCounts = new Map<number, number>();
    for (const pageNumber of primaryPages) {
      primaryCounts.set(pageNumber, (primaryCounts.get(pageNumber) ?? 0) + 1);
    }
    for (const [pageNumber, count] of primaryCounts) {
      assert.equal(
        count,
        1,
        `page ${pageNumber} must not have overlapping 6-intent primaries`,
      );
    }
    const crawl = plan.workUnits.find((unit) =>
      unit.bundle.members.some(
        (member) => member.role === "primary" && member.pageNumber === 3,
      ),
    );
    assert.ok(crawl);
    assert.ok(crawl.identifiedSystems.includes("openings"));
    assert.ok(crawl.identifiedSystems.includes("structural-members"));
    assert.ok(crawl.identifiedSystems.includes("floor-framing"));
    for (const unit of plan.audit.workUnits) {
      assert.ok(unit.regionId);
      assert.ok((unit.requiredInputs?.length ?? 0) > 0);
    }
  });

  it("includes floor-framing on crawl/foundation p3 when visual classification omits the floor hint", () => {
    const pages = loadBecksteadClassification().map((page) =>
      page.pageNumber === 3
        ? {
            ...page,
            scopeHints: page.scopeHints.filter((hint) => hint !== "floor"),
          }
        : page,
    );
    const crawlPage = pages.find((page) => page.pageNumber === 3);
    assert.ok(crawlPage);
    assert.ok(!crawlPage.scopeHints.includes("floor"));
    assert.match(crawlPage.titleOrLabel ?? "", /crawl|foundation/i);

    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(11),
      pages,
      scopeName: "framing",
    });

    assert.equal(plan.workUnits.length, 3);
    assert.equal(plan.audit.totalWorkUnits, 3);
    const primaryPages = plan.audit.workUnits.flatMap(
      (unit) => unit.primaryPageNumbers,
    );
    assert.deepEqual([...primaryPages].sort((a, b) => a - b), [3, 4, 5]);
    assert.equal(
      primaryPages.filter((pageNumber) => pageNumber === 3).length,
      1,
    );
    const crawl = plan.workUnits.find((unit) =>
      unit.bundle.members.some(
        (member) => member.role === "primary" && member.pageNumber === 3,
      ),
    );
    assert.ok(crawl);
    assert.ok(crawl.identifiedSystems.includes("floor-framing"));
  });

  it("does not add floor-framing to elevation sheets", () => {
    const pages = loadBecksteadClassification().map((page) =>
      page.pageNumber === 2
        ? {
            ...page,
            relevantToFraming: true,
            scopeHints: ["structural", "framing"],
            titleOrLabel: "S2.1 - Foundation Elevations",
          }
        : page,
    );

    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(11),
      pages,
      scopeName: "framing",
    });

    assert.equal(plan.workUnits.length, 3);
    const elevationPrimaries = plan.audit.workUnits.filter((unit) =>
      unit.primaryPageNumbers.includes(2),
    );
    assert.equal(elevationPrimaries.length, 0);
    assert.ok(
      plan.workUnits.every(
        (unit) =>
          !(
            unit.bundle.intent === "floor-framing" &&
            unit.bundle.members.some(
              (member) => member.role === "primary" && member.pageNumber === 2,
            )
          ),
      ),
    );
  });

  it("includes floor-framing for pageKind plan + plan-layout without a floor hint", () => {
    const floorPlanPage = classifiedPlanPageSchema.parse({
      pageNumber: 4,
      sheetId: "A2.01",
      label: "A2.01",
      pageKind: "plan",
      scopeHints: ["architectural", "structural"],
      contentRoles: ["plan-layout"],
      discipline: "architectural",
      pageType: "plan",
      relevantToFraming: true,
      needsVisualClassification: false,
      classificationMethod: "visual",
      titleOrLabel: "A2.01",
      evidenceText: "LEVEL 1",
      classificationReason: "fixture",
      confidenceLabel: "high",
    });

    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(4),
      pages: [floorPlanPage],
      scopeName: "framing",
    });

    assert.equal(plan.workUnits.length, 1);
    assert.ok(plan.workUnits[0]?.identifiedSystems.includes("floor-framing"));
  });

  it("does not treat a roof-scoped plan sheet as floor-framing from pageKind alone", () => {
    const roofPlanPage = classifiedPlanPageSchema.parse({
      pageNumber: 5,
      sheetId: "S3.1",
      label: "S3.1",
      pageKind: "plan",
      scopeHints: ["roof", "structural"],
      contentRoles: ["plan-layout"],
      discipline: "structural",
      pageType: "plan",
      relevantToFraming: true,
      needsVisualClassification: false,
      classificationMethod: "visual",
      titleOrLabel: "S3.1 - Roof Plan",
      evidenceText: "ROOF PLAN",
      classificationReason: "fixture",
      confidenceLabel: "high",
    });

    const plan = buildFramingExtractionWorkPlan({
      planIndex: planIndexWithPages(5),
      pages: [roofPlanPage],
      scopeName: "framing",
    });

    assert.equal(plan.workUnits.length, 1);
    assert.ok(!plan.workUnits[0]?.identifiedSystems.includes("floor-framing"));
    assert.ok(plan.workUnits[0]?.identifiedSystems.includes("roof-framing"));
  });
});

describe("aggregateExtractionEvidencePasses cross-page provenance", () => {
  it("preserves bundle and pass stamps from multiple work units", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: {
            extractionPassId: "pass:bundle:framing:wall-framing:p3-1",
            bundleId: "bundle:framing:wall-framing:p3-1",
          },
          evidence: [
            wallEvidence({
              id: "E-SW2-TYPE",
              subjectKey: "SW2",
              propertyPath: "wallType",
              candidateValue: "shear wall",
              pageNumber: 3,
              tileId: "t-r1-c1",
            }),
            wallEvidence({
              id: "E-SW2-SHEATH",
              subjectKey: "SW2",
              propertyPath: "assembly.sheathing",
              candidateValue: "7/16 OSB",
              pageNumber: 1,
            }),
          ],
        },
        {
          stamp: {
            extractionPassId: "pass:bundle:framing:wall-framing:p4-1",
            bundleId: "bundle:framing:wall-framing:p4-1",
          },
          evidence: [
            wallEvidence({
              id: "E-W1-LOC",
              subjectKey: "W1",
              propertyPath: "location",
              candidateValue: "interior",
              pageNumber: 4,
              tileId: "t-r0-c2",
            }),
          ],
        },
      ],
    });

    assert.equal(aggregated.length, 3);
    assert.equal(
      aggregated.find((record) => record.source.page.pageNumber === 1)?.bundleId,
      "bundle:framing:wall-framing:p3-1",
    );
    assert.equal(
      aggregated.find((record) => record.source.page.pageNumber === 3)?.source
        .tileId,
      "t-r1-c1",
    );
    assert.equal(
      aggregated.find((record) => record.source.page.pageNumber === 4)?.extractionPassId,
      "pass:bundle:framing:wall-framing:p4-1",
    );
  });
});

const TWO_LABELED_OPENINGS_TEXT = [
  'Opening D1 in wall W1 ROUGH 3\'-0" x 6\'-8" QTY 1',
  'Opening W12 in wall W2 ROUGH 4\'-0" x 5\'-0" QTY 1',
  'WB2-8DF (2)-1.75"x11.875" 12\'-0"',
].join("\n");

function crawlPlanPage(): ClassifiedPlanPage {
  return classifiedPlanPageSchema.parse({
    pageNumber: 3,
    sheetId: "S2.2",
    label: "Crawl",
    pageKind: "framing-plan",
    scopeHints: ["structural", "floor", "framing"],
    contentRoles: ["plan-layout"],
    discipline: "structural",
    pageType: "plan",
    relevantToFraming: true,
    needsVisualClassification: false,
    classificationMethod: "text",
    titleOrLabel: "S2.2 - Crawl Space/Foundation Plan",
    evidenceText: "CRAWL SPACE/FOUNDATION PLAN",
    classificationReason: "fixture",
    confidenceLabel: "high",
  });
}

function crawlPlanIndex(textContent: string): PlanIndex {
  return {
    pdfPath: "/tmp/crawl-region.pdf",
    totalPages: 3,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "a".repeat(64),
    pages: [
      {
        pageNumber: 1,
        sheetId: "S1.1",
        label: "Index",
        textContent: "",
      },
      {
        pageNumber: 2,
        sheetId: "S2.1",
        label: "Elev",
        textContent: "",
      },
      {
        pageNumber: 3,
        sheetId: "S2.2",
        label: "Crawl",
        textContent,
      },
    ],
  };
}

function record(input: {
  id: string;
  subjectKind: Evidence["subjectKind"];
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number | boolean | null;
  pageNumber?: number;
}): Evidence {
  return {
    id: input.id,
    type: "note",
    relationship: "supports",
    description: input.propertyPath,
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber ?? 3,
        sheetId: "S2.2",
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: input.subjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: input.subjectKey,
    references: [],
    subjectKind: input.subjectKind,
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: null,
    bundleId: null,
  };
}

function labeledOpeningEvidence(): Evidence[] {
  return [
    record({
      id: "E-D1-CAT",
      subjectKind: "opening",
      subjectKey: "D1",
      propertyPath: "category",
      candidateValue: "door",
    }),
    record({
      id: "E-D1-PARENT",
      subjectKind: "opening",
      subjectKey: "D1",
      propertyPath: "parentWallTag",
      candidateValue: "W1",
    }),
    record({
      id: "E-D1-QTY",
      subjectKind: "opening",
      subjectKey: "D1",
      propertyPath: "quantity",
      candidateValue: 1,
    }),
    record({
      id: "E-D1-RW",
      subjectKind: "opening",
      subjectKey: "D1",
      propertyPath: "dimensions.roughWidthFeet",
      candidateValue: 3,
    }),
    record({
      id: "E-D1-RH",
      subjectKind: "opening",
      subjectKey: "D1",
      propertyPath: "dimensions.roughHeightFeet",
      candidateValue: 6.67,
    }),
    record({
      id: "E-W12-CAT",
      subjectKind: "opening",
      subjectKey: "W12",
      propertyPath: "category",
      candidateValue: "window",
    }),
    record({
      id: "E-W12-PARENT",
      subjectKind: "opening",
      subjectKey: "W12",
      propertyPath: "parentWallTag",
      candidateValue: "W2",
    }),
    record({
      id: "E-W12-QTY",
      subjectKind: "opening",
      subjectKey: "W12",
      propertyPath: "quantity",
      candidateValue: 1,
    }),
    record({
      id: "E-W12-RW",
      subjectKind: "opening",
      subjectKey: "W12",
      propertyPath: "dimensions.roughWidthFeet",
      candidateValue: 4,
    }),
    record({
      id: "E-W12-RH",
      subjectKind: "opening",
      subjectKey: "W12",
      propertyPath: "dimensions.roughHeightFeet",
      candidateValue: 5,
    }),
    record({
      id: "E-WB2-CAT",
      subjectKind: "structural-member",
      subjectKey: "WB2-8DF",
      propertyPath: "category",
      candidateValue: "beam",
    }),
    record({
      id: "E-WB2-SIZE",
      subjectKind: "structural-member",
      subjectKey: "WB2-8DF",
      propertyPath: "size",
      candidateValue: '(2)-1.75"x11.875"',
    }),
    record({
      id: "E-WB2-LEN",
      subjectKind: "structural-member",
      subjectKey: "WB2-8DF",
      propertyPath: "lengthFeet",
      candidateValue: 12,
    }),
  ];
}

function categoryOnlyStubs(): Evidence[] {
  return [
    record({
      id: "E-CRAWL-CAT",
      subjectKind: "opening",
      subjectKey: "crawl access",
      propertyPath: "category",
      candidateValue: "other",
    }),
    record({
      id: "E-WB2-CAT",
      subjectKind: "structural-member",
      subjectKey: "WB2-8DF",
      propertyPath: "category",
      candidateValue: "beam",
    }),
  ];
}

const LIVE_WASTE_OPENING_KEYS = [
  "CRAWL-SPACE-ACCESS",
  "NOTCH-DOOR",
  "GARAGE-DOOR",
] as const;

function liveWasteCategoryOnlyStubs(): Evidence[] {
  return LIVE_WASTE_OPENING_KEYS.map((subjectKey) =>
    record({
      id: `E-${subjectKey}-CAT`,
      subjectKind: "opening",
      subjectKey,
      propertyPath: "category",
      candidateValue: "other",
    }),
  );
}

function liveWasteCompletenessWithIdentityRestubs(): Evidence[] {
  return LIVE_WASTE_OPENING_KEYS.flatMap((subjectKey) => [
    record({
      id: `E-${subjectKey}-CAT`,
      subjectKind: "opening",
      subjectKey,
      propertyPath: "category",
      candidateValue: "other",
    }),
    record({
      id: `E-${subjectKey}-PARENT`,
      subjectKind: "opening",
      subjectKey,
      propertyPath: "parentWallTag",
      candidateValue: "W-CRAWL",
    }),
    record({
      id: `E-${subjectKey}-QTY`,
      subjectKind: "opening",
      subjectKey,
      propertyPath: "quantity",
      candidateValue: 1,
    }),
  ]);
}

function identityRecordsForKey(
  evidence: readonly Evidence[],
  subjectKey: string,
): Evidence[] {
  return evidence.filter(
    (record) =>
      record.subjectKey === subjectKey &&
      (record.propertyPath === "category" ||
        record.propertyPath === "openingType"),
  );
}

function payload(evidence: Evidence[]): ExtractedFramingEvidencePayload {
  return { evidence };
}

async function runCrawlRegionExtract(input: {
  extractEvidence: ExtractFramingEvidenceFn;
  textContent?: string;
  bindPurposes?: string[];
}): Promise<Awaited<ReturnType<typeof runFramingExtractionPasses>>> {
  const page = crawlPlanPage();
  const planIndex = crawlPlanIndex(input.textContent ?? TWO_LABELED_OPENINGS_TEXT);
  const workPlan = buildFramingExtractionWorkPlan({
    planIndex,
    pages: [page],
    scopeName: "framing",
  });
  assert.equal(workPlan.workUnits.length, 1);

  return runFramingExtractionPasses({
    planIndex,
    pages: [page],
    pageClassification: { pages: [page] },
    planReadingOrder: { orderedPageNumbers: [3] },
    workPlan,
    skipPlanReferenceDrain: true,
    extractEvidence: input.extractEvidence,
    bindClaudeCall: (purpose) => {
      input.bindPurposes?.push(purpose);
      return { onApiCall: () => {}, onUsage: () => {} };
    },
  });
}

describe("detectMissingRequiredInputsForIdentifiedSystems", () => {
  it("treats category-only opening and member stubs as empty required inputs", () => {
    const missing = detectMissingRequiredInputsForIdentifiedSystems({
      evidence: categoryOnlyStubs(),
      identifiedSystems: ["openings", "structural-members", "floor-framing"],
    });
    assert.ok(missing);
    assert.deepEqual(missing.systems, ["openings", "structural-members"]);
    assert.ok(missing.missingPropertyPaths.includes("parentWallTag"));
    assert.ok(missing.missingPropertyPaths.includes("size"));
  });

  it("skips same-bundle follow-up when identified openings/members are identity stubs only", () => {
    assert.equal(
      shouldSkipSameBundleRequiredInputFollowUp({
        evidence: categoryOnlyStubs(),
        identifiedSystems: ["openings", "structural-members", "floor-framing"],
      }),
      true,
    );
    assert.equal(
      shouldSkipSameBundleRequiredInputFollowUp({
        evidence: liveWasteCategoryOnlyStubs(),
        identifiedSystems: ["openings", "structural-members"],
      }),
      true,
    );
  });

  it("does not skip the gate when labeled openings already have parent/quantity/rough dims", () => {
    const missing = detectMissingRequiredInputsForIdentifiedSystems({
      evidence: labeledOpeningEvidence(),
      identifiedSystems: ["openings", "structural-members"],
    });
    assert.equal(missing, null);
    assert.equal(
      shouldSkipSameBundleRequiredInputFollowUp({
        evidence: labeledOpeningEvidence(),
        identifiedSystems: ["openings", "structural-members"],
      }),
      false,
    );
  });

  it("drops follow-up category/openingType restubs for subjectKeys already in the primary pass", () => {
    const kept = dropIdentityRestubsForKnownSubjects({
      primaryEvidence: liveWasteCategoryOnlyStubs(),
      followUpEvidence: [
        ...liveWasteCompletenessWithIdentityRestubs(),
        record({
          id: "E-NEW-DOOR-CAT",
          subjectKind: "opening",
          subjectKey: "NEW-DOOR",
          propertyPath: "category",
          candidateValue: "door",
        }),
      ],
    });
    const keptKeys = kept.map((record) => `${record.subjectKey}:${record.propertyPath}`);
    assert.ok(keptKeys.includes("CRAWL-SPACE-ACCESS:parentWallTag"));
    assert.ok(keptKeys.includes("CRAWL-SPACE-ACCESS:quantity"));
    assert.ok(!keptKeys.includes("CRAWL-SPACE-ACCESS:category"));
    assert.ok(!keptKeys.includes("NOTCH-DOOR:category"));
    assert.ok(!keptKeys.includes("GARAGE-DOOR:category"));
    assert.ok(keptKeys.includes("NEW-DOOR:category"));
  });
});

describe("runFramingExtractionPasses required-input follow-through", () => {
  it("recovers two labeled opening subjectKeys on the first pass when the sheet prints them", async () => {
    const extractEvidence: ExtractFramingEvidenceFn = async (extractInput) => {
      extractInput.onApiCall?.();
      const identified = extractInput.extractionBundle?.identifiedSystems ?? [];
      const text = extractInput.planIndex.pages
        .map((page) => page.textContent)
        .join("\n");
      if (
        identified.includes("openings") &&
        /\bD1\b/.test(text) &&
        /\bW12\b/.test(text)
      ) {
        return payload(labeledOpeningEvidence());
      }
      return payload([]);
    };

    const purposes: string[] = [];
    const result = await runCrawlRegionExtract({ extractEvidence, bindPurposes: purposes });
    const openingKeys = [
      ...new Set(
        result.payload.evidence
          .filter((record) => record.subjectKind === "opening")
          .map((record) => record.subjectKey),
      ),
    ].sort();
    assert.deepEqual(openingKeys, ["D1", "W12"]);
    assert.equal(result.apiCallCount, 1);
    assert.deepEqual(purposes, ["extract:floor-framing"]);
    assert.equal(result.audit.totalWorkUnits, 1);
  });

  it("does not issue required-input follow-up when identified openings/members are identity stubs only", async () => {
    let calls = 0;
    const extractEvidence: ExtractFramingEvidenceFn = async (extractInput) => {
      extractInput.onApiCall?.();
      calls += 1;
      assert.equal(
        extractInput.extractionProjectContext?.requiredInputFollowUp,
        null,
      );
      return payload(categoryOnlyStubs());
    };

    const purposes: string[] = [];
    const result = await runCrawlRegionExtract({ extractEvidence, bindPurposes: purposes });
    const openingKeys = [
      ...new Set(
        result.payload.evidence
          .filter((record) => record.subjectKind === "opening")
          .map((record) => record.subjectKey),
      ),
    ].sort();
    assert.deepEqual(openingKeys, ["crawl access"]);
    assert.equal(calls, 1);
    assert.equal(result.apiCallCount, 1);
    assert.deepEqual(purposes, ["extract:floor-framing"]);
    assert.equal(purposes.includes(REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE), false);
  });

  it("does not invent parent/qty/rough when skipping identity-only follow-up", async () => {
    const extractEvidence: ExtractFramingEvidenceFn = async (extractInput) => {
      extractInput.onApiCall?.();
      return payload([
        ...liveWasteCategoryOnlyStubs(),
        record({
          id: "E-WB2-CAT",
          subjectKind: "structural-member",
          subjectKey: "WB2-8DF",
          propertyPath: "category",
          candidateValue: "beam",
        }),
      ]);
    };

    const purposes: string[] = [];
    const result = await runCrawlRegionExtract({ extractEvidence, bindPurposes: purposes });
    const evidence = result.payload.evidence;

    for (const subjectKey of LIVE_WASTE_OPENING_KEYS) {
      assert.equal(identityRecordsForKey(evidence, subjectKey).length, 1);
      assert.equal(
        evidence.some(
          (record) =>
            record.subjectKey === subjectKey && record.propertyPath === "parentWallTag",
        ),
        false,
      );
      assert.equal(
        evidence.some(
          (record) =>
            record.subjectKey === subjectKey && record.propertyPath === "quantity",
        ),
        false,
      );
    }
    assert.equal(
      evidence.some(
        (record) => record.subjectKey === "WB2-8DF" && record.propertyPath === "size",
      ),
      false,
    );
    assert.equal(result.apiCallCount, 1);
    assert.deepEqual(purposes, ["extract:floor-framing"]);
    assert.equal(purposes.includes(REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE), false);
  });

  it("does not issue a second follow-up loop for still-incomplete identity stubs", async () => {
    const extractEvidence: ExtractFramingEvidenceFn = async (extractInput) => {
      extractInput.onApiCall?.();
      return payload(categoryOnlyStubs());
    };
    const purposes: string[] = [];
    const result = await runCrawlRegionExtract({ extractEvidence, bindPurposes: purposes });
    assert.equal(result.apiCallCount, 1);
    assert.equal(
      purposes.filter((purpose) => purpose === REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE)
        .length,
      0,
    );
  });

  it("keeps primary identity stubs without a follow-up extract or repair", async () => {
    const extractEvidence: ExtractFramingEvidenceFn = async (extractInput) => {
      extractInput.onApiCall?.();
      return payload(liveWasteCategoryOnlyStubs());
    };
    const purposes: string[] = [];
    const result = await runCrawlRegionExtract({ extractEvidence, bindPurposes: purposes });
    const evidence = result.payload.evidence;
    for (const subjectKey of LIVE_WASTE_OPENING_KEYS) {
      const identity = identityRecordsForKey(evidence, subjectKey);
      assert.equal(identity.length, 1);
      assert.ok(!identity[0]?.extractionPassId?.includes("required-input-followup"));
    }
    assert.equal(
      evidence.filter(
        (record) =>
          record.propertyPath === "category" || record.propertyPath === "openingType",
      ).length,
      LIVE_WASTE_OPENING_KEYS.length,
    );
    assert.equal(result.apiCallCount, 1);
    assert.deepEqual(purposes, ["extract:floor-framing"]);
    assert.equal(purposes.includes(REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE), false);
  });

  it("runs mock extract without Anthropic", async () => {
    const extractEvidence: ExtractFramingEvidenceFn = async (extractInput) => {
      extractInput.onApiCall?.();
      return payload([
        record({
          id: "E-W-TYPE",
          subjectKind: "wall",
          subjectKey: "W1",
          propertyPath: "wallType",
          candidateValue: "wood stud wall",
        }),
        ...labeledOpeningEvidence(),
      ]);
    };
    const result = await runCrawlRegionExtract({ extractEvidence });
    assert.ok(result.payload.evidence.length > 0);
    assert.equal(result.apiCallCount, 1);
  });
});
