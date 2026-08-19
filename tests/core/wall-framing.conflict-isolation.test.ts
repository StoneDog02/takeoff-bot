import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { calculateWallFraming } from "../../src/scopes/framing/calculators/calculateWallFraming.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import {
  WALL_FRAMING_RULE_IDS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateWallFraming } from "../../src/scopes/framing/validators/wall-framing.validator.js";

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
  elementLabel: "W-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

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
  const isW002 = subjectKey === "W-002";
  return [
    evidenceForSubject(subjectKey, {
      id: `${prefix}-CLASS`,
      propertyPath: "wallType",
      candidateValue: "wood stud wall",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-FRAMING`,
      propertyPath: "assembly.studSize",
      candidateValue: isW002 ? "2x6" : "2x4",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-SPACING`,
      type: "dimension",
      propertyPath: "assembly.studSpacingInches",
      candidateValue: isW002 ? 24 : 16,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-HEIGHT`,
      type: "dimension",
      propertyPath: "assembly.heightFeet",
      candidateValue: isW002 ? 9 : 8,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-PLATES`,
      propertyPath: "assembly.plateCount",
      candidateValue: isW002 ? 2 : 3,
    }),
  ];
}

function twoWallConflictEvidence() {
  return [
    ...completeWallEvidenceForSubject("W-001", "E-W001"),
    evidenceForSubject("W-001", {
      id: "E-W001-GEOMETRY",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 20,
    }),
    ...completeWallEvidenceForSubject("W-002", "E-W002"),
    evidenceForSubject("W-002", {
      id: "E-W002-LENGTH-A",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 12,
    }),
    evidenceForSubject("W-002", {
      id: "E-W002-LENGTH-B",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 14,
    }),
  ];
}

describe("wall framing conflict isolation", () => {
  it("resolves W-001 normally while W-002 length conflict stays unresolved", () => {
    const payload = resolveWallFraming(twoWallConflictEvidence());
    const wall001 = payload.walls.find((wall) => wall.id === "W-001");
    const wall002 = payload.walls.find((wall) => wall.id === "W-002");
    const segment001 = payload.segments.find((segment) => segment.id === "WS-001");
    const segment002 = payload.segments.find((segment) => segment.id === "WS-002");

    assert.ok(wall001 && wall002 && segment001 && segment002);
    assert.equal(segment001.lengthFeet, 20);
    assert.equal(segment002.lengthFeet, null);
    assert.equal(wall002.assembly.studSize, "2x6");
    assert.equal(wall002.assembly.studSpacingInches, 24);

    const trace002 = segment002.resolutionTraces.find(
      (entry) => entry.propertyPath === "lengthFeet",
    );
    assert.equal(trace002?.method, "unresolved");
    assert.deepEqual(trace002?.evidenceIds, ["E-W002-LENGTH-A", "E-W002-LENGTH-B"]);
  });

  it("blocks only W-002 length-dependent quantities while W-001 remains calculable", () => {
    const wallFraming = resolveWallFraming(twoWallConflictEvidence());
    const validation = validateWallFraming(wallFraming);
    const materials = calculateWallFraming(wallFraming, validation);

    assert.equal(
      validationResultsForObject(validation, "WS-001").find(
        (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
      )?.outcome,
      "passed",
    );
    assert.equal(
      validationResultsForObject(validation, "WS-002").find(
        (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
      )?.outcome,
      "failed",
    );

    const ws002Issues = validationIssuesForObject(validation, "WS-002");
    const lengthIssue = ws002Issues.find(
      (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
    );
    assert.ok(lengthIssue);
    assert.equal(
      lengthIssue.quantityImpacts.some(
        (impact) =>
          impact.quantityKey === WALL_QUANTITY_KEYS.studs &&
          impact.canCalculate === false,
      ),
      true,
    );
    assert.equal(
      lengthIssue.quantityImpacts.some(
        (impact) =>
          impact.quantityKey === WALL_QUANTITY_KEYS.plates &&
          impact.canCalculate === false,
      ),
      true,
    );

    const ws001Issues = validationIssuesForObject(validation, "WS-001");
    assert.equal(
      ws001Issues.some(
        (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
      ),
      false,
    );

    const stud001 = materials.find(
      (item) =>
        item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
    );
    const plate001 = materials.find(
      (item) =>
        item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
    );
    assert.ok(stud001 && plate001);
    assert.equal(stud001.quantity, 16);
    assert.equal(plate001.quantity, 60);
    assert.equal(materials.length, 2);
    assert.equal(
      materials.some((item) => item.id.includes("WS-002")),
      false,
    );
  });
});

function validationResultsForObject(
  validation: ReturnType<typeof validateWallFraming>,
  objectId: string,
) {
  return validation.validationResults
    .filter(
      (entry) =>
        entry.target.kind === "object" && entry.target.objectId === objectId,
    )
    .map((entry) => ({
      ruleId: entry.ruleId,
      outcome: entry.outcome,
    }));
}

function validationIssuesForObject(
  validation: ReturnType<typeof validateWallFraming>,
  objectId: string,
) {
  return validation.validationIssues.filter(
    (issue) =>
      issue.target.kind === "object" && issue.target.objectId === objectId,
  );
}
