import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import {
  isJoistSizePlanPointerValue,
  normalizeOcrJoistSizeCandidate,
} from "../../src/framing/resolve/floorFramingPropertyPaths.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";

function systemEvidence(
  id: string,
  propertyPath: string,
  candidateValue: string | number,
  subjectKey = "FLOOR-SYS-A",
) {
  return evidenceSchema.parse({
    id,
    type: "note",
    relationship: "supports",
    description: `${propertyPath} candidate.`,
    source: {
      page: {
        documentId: null,
        pageNumber: 3,
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
    originalText: String(candidateValue),
    references: [],
    subjectKind: "floor-framing-system",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

describe("joist size pointer vs dimensional conflict", () => {
  it("classifies see-plans text as a pointer, not a size", () => {
    assert.equal(
      isJoistSizePlanPointerValue("SEE PLANS FOR SIZE AND SPACING"),
      true,
    );
    assert.equal(isJoistSizePlanPointerValue('11.7/8"'), false);
    assert.equal(
      isJoistSizePlanPointerValue('11.7/8" see plans for spacing'),
      false,
    );
  });

  it("normalizes OCR-ish 11.7/8\" to 11-7/8 without rewriting 11 7/8\"", () => {
    assert.equal(normalizeOcrJoistSizeCandidate('11.7/8"'), "11-7/8");
    assert.equal(normalizeOcrJoistSizeCandidate("11.7/8"), "11-7/8");
    assert.equal(normalizeOcrJoistSizeCandidate('11 7/8"'), '11 7/8"');
  });

  it("establishes joistSize when a dimensional size and a see-plans pointer share a subject", () => {
    const payload = resolveFloorFraming([
      systemEvidence(
        "E-FFS-P3-JOISTSIZE",
        "assembly.joistSize",
        '11.7/8"',
      ),
      systemEvidence(
        "E-P5-FLOORJOIST-DETAIL-CALLOUT",
        "assembly.joistSize",
        "SEE PLANS FOR SIZE AND SPACING",
      ),
      systemEvidence("E-FFS-TYPE", "assembly.joistType", "TJI 210"),
    ]);

    assert.equal(payload.systems.length, 1);
    const system = payload.systems[0]!;
    assert.equal(system.assembly.joistSize, "11-7/8");
    assert.equal(
      system.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "assembly.joistSize" &&
          trace.method === "unresolved",
      ),
      false,
    );
    assert.ok(
      system.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "assembly.joistSize" &&
          trace.method === "explicit-project-value" &&
          /pointer/i.test(trace.explanation) &&
          trace.explanation.includes("E-P5-FLOORJOIST-DETAIL-CALLOUT"),
      ),
    );
  });

  it("still fails closed when two true dimensional sizes conflict", () => {
    const payload = resolveFloorFraming([
      systemEvidence("E-SIZE-A", "assembly.joistSize", '11.7/8"'),
      systemEvidence("E-SIZE-B", "assembly.joistSize", "9-1/2"),
    ]);

    const system = payload.systems[0]!;
    assert.equal(system.assembly.joistSize, null);
    assert.ok(
      system.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "assembly.joistSize" &&
          trace.method === "unresolved",
      ),
    );
  });
});
