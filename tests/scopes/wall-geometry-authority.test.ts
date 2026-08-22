import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assignLengthEvidenceFromGeometryObservations } from "../../src/scopes/framing/geometry/assignLengthEvidenceFromGeometryObservation.js";
import { parseImperialLengthToFeet } from "../../src/scopes/framing/geometry/parseImperialLengthToFeet.js";
import {
  isWallTypeMarkSubjectKey,
  wallGeometryObservationSchema,
} from "../../src/scopes/framing/geometry/wallGeometryObservation.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { calculateWallFraming } from "../../src/scopes/framing/calculators/calculateWallFraming.js";
import { coordinateFramingValidation } from "../../src/scopes/framing/validators/validation-coordinator.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";

function observation(input: {
  id: string;
  text: string;
  runKey: string | null;
  targetKind?: "physical-run" | "wall-type-mark" | "unknown";
  chain?: boolean;
  confidence?: "high" | "medium" | "low";
  lengthFeet?: number | null;
  typeMark?: string | null;
}) {
  return wallGeometryObservationSchema.parse({
    id: input.id,
    rawDimensionText: input.text,
    lengthFeet: input.lengthFeet ?? null,
    authorityMethod: "explicit-dimension",
    targetKind: input.targetKind ?? "physical-run",
    targetPhysicalRunKey: input.runKey,
    observedWallTypeMark: input.typeMark ?? null,
    sourcePageNumber: 4,
    sourceTileId: "t-r0-c2",
    startAnchorDescription: "corner A",
    endAnchorDescription: "corner B",
    orientation: "horizontal",
    isChainSegment: input.chain ?? false,
    chainSiblingTexts: [],
    confidenceLabel: input.confidence ?? "high",
    notes: [],
  });
}

describe("imperial length parsing", () => {
  it("parses whole feet and fractional inches", () => {
    assert.equal(parseImperialLengthToFeet("24'-0\"").status, "ok");
    assert.equal(
      (parseImperialLengthToFeet("24'-0\"") as { feet: number }).feet,
      24,
    );
    const frac = parseImperialLengthToFeet("12'-6 1/2\"");
    assert.equal(frac.status, "ok");
    if (frac.status === "ok") {
      assert.ok(Math.abs(frac.feet - 12.5416666667) < 1e-9);
    }
  });

  it("rejects ambiguous unit-less numbers", () => {
    assert.equal(parseImperialLengthToFeet("24").status, "unresolved");
  });
});

describe("wall geometry length authority", () => {
  it("assigns explicit dimension to a physical run with provenance", () => {
    const { assignments, evidence } = assignLengthEvidenceFromGeometryObservations([
      observation({
        id: "OBS-1",
        text: "12'-0\"",
        runKey: "physical-run:S2.3:dining-north-exterior",
        typeMark: "SW2",
      }),
    ]);
    assert.equal(assignments[0]?.status, "assigned");
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]?.subjectKey, "physical-run:S2.3:dining-north-exterior");
    assert.equal(evidence[0]?.propertyPath, "lengthFeet");
    assert.equal(evidence[0]?.candidateValue, 12);
    assert.equal(evidence[0]?.source.tileId, "t-r0-c2");
  });

  it("refuses wall-type mark targets such as SW2", () => {
    assert.equal(isWallTypeMarkSubjectKey("SW2"), true);
    const { assignments, evidence } = assignLengthEvidenceFromGeometryObservations([
      observation({
        id: "OBS-SW2",
        text: "24'-0\"",
        runKey: "SW2",
        targetKind: "physical-run",
      }),
    ]);
    assert.equal(assignments[0]?.status, "rejected");
    assert.equal(evidence.length, 0);
  });

  it("refuses chain-segment dimensions as whole-run lengths", () => {
    const { evidence } = assignLengthEvidenceFromGeometryObservations([
      observation({
        id: "OBS-CHAIN",
        text: "6'-0\"",
        runKey: "physical-run:S2.3:dining-north-exterior",
        chain: true,
      }),
    ]);
    assert.equal(evidence.length, 0);
  });

  it("corroborates duplicate identical lengths without doubling", () => {
    const { evidence } = assignLengthEvidenceFromGeometryObservations([
      observation({
        id: "OBS-A",
        text: "12'-0\"",
        runKey: "physical-run:S2.3:dining-north-exterior",
      }),
      observation({
        id: "OBS-B",
        text: "12'-0\"",
        runKey: "physical-run:S2.3:dining-north-exterior",
      }),
    ]);
    assert.equal(evidence.length, 1);
  });

  it("fails closed on conflicting lengths for the same physical run", () => {
    const { evidence, assignments } = assignLengthEvidenceFromGeometryObservations([
      observation({
        id: "OBS-A",
        text: "12'-0\"",
        runKey: "physical-run:S2.3:dining-north-exterior",
      }),
      observation({
        id: "OBS-B",
        text: "14'-0\"",
        runKey: "physical-run:S2.3:dining-north-exterior",
      }),
    ]);
    assert.equal(evidence.length, 0);
    assert.ok(assignments.every((item) => item.status === "rejected"));
  });

  it("resolves lengthFeet onto the physical-run wall segment only", () => {
    const { evidence: geomEvidence } = assignLengthEvidenceFromGeometryObservations([
      observation({
        id: "OBS-1",
        text: "12'-0\"",
        runKey: "physical-run:S2.3:dining-north-exterior",
      }),
    ]);

    const prior: Evidence[] = [
      {
        id: "E-SW2-TYPE",
        type: "tag",
        relationship: "supports",
        description: "type only",
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
          elementLabel: null,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "SW2",
        references: [],
        subjectKind: "wall",
        subjectKey: "SW2",
        propertyPath: "isShearOrBraced",
        candidateValue: true,
        extractionPassId: null,
        bundleId: null,
      },
    ];

    const resolved = resolveWallFraming([...prior, ...geomEvidence]);
    const runWall = resolved.walls.find((wall) =>
      wall.id.includes("physical-run"),
    );
    const sw2 = resolved.walls.find((wall) => wall.id === "SW2");
    const runSeg = resolved.segments.find(
      (segment) => segment.parentWallId === runWall?.id,
    );
    const sw2Seg = resolved.segments.find(
      (segment) => segment.parentWallId === sw2?.id,
    );

    assert.ok(runWall);
    assert.equal(runSeg?.lengthFeet, 12);
    assert.equal(sw2Seg?.lengthFeet, null);

    const validation = coordinateFramingValidation({ wallFraming: resolved });
    const materials = calculateWallFraming(resolved, validation);
    // No stud spacing / plateCount on the physical-run wall → no material invent.
    assert.equal(materials.length, 0);
  });
});
