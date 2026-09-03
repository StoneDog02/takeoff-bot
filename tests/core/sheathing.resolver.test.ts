import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { resolveSheathing } from "../../src/framing/resolve/resolveSheathing.js";
import { buildSheathingEvidenceForWall001 } from "../../src/framing/demo/multiObjectFramingEvidence.js";

function sheathingEvidence(
  subjectKind: "sheathing-system" | "sheathing-area",
  subjectKey: string,
  id: string,
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
        pageNumber: 1,
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
    originalText: `${subjectKey} ${propertyPath}`,
    references: [],
    subjectKind,
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

describe("resolveSheathing", () => {
  it("resolves a complete wall sheathing system and area from explicit evidence", () => {
    const payload = resolveSheathing(buildSheathingEvidenceForWall001());

    assert.equal(payload.systems.length, 1);
    assert.equal(payload.areas.length, 1);
    assert.equal(payload.systems[0]?.id, "SHS-001");
    assert.equal(payload.systems[0]?.application, "wall");
    assert.equal(payload.systems[0]?.panelSpecification.panelType, "OSB");
    assert.equal(payload.systems[0]?.panelSpecification.thickness, '7/16"');
    assert.deepEqual(payload.systems[0]?.areaIds, ["SHA-001"]);
    assert.equal(payload.areas[0]?.id, "SHA-001");
    assert.equal(payload.areas[0]?.parentSystemId, "SHS-001");
    assert.equal(payload.areas[0]?.areaSquareFeet, 160);
    assert.deepEqual(payload.areas[0]?.coveredObjectIds, ["W-001"]);
  });

  it("preserves partial areas when areaSquareFeet is missing", () => {
    const payload = resolveSheathing(
      buildSheathingEvidenceForWall001().filter(
        (record) => record.propertyPath !== "areaSquareFeet",
      ),
    );

    assert.equal(payload.areas[0]?.areaSquareFeet, null);
    assert.equal(payload.areas[0]?.parentSystemId, "SHS-001");
  });

  it("marks conflicting panel type values unresolved", () => {
    const payload = resolveSheathing([
      ...buildSheathingEvidenceForWall001(),
      sheathingEvidence(
        "sheathing-system",
        "SHS-001",
        "E-SHS-TYPE-CONFLICT",
        "panelSpecification.panelType",
        "Plywood",
      ),
    ]);

    assert.equal(payload.systems[0]?.panelSpecification.panelType, null);
    assert.ok(
      payload.systems[0]?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "panelSpecification.panelType" &&
          trace.method === "unresolved",
      ),
    );
  });

  it("converges subjectKeys that mint the same ObjectId into one system", () => {
    const payload = resolveSheathing([
      sheathingEvidence(
        "sheathing-system",
        "FLOOR SHEATHING",
        "E-SPACE",
        "application",
        "floor",
      ),
      sheathingEvidence(
        "sheathing-system",
        "FLOOR-SHEATHING",
        "E-HYPHEN",
        "panelSpecification.panelType",
        "T&G",
      ),
    ]);

    assert.equal(payload.systems.length, 1);
    assert.equal(payload.systems[0]?.id, "SHS-FLOOR-SHEATHING");
    assert.equal(payload.systems[0]?.application, "floor");
    assert.equal(payload.systems[0]?.panelSpecification.panelType, "T&G");
    assert.ok(
      payload.systems[0]?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "subjectKey" &&
          trace.explanation.includes("FLOOR SHEATHING") &&
          trace.explanation.includes("FLOOR-SHEATHING"),
      ),
    );
  });

  it("keeps conflicting property values fail-closed after identity convergence", () => {
    const payload = resolveSheathing([
      sheathingEvidence(
        "sheathing-system",
        "SHS-001",
        "E-A",
        "name",
        "System A",
      ),
      sheathingEvidence(
        "sheathing-system",
        "SHS 001",
        "E-B",
        "name",
        "System B",
      ),
    ]);

    assert.equal(payload.systems.length, 1);
    assert.equal(payload.systems[0]?.id, "SHS-001");
    assert.equal(payload.systems[0]?.name, "SHS-001");
    assert.ok(
      payload.systems[0]?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "name" && trace.method === "unresolved",
      ),
    );
  });

  it("does not merge sheathing-system and sheathing-area with similar text", () => {
    const payload = resolveSheathing([
      sheathingEvidence(
        "sheathing-system",
        "FLOOR SHEATHING",
        "E-SYS",
        "application",
        "floor",
      ),
      sheathingEvidence(
        "sheathing-area",
        "FLOOR SHEATHING",
        "E-AREA",
        "areaSquareFeet",
        100,
      ),
    ]);

    assert.equal(payload.systems.length, 1);
    assert.equal(payload.areas.length, 1);
    assert.equal(payload.systems[0]?.id, "SHS-FLOOR-SHEATHING");
    assert.equal(payload.areas[0]?.objectType, "sheathing-area");
    assert.notEqual(payload.systems[0]?.id, payload.areas[0]?.id);
  });

  it("keeps distinct ObjectIds as separate systems", () => {
    const payload = resolveSheathing([
      ...buildSheathingEvidenceForWall001(),
      ...buildSheathingEvidenceForWall001("SHS-002", "SHA-002", "E-SHS2"),
    ]);
    assert.equal(payload.systems.length, 2);
    assert.deepEqual(
      payload.systems.map((system) => system.id).sort(),
      ["SHS-001", "SHS-002"],
    );
  });

  it("enriches one system when a second pass adds compatible properties", () => {
    const payload = resolveSheathing([
      {
        ...sheathingEvidence(
          "sheathing-system",
          "FLOOR SHEATHING",
          "E-PASS1",
          "application",
          "floor",
        ),
        extractionPassId: "pass:wall-framing",
        bundleId: "bundle:wall",
      },
      {
        ...sheathingEvidence(
          "sheathing-system",
          "FLOOR-SHEATHING",
          "E-PASS2",
          "panelSpecification.thickness",
          '3/4"',
        ),
        extractionPassId: "pass:referenced-detail",
        bundleId: "bundle:detail",
      },
    ]);

    assert.equal(payload.systems.length, 1);
    assert.equal(payload.systems[0]?.application, "floor");
    assert.equal(payload.systems[0]?.panelSpecification.thickness, '3/4"');
  });

  it("sorts systems and areas deterministically regardless of evidence order", () => {
    const forward = resolveSheathing([
      ...buildSheathingEvidenceForWall001(),
      ...buildSheathingEvidenceForWall001("SHS-002", "SHA-002", "E-SHS2"),
    ]);
    const reverse = resolveSheathing([
      ...buildSheathingEvidenceForWall001("SHS-002", "SHA-002", "E-SHS2"),
      ...buildSheathingEvidenceForWall001(),
    ]);

    assert.deepEqual(
      forward.systems.map((system) => system.id),
      reverse.systems.map((system) => system.id),
    );
    assert.deepEqual(
      forward.areas.map((area) => area.id),
      reverse.areas.map((area) => area.id),
    );
  });

  it("ignores wall and opening evidence clusters", () => {
    const payload = resolveSheathing([
      ...buildSheathingEvidenceForWall001(),
      evidenceSchema.parse({
        id: "E-W001-LENGTH",
        type: "dimension",
        relationship: "supports",
        description: "Wall length.",
        source: {
          page: {
            documentId: null,
            pageNumber: 1,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "W-001",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "20 ft",
        references: [],
        subjectKind: "wall",
        subjectKey: "W-001",
        propertyPath: "lengthFeet",
        candidateValue: 20,
      }),
    ]);

    assert.equal(payload.systems.length, 1);
    assert.equal(payload.areas.length, 1);
  });
});
