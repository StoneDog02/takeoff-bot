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

function mixedTrussAndRafterRoofConstruction(): FramingConstruction {
  const construction = emptyFramingConstruction();
  construction.roofFraming = {
    systems: [
      {
        id: "RFS-MIX",
        objectType: "roof-framing-system",
        resolutionTraces: [resolvedTrace("assembly.framingType")],
        name: "Mixed roof",
        level: "Roof",
        constructionPhase: "new",
        assembly: {
          framingType: "truss and rafter framing",
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

function wallConstruction(location: "exterior" | "interior" | "unknown"): FramingConstruction {
  const construction = emptyFramingConstruction();
  construction.walls = {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        resolutionTraces: [
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.studSize"),
          resolvedTrace("assembly.plateCount"),
        ],
        name: `${location} wall W-001`,
        level: "Level 1",
        wallType: "wood-stud-wall",
        semanticTypeKey: null,
        bindingAuthorityGrade: null,
        location,
        bearingStatus: "unknown",
        isShearOrBraced: null,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: null,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: ["WS-001"],
      },
    ],
    segments: [
      {
        id: "WS-001",
        objectType: "wall-segment",
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: "W-001",
        lengthFeet: 20,
        openingIds: [],
      },
    ],
  };
  return construction;
}

function structuralMember(overrides: {
  id: string;
  category: "header" | "beam" | "girder" | "post" | "unknown" | "truss";
  materialType: string | null;
  size: string | null;
  lengthFeet: number | null;
  quantity: number | null;
  supportedObjectIds?: string[];
}): FramingConstruction["structuralMembers"]["structuralMembers"][number] {
  const traces = [];
  if (overrides.materialType) traces.push(resolvedTrace("materialType"));
  if (overrides.size) traces.push(resolvedTrace("size"));
  if (overrides.lengthFeet != null) traces.push(resolvedTrace("lengthFeet"));
  if (overrides.quantity != null) traces.push(resolvedTrace("quantity"));
  return {
    id: overrides.id,
    objectType: "structural-member",
    resolutionTraces: traces,
    category: overrides.category,
    materialType: overrides.materialType,
    size: overrides.size,
    plyCount: null,
    lengthFeet: overrides.lengthFeet,
    quantity: overrides.quantity,
    location: null,
    associatedObjectIds: [],
    supportedObjectIds: overrides.supportedObjectIds ?? [],
    supportingObjectIds: [],
    connectorIds: [],
  };
}

function linkedHeaderOpening(input: {
  openingId?: string;
  memberId: string;
  category: "garage-door" | "door" | "window";
  parentWallId: string | null;
}): FramingConstruction["openings"]["openings"][number] {
  return {
    id: input.openingId ?? "O-1",
    objectType: "opening",
    resolutionTraces: [],
    category: input.category,
    identityRole: "occurrence",
    absorbedSubjectKeys: [],
    parentObjectId: null,
    parentWallId: input.parentWallId,
    dimensions: {
      nominalWidthFeet: null,
      nominalHeightFeet: null,
      roughWidthFeet: null,
      roughHeightFeet: null,
    },
    quantity: null,
    scheduleReference: null,
    detailReference: null,
    headerMemberId: input.memberId,
    fireRating: null,
    kingStudCount: null,
    jackStudCount: null,
    positionOffsetFeetFromSegmentStart: null,
  };
}

function accountingById(construction: FramingConstruction) {
  const materials = calculateFramingTakeoff(construction).materials;
  const accounting = buildProductAccounting({
    projectId: "role-match",
    construction,
    materials,
  });
  return {
    materials,
    byId: Object.fromEntries(
      accounting.entries.map((entry) => [entry.taxonomyItemId, entry]),
    ),
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

  it("does not fire has_roof_truss from mixed truss-and-rafter notes", () => {
    const construction = mixedTrussAndRafterRoofConstruction();
    const accounting = buildProductAccounting({
      projectId: "mixed-roof-1",
      construction,
      materials: [],
    });
    for (const itemId of [
      "common-trusses",
      "girder-trusses",
      "gable-end-trusses",
    ] as const) {
      const entry = accounting.entries.find(
        (item) => item.taxonomyItemId === itemId,
      );
      assert.equal(entry?.status, "unaccounted");
      assert.equal(entry?.gapClass, "applicability_unestablished");
    }
    const rafters = accounting.entries.find(
      (entry) => entry.taxonomyItemId === "rafters",
    );
    assert.equal(rafters?.gapClass, "applicability_unestablished");
  });

  it("fires has_roof_truss when a truss member is identified even with a mixed roof note", () => {
    const construction = mixedTrussAndRafterRoofConstruction();
    construction.structuralMembers.structuralMembers = [
      structuralMember({
        id: "SM-TRUSS-1",
        category: "truss",
        materialType: "wood-truss",
        size: "common truss",
        lengthFeet: 24,
        quantity: 12,
      }),
    ];
    const accounting = buildProductAccounting({
      projectId: "mixed-roof-truss-member",
      construction,
      materials: [],
    });
    const commonTrusses = accounting.entries.find(
      (entry) => entry.taxonomyItemId === "common-trusses",
    );
    assert.equal(commonTrusses?.status, "unaccounted");
    assert.equal(commonTrusses?.gapClass, "calculator_gap");
  });

  it("does not mark both ext and int plates calculated from unknown-location walls", () => {
    const construction = wallConstruction("unknown");
    const materials = calculateFramingTakeoff(construction).materials;
    assert.ok(materials.some((line) => line.quantityKey === "wall.plates"));
    const accounting = buildProductAccounting({
      projectId: "unknown-plates",
      construction,
      materials,
    });
    for (const itemId of [
      "ext-bottom-plates",
      "ext-double-top-plates",
      "int-bottom-plates",
      "int-double-top-plates",
      "ext-standard-studs",
      "int-studs",
    ] as const) {
      const entry = accounting.entries.find(
        (item) => item.taxonomyItemId === itemId,
      );
      assert.equal(entry?.status, "unaccounted", itemId);
      assert.equal(entry?.gapClass, "applicability_unestablished", itemId);
    }
  });

  it("matches exterior plate lines only to exterior taxonomy items", () => {
    const construction = wallConstruction("exterior");
    const materials = calculateFramingTakeoff(construction).materials;
    const accounting = buildProductAccounting({
      projectId: "ext-plates",
      construction,
      materials,
    });
    assert.equal(
      accounting.entries.find((entry) => entry.taxonomyItemId === "ext-bottom-plates")
        ?.status,
      "calculated",
    );
    assert.equal(
      accounting.entries.find(
        (entry) => entry.taxonomyItemId === "ext-double-top-plates",
      )?.status,
      "calculated",
    );
    assert.equal(
      accounting.entries.find((entry) => entry.taxonomyItemId === "int-bottom-plates")
        ?.gapClass,
      "applicability_unestablished",
    );
    assert.equal(
      accounting.entries.find(
        (entry) => entry.taxonomyItemId === "int-double-top-plates",
      )?.gapClass,
      "applicability_unestablished",
    );
  });

  it("scopes structural probes to the checklist subject's members", () => {
    const construction = emptyFramingConstruction();
    construction.structuralMembers.structuralMembers = [
      structuralMember({
        id: "SM-LVL",
        category: "header",
        materialType: "lvl",
        size: '(2)-1.75"x11.875" LVL',
        lengthFeet: 23.5,
        quantity: 1,
      }),
      structuralMember({
        id: "SM-POST",
        category: "post",
        materialType: null,
        size: "6x6",
        lengthFeet: null,
        quantity: null,
      }),
      structuralMember({
        id: "SM-MST",
        category: "unknown",
        materialType: null,
        size: null,
        lengthFeet: null,
        quantity: null,
      }),
    ];
    assert.equal(
      diagnoseInputGap(construction, "structural_members", [
        { kind: "has_structural_material", materials: ["lvl"] },
      ]),
      "calculator_gap",
    );
    assert.equal(
      diagnoseInputGap(construction, "structural_members", [
        { kind: "has_structural_category", categories: ["header"] },
      ]),
      "calculator_gap",
    );
    assert.equal(
      diagnoseInputGap(construction, "structural_members", [
        { kind: "has_structural_category", categories: ["post", "column"] },
      ]),
      "read_or_input_gap",
    );
    assert.equal(
      diagnoseInputGap(construction, "structural_members", [
        {
          kind: "has_structural_member",
          categories: ["beam", "girder"],
          materials: ["lvl"],
        },
      ]),
      "calculator_gap",
    );
    assert.equal(
      diagnoseInputGap(construction, "structural_members", [
        { kind: "has_header_opening_role", role: "interior-door" },
      ]),
      "calculator_gap",
    );
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

  it("does not credit a garage-door LVL header as interior doors or floor beams", () => {
    const construction = emptyFramingConstruction();
    construction.structuralMembers.structuralMembers = [
      structuralMember({
        id: "SM-LVL",
        category: "header",
        materialType: "lvl",
        size: '(2)-1.75"x11.875" LVL',
        lengthFeet: 23.5,
        quantity: 1,
        supportedObjectIds: ["O-GARAGE"],
      }),
    ];
    construction.openings.openings = [
      linkedHeaderOpening({
        openingId: "O-GARAGE",
        memberId: "SM-LVL",
        category: "garage-door",
        parentWallId: null,
      }),
    ];
    const { materials, byId } = accountingById(construction);
    assert.equal(
      materials.some(
        (line) =>
          line.sourceObjectIds.includes("SM-LVL") && line.unit === "linear-foot",
      ),
      true,
    );
    assert.equal(byId.lvl?.status, "calculated");
    assert.equal(byId["ext-headers"]?.status, "calculated");
    assert.equal(byId["int-door-headers"]?.status, "unaccounted");
    assert.equal(
      byId["int-door-headers"]?.gapClass,
      "applicability_unestablished",
    );
    assert.equal(byId["lvl-beams-floor"]?.status, "unaccounted");
    assert.equal(
      byId["lvl-beams-floor"]?.gapClass,
      "applicability_unestablished",
    );
  });

  it("credits an interior-door header to int-door-headers, not floor LVL beams", () => {
    const construction = wallConstruction("interior");
    construction.structuralMembers.structuralMembers = [
      structuralMember({
        id: "SM-INT-HDR",
        category: "header",
        materialType: "lvl",
        size: "1.75x11.875",
        lengthFeet: 6,
        quantity: 1,
        supportedObjectIds: ["O-INT-DOOR"],
      }),
    ];
    construction.openings.openings = [
      linkedHeaderOpening({
        openingId: "O-INT-DOOR",
        memberId: "SM-INT-HDR",
        category: "door",
        parentWallId: "W-001",
      }),
    ];
    const { byId } = accountingById(construction);
    assert.equal(byId["int-door-headers"]?.status, "calculated");
    assert.equal(byId.lvl?.status, "calculated");
    assert.equal(byId["lvl-beams-floor"]?.gapClass, "applicability_unestablished");
  });

  it("does not invent interior-door headers from unknown-location door headers", () => {
    const construction = wallConstruction("unknown");
    construction.structuralMembers.structuralMembers = [
      structuralMember({
        id: "SM-UNK-HDR",
        category: "header",
        materialType: "lvl",
        size: "1.75x11.875",
        lengthFeet: 6,
        quantity: 1,
        supportedObjectIds: ["O-UNK-DOOR"],
      }),
    ];
    construction.openings.openings = [
      linkedHeaderOpening({
        openingId: "O-UNK-DOOR",
        memberId: "SM-UNK-HDR",
        category: "door",
        parentWallId: "W-001",
      }),
    ];
    const { byId } = accountingById(construction);
    assert.equal(byId["int-door-headers"]?.status, "unaccounted");
    assert.equal(
      byId["int-door-headers"]?.gapClass,
      "applicability_unestablished",
    );
    assert.equal(byId["ext-headers"]?.status, "calculated");
    assert.equal(byId.lvl?.status, "calculated");
  });

  it("credits a floor LVL beam to lvl-beams-floor, not opening headers", () => {
    const construction = emptyFramingConstruction();
    construction.structuralMembers.structuralMembers = [
      structuralMember({
        id: "SM-FLOOR-LVL",
        category: "beam",
        materialType: "lvl",
        size: '5.25"x11.875" LVL',
        lengthFeet: 16,
        quantity: 1,
      }),
    ];
    const { byId } = accountingById(construction);
    assert.equal(byId.lvl?.status, "calculated");
    assert.equal(byId["lvl-beams-floor"]?.status, "calculated");
    assert.equal(byId["ext-headers"]?.gapClass, "applicability_unestablished");
    assert.equal(
      byId["int-door-headers"]?.gapClass,
      "applicability_unestablished",
    );
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
