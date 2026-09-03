import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { mergeExtractedAndGeometryEvidence } from "../../src/framing/geometry/mergeExtractedAndGeometryEvidence.js";
import { resolveWallFraming } from "../../src/framing/resolve/resolveWallFraming.js";

const RUN_KEY = "physical-run:p2:test-run";

function wallLengthEvidence(input: {
  id: string;
  subjectKey: string;
  feet: number;
  passId?: string | null;
}): Evidence {
  return {
    id: input.id,
    type: "dimension",
    relationship: "supports",
    description: "wall length",
    source: {
      page: {
        documentId: null,
        pageNumber: 2,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: `${input.feet}'-0"`,
    references: [],
    subjectKind: "wall",
    subjectKey: input.subjectKey,
    propertyPath: "lengthFeet",
    candidateValue: input.feet,
    extractionPassId: input.passId ?? null,
    bundleId: input.passId ? "drawing-compiler" : null,
  };
}

describe("mergeExtractedAndGeometryEvidence", () => {
  it("drops Claude type-mark lengthFeet and records audit", () => {
    const claude = wallLengthEvidence({
      id: "E-CLAUDE-SW2",
      subjectKey: "SW2",
      feet: 24,
    });
    const geometry = wallLengthEvidence({
      id: "E-GEOM-RUN",
      subjectKey: RUN_KEY,
      feet: 19.5,
      passId: "geometry-observation",
    });

    const { evidence, audit } = mergeExtractedAndGeometryEvidence({
      claudeEvidence: [claude],
      geometryEvidence: [geometry],
    });

    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]?.id, "E-GEOM-RUN");
    assert.equal(audit.droppedTypeMarkLengths.length, 1);
    assert.equal(audit.droppedTypeMarkLengths[0]?.evidenceId, "E-CLAUDE-SW2");
  });

  it("corroborates identical physical-run lengths from both sources", () => {
    const claude = wallLengthEvidence({
      id: "E-CLAUDE-RUN",
      subjectKey: RUN_KEY,
      feet: 19.5,
    });
    const geometry = wallLengthEvidence({
      id: "E-GEOM-RUN",
      subjectKey: RUN_KEY,
      feet: 19.5,
      passId: "geometry-observation",
    });

    const { evidence, audit } = mergeExtractedAndGeometryEvidence({
      claudeEvidence: [claude],
      geometryEvidence: [geometry],
    });

    assert.equal(evidence.length, 2);
    assert.equal(audit.corroborations.length, 1);
    assert.equal(audit.conflicts.length, 0);

    const resolved = resolveWallFraming(evidence);
    const segment = resolved.segments.find((item) =>
      item.parentWallId.includes("physical-run"),
    );
    assert.equal(segment?.lengthFeet, 19.5);
  });

  it("admits both records on same-run conflict and fails closed at Resolution", () => {
    const claude = wallLengthEvidence({
      id: "E-CLAUDE-RUN",
      subjectKey: RUN_KEY,
      feet: 20,
    });
    const geometry = wallLengthEvidence({
      id: "E-GEOM-RUN",
      subjectKey: RUN_KEY,
      feet: 19.5,
      passId: "geometry-observation",
    });

    const { evidence, audit } = mergeExtractedAndGeometryEvidence({
      claudeEvidence: [claude],
      geometryEvidence: [geometry],
    });

    assert.equal(evidence.length, 2);
    assert.equal(audit.conflicts.length, 1);
    assert.equal(audit.conflicts[0]?.physicalRunKey, RUN_KEY);

    const resolved = resolveWallFraming(evidence);
    const segment = resolved.segments.find((item) =>
      item.parentWallId.includes("physical-run"),
    );
    assert.equal(segment?.lengthFeet, null);
  });
});
