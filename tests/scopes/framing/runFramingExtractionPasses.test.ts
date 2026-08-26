import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { aggregateExtractionEvidencePasses } from "../../../src/plans/aggregateExtractionEvidencePasses.js";
import {
  classifiedPlanPageSchema,
  type ClassifiedPlanPage,
  inferContentRolesFromVisualEvidence,
} from "../../../src/plans/pageClassification.js";
import type { PlanIndex } from "../../../src/plans/PlanIndex.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../../src/plans/visualImageBudget.js";
import {
  buildFramingExtractionWorkPlan,
  DEFAULT_FRAMING_EXTRACTION_INTENTS,
} from "../../../src/scopes/framing/extraction/buildFramingExtractionWorkPlan.js";
import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";

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
    "../../fixtures/beckstead-b1.4-live-classification.json",
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

    const intents = new Set(plan.audit.workUnits.map((unit) => unit.intent));
    for (const intent of DEFAULT_FRAMING_EXTRACTION_INTENTS) {
      assert.ok(intents.has(intent));
    }
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
