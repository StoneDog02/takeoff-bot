import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import {
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
  SEMANTIC_BINDING_BUNDLE_ID,
  SEMANTIC_BINDING_PASS_ID,
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
} from "../../src/framing/geometry/semanticBindingConstants.js";
import { resolveWallFraming } from "../../src/framing/resolve/resolveWallFraming.js";

const RUN_KEY = "physical-run:p4:dining-north";

function baseEvidence(
  subjectKey: string,
  propertyPath: string,
  candidateValue: string | number | boolean,
  id: string,
): Evidence {
  return {
    id,
    type: "tag",
    relationship: "supports",
    description: `${propertyPath} for ${subjectKey}`,
    source: {
      page: {
        documentId: null,
        pageNumber: 4,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: subjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: String(candidateValue),
    references: [],
    subjectKind: "wall",
    subjectKey,
    propertyPath,
    candidateValue,
    extractionPassId: null,
    bundleId: null,
  };
}

function bindingEvidence(): Evidence[] {
  return [
    {
      ...baseEvidence(RUN_KEY, SEMANTIC_TYPE_KEY_PROPERTY_PATH, "SW2", "E-BIND-TYPE"),
      extractionPassId: SEMANTIC_BINDING_PASS_ID,
      bundleId: SEMANTIC_BINDING_BUNDLE_ID,
    },
    {
      ...baseEvidence(RUN_KEY, BINDING_AUTHORITY_GRADE_PROPERTY_PATH, "A", "E-BIND-GRADE"),
      extractionPassId: SEMANTIC_BINDING_PASS_ID,
      bundleId: SEMANTIC_BINDING_BUNDLE_ID,
    },
  ];
}

describe("resolveWallFraming semantic inheritance", () => {
  it("inherits assembly from the type cluster onto the physical-run wall", () => {
    const evidence: Evidence[] = [
      ...bindingEvidence(),
      baseEvidence(RUN_KEY, "lengthFeet", 12, "E-LEN"),
      baseEvidence("SW2", "wallType", "exterior-wood-stud-wall", "E-TYPE"),
      baseEvidence("SW2", "assembly.studSize", "2x4", "E-STUD"),
      baseEvidence("SW2", "assembly.studSpacingInches", 16, "E-SPACE"),
      baseEvidence("SW2", "assembly.plateCount", 3, "E-PLATE"),
      baseEvidence("SW2", "assembly.heightFeet", 9, "E-HEIGHT"),
    ];

    const resolved = resolveWallFraming(evidence);
    const runWall = resolved.walls.find((wall) => wall.id.includes("physical-run"));
    const typeWall = resolved.walls.find((wall) => wall.id === "SW2");
    const runSegment = resolved.segments.find(
      (segment) => segment.parentWallId === runWall?.id,
    );
    const typeSegment = resolved.segments.find(
      (segment) => segment.parentWallId === typeWall?.id,
    );

    assert.ok(runWall);
    assert.equal(runWall.semanticTypeKey, "SW2");
    assert.equal(runWall.bindingAuthorityGrade, "A");
    assert.equal(runWall.assembly?.studSize, "2x4");
    assert.equal(runWall.assembly?.studSpacingInches, 16);
    assert.equal(runSegment?.lengthFeet, 12);
    assert.equal(typeSegment?.lengthFeet, null);
  });

  it("keeps length on the physical-run segment when binding is missing", () => {
    const evidence: Evidence[] = [
      baseEvidence(RUN_KEY, "lengthFeet", 12, "E-LEN"),
      baseEvidence("SW2", "assembly.studSize", "2x4", "E-STUD"),
    ];

    const resolved = resolveWallFraming(evidence);
    const runWall = resolved.walls.find((wall) => wall.id.includes("physical-run"));

    assert.ok(runWall);
    assert.equal(runWall.semanticTypeKey, null);
    assert.equal(runWall.assembly.studSize, null);
  });
});
