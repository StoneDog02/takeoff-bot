import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFoundationInterface } from "../../src/framing/calculate/calculateFoundationInterface.js";
import { calculateFramingTakeoff } from "../../src/framing/calculate/calculateFramingTakeoff.js";
import { emptyFramingConstruction } from "../../src/framing/schemas/framingConstruction.schema.js";
import type { FoundationInterfacePayload } from "../../src/framing/schemas/framing-artifacts.schema.js";
import type { FoundationSillSegment } from "../../src/framing/schemas/foundation-sill.schema.js";
import {
  FOUNDATION_INTERFACE_QUANTITY_KEYS,
  HONESTY_RULE_IDS,
} from "../../src/framing/validators/rule-ids.js";

function resolvedTrace(
  propertyPath: string,
  method:
    | "explicit-project-value"
    | "approved-default"
    | "unresolved" = "explicit-project-value",
) {
  return {
    propertyPath,
    method,
    explanation: `${propertyPath} is resolved.`,
    assumptionIds: [],
  };
}

function buildSillSegment(
  id: string,
  overrides: Partial<FoundationSillSegment> = {},
): FoundationSillSegment {
  const segment: FoundationSillSegment = {
    id: id as import("../../src/core/schemas/identity.schema.js").ObjectId,
    objectType: "foundation-sill-segment",
    resolutionTraces: [
      resolvedTrace("lengthFeet"),
      resolvedTrace("material.size"),
      resolvedTrace("material.treatment"),
    ],
    lengthFeet: 20,
    supportType: "concrete-foundation",
    material: {
      size: "2x6",
      treatment: "pressure-treated",
      species: "SPF",
    },
    plateRole: "sill-only",
    parentWallId: null,
    ...overrides,
  };
  return segment;
}

function buildFoundationInterface(
  segments: FoundationSillSegment[] = [],
): FoundationInterfacePayload {
  return { sillSegments: segments };
}

