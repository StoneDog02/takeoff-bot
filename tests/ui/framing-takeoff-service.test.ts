import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { OPENING_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { FramingTakeoffService } from "../../src/ui/framingTakeoffService.js";

describe("framing takeoff UI service", () => {
  it("runs demo takeoff and replays O-002 kingStudCount through Run 2", async () => {
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-ui-service-"));

    try {
      const service = new FramingTakeoffService(artifactRoot);
      const run1 = await service.startDemoRun();

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
      const service = new FramingTakeoffService(artifactRoot);
      const run1 = await service.startDemoRun();
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
});
