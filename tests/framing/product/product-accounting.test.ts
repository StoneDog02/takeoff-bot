import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFramingTakeoff } from "../../../src/framing/calculate/calculateFramingTakeoff.js";
import {
  buildProductAccounting,
  diagnoseInputGap,
  domainSignalsFire,
  materialMatchesRule,
} from "../../../src/framing/product/buildProductAccounting.js";
import {
  emptyFramingConstruction,
  type FramingConstruction,
} from "../../../src/framing/schemas/framingConstruction.schema.js";
import type { FramingMaterialLineItem } from "../../../src/framing/schemas/material.schema.js";

function resolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit.`,
    assumptionIds: [] as string[],
  };
}

function stickRoofConstruction(): FramingConstruction {
  const construction = emptyFramingConstruction();
  construction.roofFraming = {
    systems: [
      {
        id: "RFS-1",
        objectType: "roof-framing-system",
        resolutionTraces: [
          resolvedTrace("assembly.framingType"),
          resolvedTrace("assembly.memberSize"),
          resolvedTrace("assembly.memberSpacingInches"),
        ],
        name: "Main roof",
        level: "Roof",
        constructionPhase: "new",
        assembly: {
          framingType: "stick-framed",
          memberSize: "2x8",
          memberSpacingInches: 24,
        },
        planeIds: ["RFP-1"],
      },
    ],
    planes: [
      {
        id: "RFP-1",
        objectType: "roof-plane",
        resolutionTraces: [
          resolvedTrace("spanDirection"),
          resolvedTrace("rafterLayoutLengthFeet"),
        ],
        parentSystemId: "RFS-1",
        layout: null,
        framingDirection: null,
        spanDirection: "north-south",
        rafterLayoutLengthFeet: 30,
        pitch: null,
        areaSquareFeet: null,
        boundingWallIds: [],
        openingIds: [],
        structuralMemberIds: [],
      },
    ],
  };
  return construction;
}

function trussRoofConstruction(): FramingConstruction {
  const construction = emptyFramingConstruction();
  construction.roofFraming = {
    systems: [
      {
        id: "RFS-T",
        objectType: "roof-framing-system",
        resolutionTraces: [resolvedTrace("assembly.framingType")],
        name: "Truss roof",
        level: "Roof",
        constructionPhase: "new",
        assembly: {
          framingType: "roof-truss",
          memberSize: null,
          memberSpacingInches: null,
        },
        planeIds: [],
      },
    ],
    planes: [],
  };
  return construction;
}

function floorJoistConstruction(): FramingConstruction {
  return {
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
            resolvedTrace("spanDirection"),
            resolvedTrace("joistLayoutLengthFeet"),
            resolvedTrace("joistMemberLengthFeet"),
          ],
          parentSystemId: "FFS-CRAWL",
          layout: "crawl",
          framingDirection: null,
          spanDirection: "north-south",
          joistLayoutLengthFeet: 40,
          joistMemberLengthFeet: 17,
          areaSquareFeet: null,
          boundingWallIds: [],
          openingIds: [],
          structuralMemberIds: [],
        },
      ],
    },
  };
}

describe("buildProductAccounting house-first decision table", () => {
  it("marks stick-framed house truss checklist as applicability_unestablished", () => {
    const construction = stickRoofConstruction();
    const materials = calculateFramingTakeoff(construction).materials;
    const accounting = buildProductAccounting({
      projectId: "stick-1",
      construction,
      materials,
    });
    const commonTrusses = accounting.entries.find(
      (entry) => entry.taxonomyItemId === "common-trusses",
    );
    assert.equal(commonTrusses?.status, "unaccounted");
    assert.equal(commonTrusses?.gapClass, "applicability_unestablished");
  });

  it("marks established truss roof without materials as calculator_gap", () => {
    const construction = trussRoofConstruction();
    const accounting = buildProductAccounting({
      projectId: "truss-1",
      construction,
      materials: [],
    });
    const commonTrusses = accounting.entries.find(
      (entry) => entry.taxonomyItemId === "common-trusses",
    );
    assert.equal(commonTrusses?.status, "unaccounted");
    assert.equal(commonTrusses?.gapClass, "calculator_gap");
  });

  it("marks floor joists calculated when materials match", () => {
    const construction = floorJoistConstruction();
    const materials = calculateFramingTakeoff(construction).materials;
    assert.equal(
      materials.find((line) => line.quantityKey === "floor.joists")?.quantity,
      31,
    );
    const accounting = buildProductAccounting({
      projectId: "floor-1",
      construction,
      materials,
    });
    const joists = accounting.entries.find(
      (entry) => entry.taxonomyItemId === "floor-joists",
    );
    assert.equal(joists?.status, "calculated");
    assert.equal(joists?.gapClass, undefined);
  });

  it("marks rim with domain signal and no emitter as calculator_gap", () => {
    const construction = floorJoistConstruction();
    construction.floorFraming.systems[0]!.assembly.rimBoard = "1-1/8 rim board";
    const materials = calculateFramingTakeoff(construction).materials;
    const accounting = buildProductAccounting({
      projectId: "rim-1",
      construction,
      materials,
    });
    const rim = accounting.entries.find(
      (entry) => entry.taxonomyItemId === "rim-board",
    );
    assert.equal(rim?.status, "unaccounted");
    assert.equal(rim?.gapClass, "calculator_gap");
  });

  it("does not invent not_applicable or not_determinable statuses", () => {
    const accounting = buildProductAccounting({
      projectId: "empty-1",
      construction: emptyFramingConstruction(),
      materials: [],
    });
    for (const entry of accounting.entries) {
      assert.ok(
        entry.status === "calculated" || entry.status === "unaccounted",
      );
      if (entry.status === "unaccounted") {
        assert.ok(
          entry.gapClass === "applicability_unestablished" ||
            entry.gapClass === "read_or_input_gap" ||
            entry.gapClass === "calculator_gap",
        );
      }
    }
  });

  it("materialMatchesRule requires configured criteria", () => {
    const line: FramingMaterialLineItem = {
      id: "MAT-1",
      quantityKey: "floor.joists",
      category: "lumber",
      description: "TJI 210 floor joists",
      material: "TJI 210 i-joist",
      lengthOrType: "17 ft",
      canonicalClassification: "floor-joist-i-joist-tji-210",
      quantity: 31,
      unit: "each",
      sourceObjectIds: ["FFA-1"],
      assumptionIds: [],
    };
    assert.equal(
      materialMatchesRule(line, {
        quantityKeys: ["floor.joists"],
        canonicalClassificationPrefixes: ["floor-joist-"],
      }),
      true,
    );
    assert.equal(materialMatchesRule(line, {}), false);
  });

  it("domainSignalsFire is false for empty signal list", () => {
    const result = domainSignalsFire(emptyFramingConstruction(), []);
    assert.equal(result.fires, false);
  });

  it("diagnoseInputGap no_emitter returns calculator_gap", () => {
    assert.equal(
      diagnoseInputGap(emptyFramingConstruction(), "no_emitter"),
      "calculator_gap",
    );
  });
});