describe("S4-FI-1 foundation sill LF calculation", () => {
  it("fixture 1: 20+12=32 install LF from two resolved sill segments", () => {
    const segment1 = buildSillSegment("SILL-001", { lengthFeet: 20 });
    const segment2 = buildSillSegment("SILL-002", { lengthFeet: 12 });
    const foundationInterface = buildFoundationInterface([segment1, segment2]);

    const result = calculateFoundationInterface(foundationInterface);

    assert.equal(result.materials.length, 2);
    const totalLF = result.materials.reduce((sum, line) => sum + line.quantity, 0);
    assert.equal(totalLF, 32, "20+12=32 install LF");

    const firstLine = result.materials.find((m) => m.sourceObjectIds.includes("SILL-001"));
    const secondLine = result.materials.find((m) => m.sourceObjectIds.includes("SILL-002"));
    assert.equal(firstLine?.quantity, 20);
    assert.equal(secondLine?.quantity, 12);
    assert.equal(firstLine?.unit, "linear-foot");
    assert.equal(secondLine?.unit, "linear-foot");
    assert.equal(
      firstLine?.quantityKey,
      FOUNDATION_INTERFACE_QUANTITY_KEYS.sillLF,
    );
  });

  it("fixture 2: no-invent from wall plates — sill LF comes from segments, not plateCount", () => {
    const construction = emptyFramingConstruction();
    construction.walls = {
      walls: [
        {
          id: "W-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
          objectType: "building-wall",
          resolutionTraces: [
            resolvedTrace("assembly.studSize"),
            resolvedTrace("assembly.heightFeet"),
            resolvedTrace("assembly.studSpacingInches"),
            resolvedTrace("assembly.plateCount"),
          ],
          name: "Exterior wall W-001",
          level: "Level 1",
          wallType: "exterior-wood-stud-wall",
          semanticTypeKey: null,
          bindingAuthorityGrade: null,
          location: "exterior",
          bearingStatus: "non-bearing",
          isShearOrBraced: false,
          fireRating: null,
          constructionPhase: "new",
          assembly: {
            material: "dimensional-lumber",
            studSize: "2x6",
            studSpacingInches: 16,
            heightFeet: 9,
            plateCount: 3,
            sheathing: null,
          },
          segmentIds: ["WS-001"],
        },
      ],
      segments: [
        {
          id: "WS-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
          objectType: "wall-segment",
          resolutionTraces: [resolvedTrace("lengthFeet")],
          parentWallId: "W-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
          lengthFeet: 40,
          openingIds: [],
        },
      ],
    };
    construction.foundationInterface = buildFoundationInterface([]);

    const result = calculateFramingTakeoff(construction);

    const sillLines = result.materials.filter(
      (line) => line.quantityKey === FOUNDATION_INTERFACE_QUANTITY_KEYS.sillLF,
    );
    assert.equal(sillLines.length, 0, "no sill LF lines minted from wall plateCount");

    const plateLine = result.materials.find((line) => line.quantityKey === "wall.plates");
    assert.ok(plateLine, "wall plates line still emits");
    assert.equal(plateLine.quantity, 120, "3 plates * 40 LF = 120 LF of wall plates");
  });

  it("fixture 3: dual-role segment shares physicalId with wall segment — wall plate lines unchanged", () => {
    const construction = emptyFramingConstruction();

    construction.walls = {
      walls: [
        {
          id: "W-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
          objectType: "building-wall",
          resolutionTraces: [
            resolvedTrace("assembly.studSize"),
            resolvedTrace("assembly.heightFeet"),
            resolvedTrace("assembly.studSpacingInches"),
            resolvedTrace("assembly.plateCount"),
          ],
          name: "Exterior wall W-001",
          level: "Level 1",
          wallType: "exterior-wood-stud-wall",
          semanticTypeKey: null,
          bindingAuthorityGrade: null,
          location: "exterior",
          bearingStatus: "non-bearing",
          isShearOrBraced: false,
          fireRating: null,
          constructionPhase: "new",
          assembly: {
            material: "dimensional-lumber",
            studSize: "2x6",
            studSpacingInches: 16,
            heightFeet: 9,
            plateCount: 3,
            sheathing: null,
          },
          segmentIds: ["WS-001"],
        },
      ],
      segments: [
        {
          id: "WS-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
          physicalId: "WS-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
          objectType: "wall-segment",
          resolutionTraces: [resolvedTrace("lengthFeet")],
          parentWallId: "W-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
          lengthFeet: 20,
          openingIds: [],
        },
      ],
    };

    const dualRoleSill = buildSillSegment("SILL-001", {
      lengthFeet: 20,
      plateRole: "dual-role-sill-and-bottom-plate",
      parentWallId: "W-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
      physicalId: "WS-001" as import("../../src/core/schemas/identity.schema.js").ObjectId,
    });
    construction.foundationInterface = buildFoundationInterface([dualRoleSill]);

    const result = calculateFramingTakeoff(construction);

    const sillLines = result.materials.filter(
      (line) => line.quantityKey === FOUNDATION_INTERFACE_QUANTITY_KEYS.sillLF,
    );
    assert.equal(sillLines.length, 1, "one sill LF line for dual-role segment");
    assert.equal(sillLines[0]?.quantity, 20);

    const plateLine = result.materials.find((line) => line.quantityKey === "wall.plates");
    assert.ok(plateLine, "wall plates line still emits (S5 handles dedup)");
    assert.equal(plateLine.quantity, 60, "3 plates * 20 LF = 60 LF wall plates unchanged");

    assert.equal(
      dualRoleSill.physicalId,
      construction.walls.segments[0]?.physicalId,
      "dual-role sill shares physicalId with wall segment",
    );
  });

  it("fixture 4: missing size → Unresolved", () => {
    const segmentMissingSize = buildSillSegment("SILL-003", {
      lengthFeet: 15,
      material: {
        size: null,
        treatment: "pressure-treated",
        species: "SPF",
      },
      resolutionTraces: [
        resolvedTrace("lengthFeet"),
        { propertyPath: "material.size", method: "unresolved", explanation: "size unresolved", assumptionIds: [] },
        resolvedTrace("material.treatment"),
      ],
    });

    const foundationInterface = buildFoundationInterface([segmentMissingSize]);

    const result = calculateFoundationInterface(foundationInterface);

    assert.equal(result.materials.length, 0, "no material line when size is missing");
    assert.equal(result.unresolved.length, 1, "one unresolved record for missing size");
    assert.equal(
      result.unresolved[0]?.reasonCode,
      HONESTY_RULE_IDS.foundationSillSizeUnresolved,
    );
    assert.equal(result.unresolved[0]?.propertyPath, "material.size");
    assert.match(
      result.unresolved[0]?.explanation ?? "",
      /no size is assumed from minimum/i,
    );
  });

  it("does not mint sill LF from unresolved length segments", () => {
    const segmentUnresolvedLength = buildSillSegment("SILL-004", {
      lengthFeet: null,
      resolutionTraces: [
        { propertyPath: "lengthFeet", method: "unresolved", explanation: "length unresolved", assumptionIds: [] },
        resolvedTrace("material.size"),
        resolvedTrace("material.treatment"),
      ],
    });

    const result = calculateFoundationInterface(
      buildFoundationInterface([segmentUnresolvedLength]),
    );

    assert.equal(result.materials.length, 0, "no material line when length is unresolved");
    assert.equal(result.unresolved.length, 0, "no unresolved for unresolved length (not a size missing error)");
  });

  it("correctly marks PT treatment in material description", () => {
    const ptSegment = buildSillSegment("SILL-005", {
      material: { size: "2x6", treatment: "pressure-treated", species: "SPF" },
    });

    const result = calculateFoundationInterface(buildFoundationInterface([ptSegment]));

    assert.equal(result.materials.length, 1);
    assert.match(result.materials[0]?.description ?? "", /PT/);
    assert.match(result.materials[0]?.material ?? "", /PT/);
    assert.match(result.materials[0]?.canonicalClassification ?? "", /-pt$/);
  });

  it("does not label untreated sill as PT", () => {
    const untreatedSegment = buildSillSegment("SILL-006", {
      material: { size: "2x4", treatment: "untreated", species: "SPF" },
    });

    const result = calculateFoundationInterface(buildFoundationInterface([untreatedSegment]));

    assert.equal(result.materials.length, 1);
    assert.equal(result.materials[0]?.description.includes("PT"), false);
    assert.equal(result.materials[0]?.canonicalClassification.includes("-pt"), false);
  });
});
