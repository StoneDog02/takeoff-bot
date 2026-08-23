import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { compileDrawingPage } from "../../src/drawing-compiler/compileDrawingPage.js";
import { assignLengthEvidenceFromGeometryObservations } from "../../src/scopes/framing/geometry/assignLengthEvidenceFromGeometryObservation.js";
import { buildWallPlanLengthObservationsFromCompileResult } from "../../src/scopes/framing/geometry/buildWallPlanLengthObservationsFromCompile.js";

const FIXTURES = path.join("tests", "fixtures");
const EXPECTED = path.join(FIXTURES, "drawing-compiler", "expected");

async function loadExpected<T>(name: string): Promise<T> {
  const raw = await readFile(path.join(EXPECTED, name), "utf8");
  return JSON.parse(raw) as T;
}

async function compileAndAssign(pdfRel: string, pageNumber: number) {
  const compiled = await compileDrawingPage({
    pdfPath: path.join(FIXTURES, pdfRel),
    pageNumber,
  });
  const observations = buildWallPlanLengthObservationsFromCompileResult(compiled);
  const { assignments, evidence } =
    assignLengthEvidenceFromGeometryObservations(observations);
  const assigned = assignments.filter((a) => a.status === "assigned");
  return { compiled, observations, assigned, evidence };
}

describe("drawing-compiler integration", () => {
  it(
    "burt-build-plans p2 retains native-text bridge Evidence",
    { timeout: 120_000 },
    async () => {
      const expected = await loadExpected<{
        pageRole: string;
        assignedEvidenceCount: number;
        observationCount: number;
        physicalRunKey: string;
        exampleFeetApprox: number;
        forbiddenFeetApprox: number;
      }>("burt-p2.json");

      const { compiled, observations, assigned } = await compileAndAssign(
        "burt-build-plans.pdf",
        2,
      );

      assert.equal(compiled.pageRole.role, expected.pageRole);
      assert.equal(observations.length, expected.observationCount);
      assert.equal(assigned.length, expected.assignedEvidenceCount);
      assert.equal(assigned[0]?.physicalRunKey, expected.physicalRunKey);
      assert.ok(
        observations.some(
          (o) =>
            o.lengthFeet != null &&
            Math.abs(o.lengthFeet - expected.exampleFeetApprox) < 0.01,
        ),
      );
      assert.ok(
        compiled.transcriptions.some((t) => t.authority === "pdf-text-layer"),
      );
      assert.ok(
        !observations.some(
          (o) =>
            o.lengthFeet != null &&
            Math.abs(o.lengthFeet - expected.forbiddenFeetApprox) < 1,
        ),
      );
    },
  );

  it(
    "burt-build-plans p5 emits zero wall-plan length Evidence on elevation",
    { timeout: 120_000 },
    async () => {
      const expected = await loadExpected<{
        pageRole: string;
        assignedEvidenceCount: number;
        observationCount: number;
        governanceRejectPageRoleMin: number;
      }>("burt-p5.json");

      const { compiled, observations, assigned } = await compileAndAssign(
        "burt-build-plans.pdf",
        5,
      );

      assert.equal(compiled.pageRole.role, expected.pageRole);
      assert.equal(compiled.pageRole.allowsWallPlanLengthEvidence, false);
      assert.equal(observations.length, expected.observationCount);
      assert.equal(assigned.length, expected.assignedEvidenceCount);
      assert.ok(
        compiled.governance.counts.rejectPageRole >=
          expected.governanceRejectPageRoleMin,
      );
    },
  );

  const runOcrMatrix = process.env.TAKEOFF_COMPILER_OCR === "1";
  (runOcrMatrix ? it : it.skip)(
    "beckstead-residence-plans p4 retains west bridge and rejects 240 scale outlier",
    { timeout: 180_000 },
    async () => {
      const expected = await loadExpected<{
        pageRole: string;
        assignedEvidenceCount: number;
        observationCount: number;
        physicalRunKey: string;
        forbiddenFeetApprox: number;
      }>("beckstead-p4.json");

      const { compiled, observations, assigned } = await compileAndAssign(
        "beckstead-residence-plans.pdf",
        4,
      );

      assert.equal(compiled.pageRole.role, expected.pageRole);
      assert.equal(observations.length, expected.observationCount);
      assert.equal(assigned.length, expected.assignedEvidenceCount);
      assert.equal(assigned[0]?.physicalRunKey, expected.physicalRunKey);
      assert.ok(
        !observations.some(
          (o) =>
            o.lengthFeet != null &&
            Math.abs(o.lengthFeet - expected.forbiddenFeetApprox) < 1,
        ),
      );
      assert.ok(compiled.governance.counts.rejectScale >= 1);
    },
  );
});
