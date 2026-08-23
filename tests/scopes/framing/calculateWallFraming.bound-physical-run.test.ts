import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import { compileDrawingPage } from "../../../src/drawing-compiler/compileDrawingPage.js";
import { calculateWallFraming } from "../../../src/scopes/framing/calculators/calculateWallFraming.js";
import { assignLengthEvidenceFromGeometryObservations } from "../../../src/scopes/framing/geometry/assignLengthEvidenceFromGeometryObservation.js";
import { buildSemanticBindingEvidenceFromCompiledPages } from "../../../src/scopes/framing/geometry/buildSemanticBindingEvidenceFromCompiledPages.js";
import { buildWallPlanLengthObservationsFromCompileResult } from "../../../src/scopes/framing/geometry/buildWallPlanLengthObservationsFromCompile.js";
import {
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
  SEMANTIC_BINDING_BUNDLE_ID,
  SEMANTIC_BINDING_PASS_ID,
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
} from "../../../src/scopes/framing/geometry/semanticBindingConstants.js";
import { resolveWallFraming } from "../../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { coordinateFramingValidation } from "../../../src/scopes/framing/validators/validation-coordinator.js";

const RUN_KEY = "physical-run:p4:bound-run";

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

describe("calculateWallFraming bound physical-run", () => {
  it("calculates materials for a bound physical-run with inherited assembly (synthetic)", () => {
    const evidence: Evidence[] = [
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
      baseEvidence(RUN_KEY, "lengthFeet", 12, "E-LEN"),
      baseEvidence("SW2", "wallType", "exterior-wood-stud-wall", "E-TYPE"),
      baseEvidence("SW2", "assembly.studSize", "2x4", "E-STUD"),
      baseEvidence("SW2", "assembly.studSpacingInches", 16, "E-SPACE"),
      baseEvidence("SW2", "assembly.plateCount", 3, "E-PLATE"),
      baseEvidence("SW2", "assembly.heightFeet", 9, "E-HEIGHT"),
    ];

    const resolved = resolveWallFraming(evidence);
    const validation = coordinateFramingValidation({ wallFraming: resolved });
    const materials = calculateWallFraming(resolved, validation);
    const runWall = resolved.walls.find((wall) => wall.id.includes("physical-run"));
    const runSegment = resolved.segments.find(
      (segment) => segment.parentWallId === runWall?.id,
    );

    assert.ok(runWall);
    assert.ok(runSegment);
    assert.ok(materials.length > 0);
    assert.ok(
      materials.some(
        (item) =>
          item.sourceObjectIds.includes(runSegment.id) ||
          item.sourceObjectIds.includes(runWall.id),
      ),
    );
  });

  it(
    "proves end-to-end calculable bound physical-run on a real compiled fixture when direct binds exist",
    { timeout: 180_000 },
    async () => {
      const fixtures: Array<{ pdf: string; pageNumber: number }> = [
        { pdf: "beckstead-residence-plans.pdf", pageNumber: 4 },
        { pdf: "burt-build-plans.pdf", pageNumber: 2 },
      ];

      let proved = false;

      for (const fixture of fixtures) {
        const compiled = await compileDrawingPage({
          pdfPath: path.join("tests", "fixtures", fixture.pdf),
          pageNumber: fixture.pageNumber,
        });

        const emittedBindings = compiled.semanticBinding.bindings.filter(
          (binding) => binding.emit,
        );
        if (emittedBindings.length === 0) {
          continue;
        }

        const observations = buildWallPlanLengthObservationsFromCompileResult(compiled);
        const { evidence: lengthEvidence } =
          assignLengthEvidenceFromGeometryObservations(observations);
        const bindingEvidence = buildSemanticBindingEvidenceFromCompiledPages([compiled]);

        const typeKeys = [...new Set(emittedBindings.map((b) => b.semanticSubjectKey))];
        const typeClusterEvidence: Evidence[] = typeKeys.flatMap((typeKey) => [
          baseEvidence(typeKey, "wallType", "exterior-wood-stud-wall", `E-${typeKey}-TYPE`),
          baseEvidence(typeKey, "assembly.studSize", "2x4", `E-${typeKey}-STUD`),
          baseEvidence(typeKey, "assembly.studSpacingInches", 16, `E-${typeKey}-SPACE`),
          baseEvidence(typeKey, "assembly.plateCount", 3, `E-${typeKey}-PLATE`),
          baseEvidence(typeKey, "assembly.heightFeet", 9, `E-${typeKey}-HEIGHT`),
        ]);

        const resolved = resolveWallFraming([
          ...lengthEvidence,
          ...bindingEvidence,
          ...typeClusterEvidence,
        ]);
        const validation = coordinateFramingValidation({ wallFraming: resolved });
        const materials = calculateWallFraming(resolved, validation);

        const boundRunWall = resolved.walls.find(
          (wall) =>
            wall.semanticTypeKey != null &&
            wall.id.includes("physical-run") &&
            resolved.segments.some(
              (segment) =>
                segment.parentWallId === wall.id && segment.lengthFeet != null,
            ),
        );
        const boundSegment = resolved.segments.find(
          (segment) => segment.parentWallId === boundRunWall?.id,
        );

        assert.ok(boundRunWall, "expected a bound physical-run wall with length");
        assert.ok(boundSegment);
        assert.ok(
          materials.some(
            (item) =>
              item.sourceObjectIds.includes(boundSegment.id) ||
              item.sourceObjectIds.includes(boundRunWall.id),
          ),
          "expected material lines on the bound physical-run wall",
        );
        proved = true;
        break;
      }

      if (!proved) {
        console.warn(
          "Real fixture calc proof skipped: L0 gate found no direct governed bindings on Beckstead p4 / Burt p2. See artifacts/b2.2l/REPORT.md.",
        );
        return;
      }
    },
  );
});
