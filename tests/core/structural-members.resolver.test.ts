import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { calculateStructuralMembers } from "../../src/scopes/framing/calculators/calculateStructuralMembers.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { createStructuralMemberObjectId } from "../../src/scopes/framing/resolvers/ids.js";
import { resolveStructuralMembers } from "../../src/scopes/framing/resolvers/resolveStructuralMembers.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { STRUCTURAL_MEMBER_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";

const source = {
  page: {
    documentId: null,
    pageNumber: 1,
    sheetId: null,
    sheetTitle: null,
    pageLabel: null,
    revision: null,
  },
  region: null,
  elementLabel: "HDR-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function memberEvidence(
  subjectKey: string,
  overrides: Record<string, unknown>,
) {
  return evidenceSchema.parse({
    id: "E-MEMBER-PROP",
    type: "note",
    relationship: "supports",
    description: "Extracted structural member candidate.",
    source: {
      ...source,
      elementLabel: subjectKey,
    },
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "structural-member",
    subjectKey,
    propertyPath: "category",
    candidateValue: "header",
    ...overrides,
  });
}

function completeHeaderEvidence(subjectKey = "HDR-001", prefix = "E-HDR-001") {
  return [
    memberEvidence(subjectKey, {
      id: `${prefix}-CATEGORY`,
      propertyPath: "category",
      candidateValue: "header",
    }),
    memberEvidence(subjectKey, {
      id: `${prefix}-MATERIAL`,
      propertyPath: "materialType",
      candidateValue: "lvl",
    }),
    memberEvidence(subjectKey, {
      id: `${prefix}-SIZE`,
      propertyPath: "size",
      candidateValue: "1.75x11.875",
    }),
    memberEvidence(subjectKey, {
      id: `${prefix}-LENGTH`,
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 6,
    }),
    memberEvidence(subjectKey, {
      id: `${prefix}-QTY`,
      type: "dimension",
      propertyPath: "quantity",
      candidateValue: 1,
    }),
    memberEvidence(subjectKey, {
      id: `${prefix}-LOCATION`,
      propertyPath: "location",
      candidateValue: "over Window W-001 at Wall W-001",
    }),
  ];
}

function wallLengthEvidence(subjectKey: string, lengthFeet: number) {
  return evidenceSchema.parse({
    id: `E-${subjectKey}-GEOMETRY`,
    type: "dimension",
    relationship: "supports",
    description: "Wall length candidate.",
    source: {
      ...source,
      elementLabel: subjectKey,
    },
    originalText: `${subjectKey} length ${lengthFeet} ft`,
    references: [],
    subjectKind: "wall",
    subjectKey,
    propertyPath: "lengthFeet",
    candidateValue: lengthFeet,
  });
}

