import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { OPENING_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { FramingTakeoffService } from "../../src/ui/framingTakeoffService.js";

const BECKSTEAD_ARTIFACT_DIR = path.resolve(
  "artifacts/b2.2m.2/runs/beckstead-audit-a/framing",
);

function createDemoService(artifactRoot: string) {
  return new FramingTakeoffService({
    artifactRoot,
    artifactDir: null,
    pdfPath: null,
  });
}

describe("framing takeoff UI service", () => {
  it("runs demo takeoff and replays O-002 kingStudCount through Run 2", async () => {
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-ui-service-"));

    try {
      const service = createDemoService(artifactRoot);
      const run1 = await service.startSession();

      assert.equal(run1.activeRun, 1);
      assert.ok(run1.takeoff.materials.length >= 10);
      assert.ok(run1.reviewWorkspace.summary.activeReviewItemCount >= 4);

      const o002King = run1.reviewWorkspace.items.find(
        (item) =>
          item.objectId === "O-002" && item.targetProperty === "kingStudCount",
      );
      assert.ok(o002King);
      assert.equal(o002King.action.type, "provide-value");
      assert.equal(o002King.currentState.calculationValueUsed, 2);

      const kingMaterialRun1 = run1.takeoff.materials.find(
        (material) =>
          material.id ===
          createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
      );
      assert.ok(kingMaterialRun1);
      assert.equal(kingMaterialRun1.quantity, 2);
      assert.ok(
        kingMaterialRun1.assumptionIds.includes(
          createOpeningKingStudCountAssumptionId("O-002"),
        ),
      );

      const run2 = await service.submitValueProvidedDecision({
        sessionId: run1.sessionId,
        reviewItemId: o002King.reviewItemId,
        value: 3,
        rationale: "Reviewer confirmed 3 king studs per occurrence for O-002.",
      });

      assert.equal(run2.activeRun, 2);
      assert.equal(run2.userDecisions.length, 1);
      assert.equal(
        run2.reviewWorkspace.items.some(
          (item) =>
            item.objectId === "O-002" && item.targetProperty === "kingStudCount",
        ),
        false,
      );
      assert.equal(run2.reviewWorkspace.resolvedItems.length, 1);
      assert.equal(run2.reviewWorkspace.resolvedItems[0]?.calculationValueUsed, 3);

      const kingMaterialRun2 = run2.takeoff.materials.find(
        (material) =>
          material.id ===
          createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
      );
      assert.ok(kingMaterialRun2);
      assert.equal(kingMaterialRun2.quantity, 3);
      assert.equal(kingMaterialRun2.assumptionIds.length, 0);

      assert.ok(run2.materialComparison);
      assert.equal(run2.materialComparison.length, 1);
      assert.equal(run2.materialComparison[0]?.run1Quantity, 2);
      assert.equal(run2.materialComparison[0]?.run2Quantity, 3);

      const reloaded = service.getSession(run1.sessionId);
      assert.ok(reloaded);
      assert.equal(reloaded.activeRun, 2);
      assert.equal(reloaded.takeoff.materials.length, run2.takeoff.materials.length);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("rejects invalid value-provided decisions before Run 2 completes", async () => {
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-ui-invalid-"));

    try {
      const service = createDemoService(artifactRoot);
      const run1 = await service.startSession();
      const o002King = run1.reviewWorkspace.items.find(
        (item) =>
          item.objectId === "O-002" && item.targetProperty === "kingStudCount",
      );
      assert.ok(o002King);

      await assert.rejects(
        () =>
          service.submitValueProvidedDecision({
            sessionId: run1.sessionId,
            reviewItemId: o002King.reviewItemId,
            value: 0,
            rationale: "Invalid king stud count.",
          }),
        /value is not valid for property kingStudCount/,
      );

      const stillRun1 = service.getSession(run1.sessionId);
      assert.ok(stillRun1);
      assert.equal(stillRun1.activeRun, 1);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("uses demo pipeline when artifactDir is not configured", async () => {
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-ui-demo-only-"));

    try {
      const service = createDemoService(artifactRoot);
      const run1 = await service.startSession();

      assert.equal(run1.projectId, "ui-demo-multi-object");
      assert.ok(run1.takeoff.materials.length >= 10);
      assert.ok(
        run1.reviewWorkspace.items.some((item) => item.objectId === "O-002"),
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("fails clearly when artifactDir is invalid and does not fall back to demo", async () => {
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-ui-artifact-fail-"));

    try {
      const service = new FramingTakeoffService({
        artifactRoot,
        artifactDir: path.join(tmpdir(), "takeoff-ui-nonexistent-artifacts"),
      });

      await assert.rejects(
        () => service.startSession(),
        /TAKEOFF_UI_ARTIFACT_DIR does not exist or is not readable/,
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  if (existsSync(BECKSTEAD_ARTIFACT_DIR)) {
    it("loads Beckstead Audit #3 through loadFramingRunState", async () => {
      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-ui-beckstead-"),
      );

      try {
        const service = new FramingTakeoffService({
          artifactRoot,
          artifactDir: BECKSTEAD_ARTIFACT_DIR,
        });
        const run1 = await service.startSession();

        assert.equal(run1.projectId, "beckstead-audit-a");
        assert.notEqual(run1.projectId, "ui-demo-multi-object");
        assert.equal(run1.takeoff.summary.materialLineItemCount, 52);
        assert.equal(run1.takeoff.materials.length, 52);
        assert.equal(run1.reviewWorkspace.summary.activeReviewItemCount, 107);
        assert.equal(
          run1.takeoff.materials.some((material) =>
            material.id.includes("physical-run:p1:"),
          ),
          false,
        );
        assert.equal(
          run1.takeoff.materials.some((material) =>
            material.id.includes("physical-run:p3:"),
          ),
          true,
        );

        await assert.rejects(
          () =>
            service.submitValueProvidedDecision({
              sessionId: run1.sessionId,
              reviewItemId: run1.reviewWorkspace.items[0]!.reviewItemId,
              value: 1,
              rationale: "Should be blocked in artifact inspection mode.",
            }),
          /does not support Run 2 replay/,
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    });
  }
});
