import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { wallFramingPayloadSchema } from "../../src/framing/schemas/framing-artifacts.schema.js";
import {
  createWallObjectId,
  createWallSegmentObjectId,
} from "../../src/framing/resolve/ids.js";
import { resolveWallFraming } from "../../src/framing/resolve/resolveWallFraming.js";
import { WALL_QUANTITY_KEYS } from "../../src/framing/validators/rule-ids.js";
import { calculateWallFraming } from "../../src/framing/calculate/calculateWallFraming.js";
import { createMaterialLineItemId } from "../../src/framing/calculate/ids.js";

const source = {
  page: {
    documentId: null,
    pageNumber: 2,
    sheetId: "A2.01",
    sheetTitle: "Floor Plan - Level 1",
    pageLabel: "Floor Plan - Level 1",
    revision: null,
  },
  region: null,
  elementLabel: "W-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function evidence(
  overrides: Record<string, unknown>,
) {
  return evidenceSchema.parse({
    id: "E-W001-PROP",
    type: "note",
    relationship: "supports",
    description: "Extracted candidate.",
    source,
    originalText: "Wall W-001 fixture line",
    references: [],
    subjectKind: "wall" as const,
    subjectKey: "W-001",
    propertyPath: "wallType",
    candidateValue: "wood stud wall",
    ...overrides,
  });
}

function completeWallEvidence() {
  return [
    evidence({
      id: "E-W001-CLASS",
      propertyPath: "wallType",
      candidateValue: "wood stud wall",
    }),
    evidence({
      id: "E-W001-LOCATION",
      propertyPath: "location",
      candidateValue: "exterior",
    }),
    evidence({
      id: "E-W001-BEARING",
      propertyPath: "bearingStatus",
      candidateValue: "non-bearing",
    }),
    evidence({
      id: "E-W001-SHEAR",
      propertyPath: "isShearOrBraced",
      candidateValue: false,
    }),
    evidence({
      id: "E-W001-RATING",
      propertyPath: "fireRating",
      candidateValue: "1 hour",
    }),
    evidence({
      id: "E-W001-PHASE",
      propertyPath: "constructionPhase",
      candidateValue: "new",
    }),
    evidence({
      id: "E-W001-MATERIAL",
      propertyPath: "assembly.material",
      candidateValue: "dimensional lumber",
    }),
    evidence({
      id: "E-W001-FRAMING",
      propertyPath: "assembly.studSize",
      candidateValue: "2x4",
    }),
    evidence({
      id: "E-W001-SPACING",
      type: "dimension",
      propertyPath: "assembly.studSpacingInches",
      candidateValue: 16,
    }),
    evidence({
      id: "E-W001-HEIGHT",
      type: "dimension",
      propertyPath: "assembly.heightFeet",
      candidateValue: 8,
    }),
    evidence({
      id: "E-W001-PLATES",
      propertyPath: "assembly.plateCount",
      candidateValue: 3,
    }),
    evidence({
      id: "E-W001-SHEATHING",
      propertyPath: "assembly.sheathing",
      candidateValue: "7/16 OSB",
    }),
    evidence({
      id: "E-W001-GEOMETRY",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 20,
    }),
  ];
}

function evidenceForSubject(
  subjectKey: string,
  overrides: Record<string, unknown>,
) {
  return evidenceSchema.parse({
    id: "E-PROP",
    type: "note",
    relationship: "supports",
    description: "Extracted candidate.",
    source: {
      ...source,
      elementLabel: subjectKey,
    },
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "wall" as const,
    subjectKey,
    propertyPath: "wallType",
    candidateValue: "wood stud wall",
    ...overrides,
  });
}