describe("resolveStructuralMembers", () => {
  it("resolves a complete single-piece header from explicit Evidence", () => {
    const payload = resolveStructuralMembers(completeHeaderEvidence());
    const member = payload.structuralMembers[0];

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(member?.id, "SM-HDR-001");
    assert.equal(member?.category, "header");
    assert.equal(member?.materialType, "lvl");
    assert.equal(member?.size, "1.75x11.875");
    assert.equal(member?.lengthFeet, 6);
    assert.equal(member?.quantity, 1);
    assert.equal(member?.location, "over Window W-001 at Wall W-001");
    assert.equal(member?.plyCount, null);
    assert.deepEqual(member?.associatedObjectIds, []);
    assert.deepEqual(member?.supportedObjectIds, []);
    assert.deepEqual(member?.supportingObjectIds, []);
    assert.deepEqual(member?.connectorIds, []);

    for (const propertyPath of [
      "category",
      "materialType",
      "size",
      "lengthFeet",
      "quantity",
      "location",
    ]) {
      const trace = member?.resolutionTraces.find(
        (entry) => entry.propertyPath === propertyPath,
      );
      assert.equal(trace?.method, "explicit-project-value");
      assert.deepEqual(trace?.assumptionIds, []);
    }
  });

  it("corroborates identical lengthFeet candidates from separate Evidence records", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "lengthFeet",
      ),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-LENGTH-A",
        type: "dimension",
        propertyPath: "lengthFeet",
        candidateValue: 6,
      }),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-LENGTH-B",
        type: "dimension",
        propertyPath: "lengthFeet",
        candidateValue: 6,
      }),
    ]);
    const trace = payload.structuralMembers[0]?.resolutionTraces.find(
      (entry) => entry.propertyPath === "lengthFeet",
    );

    assert.equal(payload.structuralMembers[0]?.lengthFeet, 6);
    assert.equal(trace?.method, "explicit-project-value");
    assert.match(trace?.explanation ?? "", /E\-HDR\-001\-LENGTH\-A/);
    assert.match(trace?.explanation ?? "", /E\-HDR\-001\-LENGTH\-B/);
  });

  it("preserves conflicting lengthFeet candidates as unresolved", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "lengthFeet",
      ),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-LENGTH-A",
        type: "dimension",
        propertyPath: "lengthFeet",
        candidateValue: 6,
      }),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-LENGTH-B",
        type: "dimension",
        propertyPath: "lengthFeet",
        candidateValue: 8,
      }),
    ]);
    const member = payload.structuralMembers[0];
    const trace = member?.resolutionTraces.find(
      (entry) => entry.propertyPath === "lengthFeet",
    );

    assert.equal(member?.lengthFeet, null);
    assert.equal(trace?.method, "unresolved");
  });

  it("does not normalize category casing or abbreviations", () => {
    const withHeader = resolveStructuralMembers([
      ...completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "category",
      ),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-CATEGORY",
        propertyPath: "category",
        candidateValue: "Header",
      }),
    ]);
    const withHdr = resolveStructuralMembers([
      ...completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "category",
      ),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-CATEGORY",
        propertyPath: "category",
        candidateValue: "HDR",
      }),
    ]);

    assert.equal(withHeader.structuralMembers[0]?.category, "unknown");
    assert.equal(withHdr.structuralMembers[0]?.category, "unknown");
  });

  it("preserves a member with missing quantity as null", () => {
    const payload = resolveStructuralMembers(
      completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "quantity",
      ),
    );
    const member = payload.structuralMembers[0];

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(member?.id, "SM-HDR-001");
    assert.equal(member?.category, "header");
    assert.equal(member?.materialType, "lvl");
    assert.equal(member?.size, "1.75x11.875");
    assert.equal(member?.lengthFeet, 6);
    assert.equal(member?.quantity, null);
    assert.equal(member?.location, "over Window W-001 at Wall W-001");
    assert.equal(
      member?.resolutionTraces.some((trace) => trace.propertyPath === "quantity"),
      false,
    );
  });

  it("preserves a member with conflicting quantity as null and unresolved trace", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "quantity",
      ),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-QTY-A",
        propertyPath: "quantity",
        candidateValue: 1,
      }),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-QTY-B",
        propertyPath: "quantity",
        candidateValue: 2,
      }),
    ]);
    const member = payload.structuralMembers[0];
    const trace = member?.resolutionTraces.find(
      (entry) => entry.propertyPath === "quantity",
    );

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(member?.quantity, null);
    assert.equal(member?.category, "header");
    assert.equal(member?.materialType, "lvl");
    assert.equal(member?.lengthFeet, 6);
    assert.equal(trace?.method, "unresolved");
  });

  it("preserves a member with missing location as null", () => {
    const payload = resolveStructuralMembers(
      completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "location",
      ),
    );
    const member = payload.structuralMembers[0];

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(member?.location, null);
    assert.equal(member?.quantity, 1);
    assert.equal(member?.category, "header");
    assert.equal(
      member?.resolutionTraces.some((trace) => trace.propertyPath === "location"),
      false,
    );
  });

  it("preserves a member with conflicting location as null and unresolved trace", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "location",
      ),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-LOCATION-A",
        propertyPath: "location",
        candidateValue: "over Window W-001 at Wall W-001",
      }),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-LOCATION-B",
        propertyPath: "location",
        candidateValue: "over Door D-001",
      }),
    ]);
    const member = payload.structuralMembers[0];
    const trace = member?.resolutionTraces.find(
      (entry) => entry.propertyPath === "location",
    );

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(member?.location, null);
    assert.equal(member?.quantity, 1);
    assert.equal(member?.lengthFeet, 6);
    assert.equal(trace?.method, "unresolved");
  });

  it("ignores wall Evidence when resolving structural members", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence(),
      wallLengthEvidence("W-001", 20),
    ]);

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(payload.structuralMembers[0]?.id, "SM-HDR-001");
    assert.equal(
      payload.structuralMembers.some((member) => member.id === "W-001"),
      false,
    );
  });

  it("does not let wall lengthFeet contaminate a structural member", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence().filter(
        (record) => record.propertyPath !== "lengthFeet",
      ),
      wallLengthEvidence("HDR-001", 20),
      memberEvidence("HDR-001", {
        id: "E-HDR-001-LENGTH",
        type: "dimension",
        propertyPath: "lengthFeet",
        candidateValue: 6,
      }),
    ]);

    assert.equal(payload.structuralMembers[0]?.lengthFeet, 6);
  });

  it("resolves structural-member B1 separately from wall B1", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence("B1", "E-B1"),
      wallLengthEvidence("B1", 20),
    ]);

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(payload.structuralMembers[0]?.id, "SM-B1");
    assert.equal(payload.structuralMembers[0]?.lengthFeet, 6);
  });

  it("leaves resolveWallFraming unchanged when structural-member Evidence is present", () => {
    const walls = resolveWallFraming([
      wallLengthEvidence("W-001", 20),
      ...completeHeaderEvidence(),
    ]);

    assert.equal(walls.walls.length, 1);
    assert.equal(walls.segments[0]?.id, "WS-001");
  });

  it("returns deterministic output regardless of Evidence input order", () => {
    const evidence = completeHeaderEvidence();
    assert.deepEqual(
      resolveStructuralMembers(evidence),
      resolveStructuralMembers([...evidence].reverse()),
    );
  });

  it("sorts members by ObjectId deterministically", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence("HDR-002", "E-HDR-002"),
      ...completeHeaderEvidence("HDR-001", "E-HDR-001"),
    ]);

    assert.deepEqual(
      payload.structuralMembers.map((member) => member.id),
      ["SM-HDR-001", "SM-HDR-002"],
    );
  });

  it("converges subjectKeys that mint the same ObjectId into one member", () => {
    const payload = resolveStructuralMembers([
      ...completeHeaderEvidence("HDR 001", "E-HDR-A"),
      ...completeHeaderEvidence("HDR-001", "E-HDR-B"),
    ]);

    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(payload.structuralMembers[0]?.id, "SM-HDR-001");
    assert.ok(
      payload.structuralMembers[0]?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "subjectKey" &&
          trace.explanation.includes("HDR 001") &&
          trace.explanation.includes("HDR-001"),
      ),
    );
  });

  it("does not mutate input Evidence", () => {
    const evidence = completeHeaderEvidence();
    const snapshot = structuredClone(evidence);
    resolveStructuralMembers(evidence);
    assert.deepEqual(evidence, snapshot);
  });

  describe("calculator ownership for partially resolved members", () => {
    it("blocks material calculation when quantity is missing or conflicted", () => {
      const missingQuantity = resolveStructuralMembers(
        completeHeaderEvidence().filter(
          (record) => record.propertyPath !== "quantity",
        ),
      );
      const conflictingQuantity = resolveStructuralMembers([
        ...completeHeaderEvidence().filter(
          (record) => record.propertyPath !== "quantity",
        ),
        memberEvidence("HDR-001", {
          id: "E-HDR-001-QTY-A",
          propertyPath: "quantity",
          candidateValue: 1,
        }),
        memberEvidence("HDR-001", {
          id: "E-HDR-001-QTY-B",
          propertyPath: "quantity",
          candidateValue: 2,
        }),
      ]);

      assert.equal(calculateStructuralMembers(missingQuantity).length, 0);
      assert.equal(calculateStructuralMembers(conflictingQuantity).length, 0);
    });

    it("calculates only resolved members in a mixed quantity payload", () => {
      const payload = resolveStructuralMembers([
        ...completeHeaderEvidence("HDR-001", "E-HDR-001"),
        ...completeHeaderEvidence("HDR-002", "E-HDR-002").filter(
          (record) => record.propertyPath !== "quantity",
        ),
      ]);
      const materials = calculateStructuralMembers(payload);

      assert.equal(materials.length, 1);
      assert.equal(materials[0]?.sourceObjectIds[0], "SM-HDR-001");
      assert.equal(materials[0]?.quantity, 6);
    });

    it("still calculates material LF when only location is missing or conflicted", () => {
      const missingLocation = resolveStructuralMembers(
        completeHeaderEvidence().filter(
          (record) => record.propertyPath !== "location",
        ),
      );
      const conflictingLocation = resolveStructuralMembers([
        ...completeHeaderEvidence().filter(
          (record) => record.propertyPath !== "location",
        ),
        memberEvidence("HDR-001", {
          id: "E-HDR-001-LOCATION-A",
          propertyPath: "location",
          candidateValue: "over Window W-001 at Wall W-001",
        }),
        memberEvidence("HDR-001", {
          id: "E-HDR-001-LOCATION-B",
          propertyPath: "location",
          candidateValue: "over Door D-001",
        }),
      ]);

      const missingMaterials = calculateStructuralMembers(missingLocation);
      const conflictingMaterials = calculateStructuralMembers(conflictingLocation);

      assert.equal(missingMaterials.length, 1);
      assert.equal(missingMaterials[0]?.quantity, 6);
      assert.equal(conflictingMaterials.length, 1);
      assert.equal(conflictingMaterials[0]?.quantity, 6);
    });
  });

  it("calculates material for a resolved header", () => {
    const payload = resolveStructuralMembers(completeHeaderEvidence());
    const materials = calculateStructuralMembers(payload);

    assert.equal(materials.length, 1);
    assert.equal(
      materials[0]?.id,
      createMaterialLineItemId(
        STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
        "SM-HDR-001",
      ),
    );
    assert.equal(materials[0]?.quantity, 6);
    assert.equal(materials[0]?.unit, "linear-foot");
    assert.equal(materials[0]?.category, "engineered-wood");
    assert.equal(
      materials[0]?.canonicalClassification,
      "header-lvl-1.75x11.875",
    );
  });
});

describe("createStructuralMemberObjectId", () => {
  it("maps HDR-001 to SM-HDR-001", () => {
    assert.equal(createStructuralMemberObjectId("HDR-001"), "SM-HDR-001");
  });
});
