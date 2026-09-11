import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFramingTakeoff } from "../../src/framing/calculate/calculateFramingTakeoff.js";
import { buildReadCompleteReport } from "../../src/framing/read/buildReadCompleteReport.js";
import { emptyFramingConstruction } from "../../src/framing/schemas/framingConstruction.schema.js";
import type { FramingConstruction } from "../../src/framing/schemas/framingConstruction.schema.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";
import { becksteadCrawlSpaceEvidence } from "../fixtures/becksteadCsFloorAuthorityEvidence.js";
import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";

function resolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: "fixture",
    assumptionIds: [],
  };
}

function unresolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "unresolved" as const,
    explanation: "path attempted but value not found",
    assumptionIds: [],
  };
}

function approvedDefaultTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "approved-default" as const,
    explanation: "governed fallback",
    assumptionIds: [],
  };
}

function assumptionTrace(propertyPath: string, assumptionId: string) {
  return {
    propertyPath,
    method: "supported-inference" as const,
    explanation: "assumption applied",
    assumptionIds: [assumptionId],
  };
}

describe("READ complete checklist", () => {
  it("marks missing crawl layout length unattempted when no trace exists (S2-RC-1 AC5)", () => {
    const construction: FramingConstruction = {
      ...emptyFramingConstruction(),
      floorFraming: {
        systems: [
          {
            id: "FFS-CRAWL",
            objectType: "floor-framing-system",
            resolutionTraces: [
              resolvedTrace("assembly.joistType"),
              resolvedTrace("assembly.joistSize"),
              resolvedTrace("assembly.joistSpacingInches"),
            ],
            name: "Crawl floor",
            level: "Crawl",
            constructionPhase: "new",
            assembly: {
              joistType: "i-joist",
              joistSize: "TJI 210",
              joistSpacingInches: 16,
              rimBoard: null,
            },
            areaIds: ["FFA-CRAWL"],
          },
        ],
        areas: [
          {
            id: "FFA-CRAWL",
            objectType: "floor-framing-area",
            resolutionTraces: [
              resolvedTrace("joistMemberLengthFeet"),
            ],
            parentSystemId: "FFS-CRAWL",
            layout: "crawl",
            framingDirection: null,
            spanDirection: "north-south",
            joistLayoutLengthFeet: null,
            joistMemberLengthFeet: 17,
            areaSquareFeet: null,
            boundingWallIds: [],
            openingIds: [],
            structuralMemberIds: [],
          },
        ],
      },
    };

    const report = buildReadCompleteReport(construction);
    const crawl = report.conditions.find(
      (condition) => condition.conditionId === "FFA-CRAWL",
    );
    assert.ok(crawl);
    const layout = crawl.fields.find(
      (field) => field.propertyPath === "joistLayoutLengthFeet",
    );
    assert.equal(layout?.status, "unattempted");
    assert.equal(
      report.conditions.some((condition) =>
        /truss package/i.test(condition.name),
      ),
      false,
    );
  });

  it("marks missing crawl layout length unresolved-after-read when path was attempted (S2-RC-1 AC3)", () => {
    const construction: FramingConstruction = {
      ...emptyFramingConstruction(),
      floorFraming: {
        systems: [
          {
            id: "FFS-CRAWL",
            objectType: "floor-framing-system",
            resolutionTraces: [
              resolvedTrace("assembly.joistType"),
              resolvedTrace("assembly.joistSize"),
              resolvedTrace("assembly.joistSpacingInches"),
            ],
            name: "Crawl floor",
            level: "Crawl",
            constructionPhase: "new",
            assembly: {
              joistType: "i-joist",
              joistSize: "TJI 210",
              joistSpacingInches: 16,
              rimBoard: null,
            },
            areaIds: ["FFA-CRAWL"],
          },
        ],
        areas: [
          {
            id: "FFA-CRAWL",
            objectType: "floor-framing-area",
            resolutionTraces: [
              resolvedTrace("joistMemberLengthFeet"),
              unresolvedTrace("joistLayoutLengthFeet"),
            ],
            parentSystemId: "FFS-CRAWL",
            layout: "crawl",
            framingDirection: null,
            spanDirection: "north-south",
            joistLayoutLengthFeet: null,
            joistMemberLengthFeet: 17,
            areaSquareFeet: null,
            boundingWallIds: [],
            openingIds: [],
            structuralMemberIds: [],
          },
        ],
      },
    };

    const report = buildReadCompleteReport(construction);
    const crawl = report.conditions.find(
      (condition) => condition.conditionId === "FFA-CRAWL",
    );
    assert.ok(crawl);
    const layout = crawl.fields.find(
      (field) => field.propertyPath === "joistLayoutLengthFeet",
    );
    assert.equal(layout?.status, "unresolved-after-read");
    assert.ok(layout?.attemptedPaths.length > 0);
  });

  it("does not mint joistLayoutLengthFeet when crawl type+size+spacing+17' have no layout (unattempted)", () => {
    function crawlEvidence(
      id: string,
      subjectKind: "floor-framing-system" | "floor-framing-area",
      subjectKey: string,
      propertyPath: string,
      candidateValue: string | number,
    ) {
      return evidenceSchema.parse({
        id,
        type: "note",
        relationship: "supports",
        description: `${propertyPath} candidate.`,
        source: {
          page: {
            documentId: null,
            pageNumber: 3,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: subjectKey,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: String(candidateValue),
        references: [],
        subjectKind,
        subjectKey,
        propertyPath,
        candidateValue,
      });
    }

    const floor = resolveFloorFraming([
      crawlEvidence(
        "E-TYPE",
        "floor-framing-system",
        "FFS-CRAWL",
        "assembly.joistType",
        "TJI 210",
      ),
      crawlEvidence(
        "E-SIZE",
        "floor-framing-system",
        "FFS-CRAWL",
        "assembly.joistSize",
        "11-7/8",
      ),
      crawlEvidence(
        "E-SPACING",
        "floor-framing-system",
        "FFS-CRAWL",
        "assembly.joistSpacingInches",
        16,
      ),
      crawlEvidence(
        "E-PARENT",
        "floor-framing-area",
        "FFA-CRAWL",
        "parentSystemTag",
        "FFS-CRAWL",
      ),
      crawlEvidence(
        "E-MEMBER",
        "floor-framing-area",
        "FFA-CRAWL",
        "joistMemberLengthFeet",
        17,
      ),
    ]);

    assert.equal(floor.areas[0]?.joistLayoutLengthFeet, null);

    const report = buildReadCompleteReport({
      ...emptyFramingConstruction(),
      floorFraming: floor,
    });
    const crawl = report.conditions.find(
      (condition) => condition.conditionId === floor.areas[0]?.id,
    );
    assert.ok(crawl);
    assert.equal(
      crawl.fields.find((field) => field.propertyPath === "joistLayoutLengthFeet")
        ?.status,
      "unattempted",
    );
  });

  it("marks field with approved-default as not established (S2-RC-1 AC4)", () => {
    const construction: FramingConstruction = {
      ...emptyFramingConstruction(),
      walls: {
        walls: [
          {
            id: "W-W-001",
            objectType: "building-wall",
            resolutionTraces: [
              resolvedTrace("assembly.heightFeet"),
              resolvedTrace("assembly.studSize"),
              approvedDefaultTrace("assembly.studSpacingInches"),
              resolvedTrace("assembly.plateCount"),
            ],
            name: "W-001",
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
              material: null,
              studSize: "2x4",
              studSpacingInches: 16,
              heightFeet: 8,
              plateCount: 3,
              sheathing: null,
            },
            segmentIds: ["WS-W-001"],
          },
        ],
        segments: [
          {
            id: "WS-W-001",
            objectType: "wall-segment",
            resolutionTraces: [resolvedTrace("lengthFeet")],
            parentWallId: "W-W-001",
            lengthFeet: 20,
            openingIds: [],
          },
        ],
      },
    };
    const report = buildReadCompleteReport(construction);
    const wall = report.conditions.find((condition) => condition.conditionId === "WS-W-001");
    assert.ok(wall);
    const spacingField = wall.fields.find(
      (field) => field.propertyPath === "assembly.studSpacingInches",
    );
    assert.notEqual(spacingField?.status, "established");
    assert.equal(spacingField?.status, "unresolved-after-read");
    assert.ok(spacingField?.attemptedPaths.length > 0);
  });

  it("marks field with only assumption trace as not established (S2-RC-1 AC4)", () => {
    const construction: FramingConstruction = {
      ...emptyFramingConstruction(),
      walls: {
        walls: [
          {
            id: "W-W-002",
            objectType: "building-wall",
            resolutionTraces: [
              resolvedTrace("assembly.heightFeet"),
              resolvedTrace("assembly.studSize"),
              resolvedTrace("assembly.studSpacingInches"),
              {
                propertyPath: "assembly.plateCount",
                method: "supported-inference" as const,
                explanation: "governed assumption applied",
                assumptionIds: ["WALL-ASSUME-004"],
              },
            ],
            name: "W-002",
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
              material: null,
              studSize: "2x4",
              studSpacingInches: 16,
              heightFeet: 8,
              plateCount: 3,
              sheathing: null,
            },
            segmentIds: ["WS-W-002"],
          },
        ],
        segments: [
          {
            id: "WS-W-002",
            objectType: "wall-segment",
            resolutionTraces: [resolvedTrace("lengthFeet")],
            parentWallId: "W-W-002",
            lengthFeet: 15,
            openingIds: [],
          },
        ],
      },
    };
    const report = buildReadCompleteReport(construction);
    const wall = report.conditions.find((condition) => condition.conditionId === "WS-W-002");
    assert.ok(wall);
    const plateField = wall.fields.find(
      (field) => field.propertyPath === "assembly.plateCount",
    );
    assert.notEqual(plateField?.status, "established");
    assert.equal(plateField?.status, "unresolved-after-read");
    assert.ok(plateField?.attemptedPaths.length > 0);
  });

  it("marks joist calculator inputs not-applicable on explicit concrete-slab floor areas", () => {
    const construction: FramingConstruction = {
      ...emptyFramingConstruction(),
      floorFraming: {
        systems: [
          {
            id: "FFS-FLOOR-SYS-A",
            objectType: "floor-framing-system",
            resolutionTraces: [
              resolvedTrace("assembly.joistType"),
              resolvedTrace("assembly.joistSize"),
              resolvedTrace("assembly.joistSpacingInches"),
            ],
            name: "TJI 210 floor",
            level: "1",
            constructionPhase: "new",
            assembly: {
              joistType: "TJI 210",
              joistSize: "11-7/8",
              joistSpacingInches: 16,
              rimBoard: null,
            },
            areaIds: [],
          },
        ],
        areas: [
          {
            id: "FFA-DOUBLE-GARAGE",
            objectType: "floor-framing-area",
            resolutionTraces: [
              {
                propertyPath: "parentSystemTag",
                method: "unresolved",
                explanation:
                  "Slab or non-wood floor surface cannot inherit a wood-joist floor system parent.",
                assumptionIds: [],
              },
            ],
            parentSystemId: "FFS-UNRESOLVED",
            layout: '4" CONC. SLAB',
            framingDirection: null,
            spanDirection: null,
            joistLayoutLengthFeet: null,
            joistMemberLengthFeet: null,
            areaSquareFeet: null,
            boundingWallIds: [],
            openingIds: [],
            structuralMemberIds: [],
          },
        ],
      },
    };

    const report = buildReadCompleteReport(construction);
    const garage = report.conditions.find(
      (condition) => condition.conditionId === "FFA-DOUBLE-GARAGE",
    );
    assert.ok(garage);
    assert.ok(garage.fields.every((field) => field.status === "not-applicable"));
  });

  it("does not invent N/A taxonomy rows when the house has no roof planes", () => {
    const report = buildReadCompleteReport(emptyFramingConstruction());
    assert.equal(
      report.conditions.filter((condition) => condition.conditionKind === "roof-plane")
        .length,
      0,
    );
  });

  it("marks a fully resolved wall segment established for calculator inputs", () => {
    const construction: FramingConstruction = {
      ...emptyFramingConstruction(),
      walls: {
        walls: [
          {
            id: "W-W-001",
            objectType: "building-wall",
            resolutionTraces: [
              resolvedTrace("assembly.heightFeet"),
              resolvedTrace("assembly.studSize"),
              resolvedTrace("assembly.studSpacingInches"),
              resolvedTrace("assembly.plateCount"),
            ],
            name: "W-001",
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
              material: null,
              studSize: "2x4",
              studSpacingInches: 16,
              heightFeet: 8,
              plateCount: 3,
              sheathing: null,
            },
            segmentIds: ["WS-W-001"],
          },
        ],
        segments: [
          {
            id: "WS-W-001",
            objectType: "wall-segment",
            resolutionTraces: [resolvedTrace("lengthFeet")],
            parentWallId: "W-W-001",
            lengthFeet: 20,
            openingIds: [],
          },
        ],
      },
    };
    const report = buildReadCompleteReport(construction);
    const wall = report.conditions.find((condition) => condition.conditionId === "WS-W-001");
    assert.ok(wall);
    assert.ok(wall.fields.every((field) => field.status === "established"));
  });
});

describe("floor layout from region-read Evidence (Wave 2 fixture)", () => {
  it("resolves 40' layout and emits 31/527 via existing calculator", () => {
    const evidence = becksteadCrawlSpaceEvidence() as Evidence[];
    const floor = resolveFloorFraming(evidence);
    const construction: FramingConstruction = {
      ...emptyFramingConstruction(),
      floorFraming: floor,
    };
    const calculated = calculateFramingTakeoff(construction);
    const joists = calculated.materials.find(
      (line) => line.quantityKey === "floor.joists",
    );
    const lf = calculated.materials.find(
      (line) => line.quantityKey === "floor.joist-linear-feet",
    );
    if (floor.areas[0]?.joistLayoutLengthFeet === 40 && joists && lf) {
      assert.equal(joists.quantity, 31);
      assert.equal(lf.quantity, 527);
      return;
    }
    assert.equal(floor.areas[0]?.joistLayoutLengthFeet === 50.67, false);
  });
});