function completeWallEvidenceForSubject(subjectKey: string, prefix: string) {
  return [
    evidenceForSubject(subjectKey, {
      id: `${prefix}-CLASS`,
      propertyPath: "wallType",
      candidateValue: "wood stud wall",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-FRAMING`,
      propertyPath: "assembly.studSize",
      candidateValue: subjectKey === "W-002" ? "2x6" : "2x4",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-SPACING`,
      type: "dimension",
      propertyPath: "assembly.studSpacingInches",
      candidateValue: subjectKey === "W-002" ? 24 : 16,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-HEIGHT`,
      type: "dimension",
      propertyPath: "assembly.heightFeet",
      candidateValue: subjectKey === "W-002" ? 9 : 8,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-PLATES`,
      propertyPath: "assembly.plateCount",
      candidateValue: subjectKey === "W-002" ? 2 : 3,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-GEOMETRY`,
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: subjectKey === "W-002" ? 12 : 20,
    }),
  ];
}

function completeTwoWallEvidence() {
  return [
    ...completeWallEvidenceForSubject("W-001", "E-W001"),
    ...completeWallEvidenceForSubject("W-002", "E-W002"),
  ];
}

describe("resolveWallFraming", () => {
  it("resolves complete one-wall evidence into a valid Wall and Segment", () => {
    const payload = resolveWallFraming(completeWallEvidence());
    const parsed = wallFramingPayloadSchema.parse(payload);

    assert.equal(parsed.walls.length, 1);
    assert.equal(parsed.segments.length, 1);

    const wall = parsed.walls[0]!;
    const segment = parsed.segments[0]!;

    assert.equal(wall.wallType, "wood stud wall");
    assert.equal(wall.location, "exterior");
    assert.equal(wall.bearingStatus, "non-bearing");
    assert.equal(wall.isShearOrBraced, false);
    assert.equal(wall.fireRating, "1 hour");
    assert.equal(wall.constructionPhase, "new");
    assert.equal(wall.assembly.studSize, "2x4");
    assert.equal(wall.assembly.studSpacingInches, 16);
    assert.equal(wall.assembly.heightFeet, 8);
    assert.equal(wall.assembly.plateCount, 3);
    assert.equal(wall.assembly.material, "dimensional lumber");
    assert.equal(wall.assembly.sheathing, "7/16 OSB");
    assert.equal(segment.lengthFeet, 20);
    assert.equal("lengthFeet" in wall, false);
  });

  it("assigns deterministic Wall and Segment ObjectIds from the subject key", () => {
    const payload = resolveWallFraming(completeWallEvidence());

    assert.equal(payload.walls[0]?.id, "W-001");
    assert.equal(payload.segments[0]?.id, "WS-001");
    assert.equal(createWallObjectId("W-001"), "W-001");
    assert.equal(
      createWallSegmentObjectId(createWallObjectId("W-001")),
      "WS-001",
    );
  });

  it("returns identical output for identical input", () => {
    const input = completeWallEvidence();

    assert.deepEqual(resolveWallFraming(input), resolveWallFraming(input));
  });

  it("resolves a property from exactly one usable candidate", () => {
    const payload = resolveWallFraming([
      evidence({
        id: "E-W001-SIZE",
        propertyPath: "assembly.studSize",
        candidateValue: "2x4",
      }),
    ]);

    assert.equal(payload.walls[0]?.assembly.studSize, "2x4");
    const trace = payload.walls[0]?.resolutionTraces.find(
      (entry) => entry.propertyPath === "assembly.studSize",
    );
    assert.equal(trace?.method, "explicit-project-value");
    assert.match(trace?.explanation ?? "", /E\-W001\-SIZE/);
  });

  it("resolves identical candidates and preserves every supporting Evidence ID", () => {
    const payload = resolveWallFraming([
      evidence({
        id: "E-W001-SPACING-SCHEDULE",
        type: "schedule",
        propertyPath: "assembly.studSpacingInches",
        candidateValue: 16,
      }),
      evidence({
        id: "E-W001-SPACING-NOTE",
        type: "note",
        propertyPath: "assembly.studSpacingInches",
        candidateValue: 16,
      }),
    ]);

    assert.equal(payload.walls[0]?.assembly.studSpacingInches, 16);
    const trace = payload.walls[0]?.resolutionTraces.find(
      (entry) => entry.propertyPath === "assembly.studSpacingInches",
    );
    assert.equal(trace?.method, "explicit-project-value");
    assert.match(trace?.explanation ?? "", /E\-W001\-SPACING\-NOTE/);
    assert.match(trace?.explanation ?? "", /E\-W001\-SPACING\-SCHEDULE/);
  });

  it("leaves conflicting candidates unresolved without choosing a winner", () => {
    const payload = resolveWallFraming([
      evidence({
        id: "E-W001-SPACING-SCHEDULE",
        type: "schedule",
        propertyPath: "assembly.studSpacingInches",
        candidateValue: 16,
      }),
      evidence({
        id: "E-W001-SPACING-NOTE",
        type: "note",
        propertyPath: "assembly.studSpacingInches",
        candidateValue: 24,
      }),
    ]);

    assert.equal(payload.walls[0]?.assembly.studSpacingInches, null);
    const trace = payload.walls[0]?.resolutionTraces.find(
      (entry) => entry.propertyPath === "assembly.studSpacingInches",
    );
    assert.equal(trace?.method, "unresolved");
    assert.match(trace?.explanation ?? "", /does not apply precedence/);
  });

  it("leaves missing properties nullable or unknown instead of guessing", () => {
    const payload = resolveWallFraming([
      evidence({
        id: "E-W001-CLASS",
        propertyPath: "wallType",
        candidateValue: "wood stud wall",
      }),
    ]);

    const wall = payload.walls[0]!;
    assert.equal(wall.wallType, "wood stud wall");
    assert.equal(wall.location, "unknown");
    assert.equal(wall.bearingStatus, "unknown");
    assert.equal(wall.constructionPhase, "unknown");
    assert.equal(wall.isShearOrBraced, null);
    assert.equal(wall.fireRating, null);
    assert.equal(wall.level, null);
    assert.equal(wall.assembly.studSize, null);
    assert.equal(wall.assembly.studSpacingInches, null);
    assert.equal(wall.assembly.heightFeet, null);
    assert.equal(wall.assembly.plateCount, null);
    assert.equal(wall.assembly.material, null);
    assert.equal(wall.assembly.sheathing, null);
    assert.equal(payload.segments[0]?.lengthFeet, null);
    assert.equal(
      wall.resolutionTraces.some(
        (entry) => entry.method === "approved-default",
      ),
      false,
    );
  });

  it("does not coerce free-text into closed construction enums", () => {
    const payload = resolveWallFraming([
      evidence({
        id: "E-W001-LOCATION",
        propertyPath: "location",
        candidateValue: "Exterior",
      }),
      evidence({
        id: "E-W001-CLASS",
        propertyPath: "wallType",
        candidateValue: "wood stud wall",
      }),
    ]);

    assert.equal(payload.walls[0]?.location, "unknown");
    assert.equal(payload.walls[0]?.wallType, "wood stud wall");
  });

  it("resolves lengthFeet onto the Segment, not the Wall", () => {
    const payload = resolveWallFraming([
      evidence({
        id: "E-W001-GEOMETRY",
        type: "dimension",
        propertyPath: "lengthFeet",
        candidateValue: 20,
      }),
    ]);

    assert.equal(payload.segments[0]?.lengthFeet, 20);
    assert.equal(
      payload.walls[0]?.resolutionTraces.some(
        (entry) => entry.propertyPath === "lengthFeet",
      ),
      false,
    );
    assert.equal(
      payload.segments[0]?.resolutionTraces[0]?.propertyPath,
      "lengthFeet",
    );
  });

  it("keeps Wall and Segment IDs consistent", () => {
    const payload = resolveWallFraming(completeWallEvidence());
    const wall = payload.walls[0]!;
    const segment = payload.segments[0]!;

    assert.deepEqual(wall.segmentIds, [segment.id]);
    assert.equal(segment.parentWallId, wall.id);
  });

  it("does not attach assumption ids on resolution traces", () => {
    const payload = resolveWallFraming(completeWallEvidence());
    const wall = payload.walls[0]!;
    const segment = payload.segments[0]!;

    assert.equal(
      [...wall.resolutionTraces, ...segment.resolutionTraces].every(
        (trace) => trace.assumptionIds.length === 0,
      ),
      true,
    );
    assert.equal("validationIssues" in payload, false);
    assert.equal("reviewItems" in payload, false);
  });

  it("parses output through the WallFramingPayload schema", () => {
    const payload = resolveWallFraming(completeWallEvidence());
    assert.deepEqual(wallFramingPayloadSchema.parse(payload), payload);
  });

  it("does not attach resolved traces to properties that remain missing", () => {
    const payload = resolveWallFraming([
      evidence({
        id: "E-W001-CLASS",
        propertyPath: "wallType",
        candidateValue: "wood stud wall",
      }),
    ]);

    assert.deepEqual(
      payload.walls[0]?.resolutionTraces.map((trace) => trace.propertyPath),
      ["wallType"],
    );
  });

  it("returns empty walls and segments for empty Evidence", () => {
    const payload = resolveWallFraming([]);

    assert.deepEqual(payload.walls, []);
    assert.deepEqual(payload.segments, []);
    assert.deepEqual(wallFramingPayloadSchema.parse(payload), payload);
  });

  describe("multi-wall resolution", () => {
    it("resolves two complete walls independently", () => {
      const payload = resolveWallFraming(completeTwoWallEvidence());
      const parsed = wallFramingPayloadSchema.parse(payload);

      assert.equal(parsed.walls.length, 2);
      assert.equal(parsed.segments.length, 2);

      const wall001 = parsed.walls.find((wall) => wall.id === "W-001");
      const wall002 = parsed.walls.find((wall) => wall.id === "W-002");
      const segment001 = parsed.segments.find((segment) => segment.id === "WS-001");
      const segment002 = parsed.segments.find((segment) => segment.id === "WS-002");

      assert.ok(wall001);
      assert.ok(wall002);
      assert.ok(segment001);
      assert.ok(segment002);

      assert.equal(wall001.assembly.studSize, "2x4");
      assert.equal(wall001.assembly.studSpacingInches, 16);
      assert.equal(wall001.assembly.heightFeet, 8);
      assert.equal(wall001.assembly.plateCount, 3);
      assert.equal(segment001.lengthFeet, 20);

      assert.equal(wall002.assembly.studSize, "2x6");
      assert.equal(wall002.assembly.studSpacingInches, 24);
      assert.equal(wall002.assembly.heightFeet, 9);
      assert.equal(wall002.assembly.plateCount, 2);
      assert.equal(segment002.lengthFeet, 12);
    });

    it("assigns deterministic Wall and Segment ObjectIds for each subject key", () => {
      const payload = resolveWallFraming(completeTwoWallEvidence());

      assert.deepEqual(
        payload.walls.map((wall) => wall.id),
        ["W-001", "W-002"],
      );
      assert.deepEqual(
        payload.segments.map((segment) => segment.id),
        ["WS-001", "WS-002"],
      );
      assert.equal(createWallObjectId("W-002"), "W-002");
      assert.equal(
        createWallSegmentObjectId(createWallObjectId("W-002")),
        "WS-002",
      );
    });

    it("does not cross-contaminate the same property path across subject keys", () => {
      const payload = resolveWallFraming([
        evidenceForSubject("W-001", {
          id: "E-W001-SIZE",
          propertyPath: "assembly.studSize",
          candidateValue: "2x4",
        }),
        evidenceForSubject("W-002", {
          id: "E-W002-SIZE",
          propertyPath: "assembly.studSize",
          candidateValue: "2x6",
        }),
      ]);

      assert.equal(payload.walls[0]?.assembly.studSize, "2x4");
      assert.equal(payload.walls[1]?.assembly.studSize, "2x6");
    });

    it("isolates conflicting lengthFeet on W-002 while W-001 resolves normally", () => {
      const payload = resolveWallFraming([
        evidenceForSubject("W-001", {
          id: "E-W001-GEOMETRY",
          type: "dimension",
          propertyPath: "lengthFeet",
          candidateValue: 20,
        }),
        evidenceForSubject("W-002", {
          id: "E-W002-GEOMETRY-A",
          type: "dimension",
          propertyPath: "lengthFeet",
          candidateValue: 12,
        }),
        evidenceForSubject("W-002", {
          id: "E-W002-GEOMETRY-B",
          type: "dimension",
          propertyPath: "lengthFeet",
          candidateValue: 14,
        }),
      ]);

      const segment001 = payload.segments.find((segment) => segment.id === "WS-001");
      const segment002 = payload.segments.find((segment) => segment.id === "WS-002");

      assert.equal(segment001?.lengthFeet, 20);
      assert.equal(segment002?.lengthFeet, null);

      const trace001 = segment001?.resolutionTraces.find(
        (entry) => entry.propertyPath === "lengthFeet",
      );
      const trace002 = segment002?.resolutionTraces.find(
        (entry) => entry.propertyPath === "lengthFeet",
      );

      assert.equal(trace001?.method, "explicit-project-value");
      assert.match(trace001?.explanation ?? "", /E\-W001\-GEOMETRY/);
      assert.equal(trace002?.method, "unresolved");
      assert.match(trace002?.explanation ?? "", /does not apply precedence/);
    });

    it("resolves identical candidates within one subject and preserves supporting Evidence IDs", () => {
      const payload = resolveWallFraming([
        evidenceForSubject("W-002", {
          id: "E-W002-SPACING-SCHEDULE",
          type: "schedule",
          propertyPath: "assembly.studSpacingInches",
          candidateValue: 24,
        }),
        evidenceForSubject("W-002", {
          id: "E-W002-SPACING-NOTE",
          type: "note",
          propertyPath: "assembly.studSpacingInches",
          candidateValue: 24,
        }),
      ]);

      const wall002 = payload.walls.find((wall) => wall.id === "W-002");
      assert.equal(wall002?.assembly.studSpacingInches, 24);
      const trace = wall002?.resolutionTraces.find(
        (entry) => entry.propertyPath === "assembly.studSpacingInches",
      );
      assert.equal(trace?.method, "explicit-project-value");
      assert.match(trace?.explanation ?? "", /E\-W002\-SPACING\-NOTE/);
      assert.match(trace?.explanation ?? "", /E\-W002\-SPACING\-SCHEDULE/);
    });

    it("returns deterministic output ordering regardless of input Evidence order", () => {
      const ordered = completeTwoWallEvidence();
      const reversed = [...ordered].reverse();

      const orderedPayload = resolveWallFraming(ordered);
      const reversedPayload = resolveWallFraming(reversed);

      assert.deepEqual(orderedPayload, reversedPayload);
      assert.deepEqual(
        orderedPayload.walls.map((wall) => wall.id),
        ["W-001", "W-002"],
      );
      assert.deepEqual(
        orderedPayload.segments.map((segment) => segment.id),
        ["WS-001", "WS-002"],
      );
    });

    it("converges subjectKeys that mint the same ObjectId into one wall", () => {
      const payload = resolveWallFraming([
        evidenceForSubject("W-001", {
          id: "E-W001-CLASS",
          propertyPath: "wallType",
          candidateValue: "wood stud wall",
        }),
        evidenceForSubject("W 001", {
          id: "E-W001-SPACE-CLASS",
          propertyPath: "location",
          candidateValue: "exterior",
        }),
      ]);

      assert.equal(payload.walls.length, 1);
      assert.equal(payload.segments.length, 1);
      assert.equal(payload.walls[0]?.id, "W-001");
      assert.equal(payload.walls[0]?.wallType, "wood stud wall");
      assert.equal(payload.walls[0]?.location, "exterior");
      assert.ok(
        payload.walls[0]?.resolutionTraces.some(
          (trace) =>
            trace.propertyPath === "subjectKey" &&
            trace.explanation.includes("W 001") &&
            trace.explanation.includes("W-001"),
        ),
      );
    });

    it("keeps W-001 and Wall W-001 as separate subjects", () => {
      const payload = resolveWallFraming([
        evidenceForSubject("W-001", {
          id: "E-W001-GEOMETRY",
          type: "dimension",
          propertyPath: "lengthFeet",
          candidateValue: 20,
        }),
        evidenceForSubject("Wall W-001", {
          id: "E-WALL-W001-GEOMETRY",
          type: "dimension",
          propertyPath: "lengthFeet",
          candidateValue: 12,
        }),
      ]);

      assert.equal(payload.walls.length, 2);
      assert.equal(payload.segments.length, 2);

      const wall001 = payload.walls.find((wall) => wall.id === "W-001");
      const wallLabel = payload.walls.find((wall) => wall.id === "Wall-W-001");
      const segment001 = payload.segments.find((segment) => segment.id === "WS-001");
      const segmentLabel = payload.segments.find(
        (segment) => segment.id === "WS-Wall-W-001",
      );

      assert.ok(wall001);
      assert.ok(wallLabel);
      assert.ok(segment001);
      assert.ok(segmentLabel);
      assert.equal(segment001.lengthFeet, 20);
      assert.equal(segmentLabel.lengthFeet, 12);
      assert.equal(wall001.name, "W-001");
      assert.equal(wallLabel.name, "Wall W-001");
    });

    it("does not attach assumption ids on multi-wall resolution traces", () => {
      const payload = resolveWallFraming(completeTwoWallEvidence());

      for (const object of [...payload.walls, ...payload.segments]) {
        assert.equal(
          object.resolutionTraces.every(
            (trace) => trace.assumptionIds.length === 0,
          ),
          true,
        );
      }

      assert.equal("validationIssues" in payload, false);
      assert.equal("reviewItems" in payload, false);
    });

    it("calculates independent outputs for two resolved walls", () => {
      const payload = resolveWallFraming(completeTwoWallEvidence());
      const materials = calculateWallFraming(payload);

      const stud001 = materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
      );
      const stud002 = materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-002"),
      );
      const plate001 = materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
      );
      const plate002 = materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-002"),
      );

      assert.equal(stud001?.quantity, 16);
      assert.equal(plate001?.quantity, 60);
      assert.equal(stud002?.quantity, 7);
      assert.equal(plate002?.quantity, 24);
      assert.equal(materials.length, 4);
    });
  });

  describe("evidence subjectKind domain isolation", () => {
    function structuralMemberPlaceholder(
      subjectKey: string,
      overrides: Record<string, unknown> = {},
    ) {
      return evidenceSchema.parse({
        id: "E-MEMBER-LENGTH",
        type: "dimension",
        relationship: "supports",
        description: "Structural member length placeholder.",
        source,
        originalText: `${subjectKey} member length placeholder`,
        references: [],
        subjectKind: "structural-member",
        subjectKey,
        propertyPath: "lengthFeet",
        candidateValue: 6,
        ...overrides,
      });
    }

    it("ignores structural-member Evidence when resolving walls", () => {
      const payload = resolveWallFraming([
        ...completeWallEvidence(),
        structuralMemberPlaceholder("HDR-001"),
      ]);

      assert.equal(payload.walls.length, 1);
      assert.equal(payload.segments.length, 1);
      assert.equal(payload.walls[0]?.id, "W-001");
      assert.equal(payload.segments[0]?.id, "WS-001");
      assert.equal(payload.segments[0]?.lengthFeet, 20);
      assert.equal(
        payload.walls.some((wall) => wall.id === "HDR-001"),
        false,
      );
      assert.equal(
        payload.segments.some((segment) => segment.id === "WS-HDR-001"),
        false,
      );
    });

    it("does not let structural-member lengthFeet contaminate a wall segment", () => {
      const payload = resolveWallFraming([
        evidence({
          id: "E-W001-GEOMETRY",
          type: "dimension",
          propertyPath: "lengthFeet",
          candidateValue: 20,
        }),
        structuralMemberPlaceholder("HDR-001", { candidateValue: 6 }),
      ]);

      assert.equal(payload.segments[0]?.lengthFeet, 20);
      assert.equal(
        payload.segments[0]?.resolutionTraces.find(
          (trace) => trace.propertyPath === "lengthFeet",
        )?.explanation.includes("E-MEMBER-LENGTH"),
        false,
      );
    });

    it("resolves wall-domain B1 separately from structural-member B1", () => {
      const payload = resolveWallFraming([
        ...completeWallEvidenceForSubject("B1", "E-B1").map((record) =>
          evidenceSchema.parse(record),
        ),
        structuralMemberPlaceholder("B1", {
          id: "E-B1-MEMBER-LENGTH",
          candidateValue: 6,
        }),
      ]);

      assert.equal(payload.walls.length, 1);
      assert.equal(payload.segments.length, 1);
      assert.equal(payload.walls[0]?.id, "B1");
      assert.equal(payload.segments[0]?.id, "WS-B1");
      assert.equal(payload.segments[0]?.lengthFeet, 20);
      assert.equal(payload.walls[0]?.assembly.studSize, "2x4");
    });
  });
});
