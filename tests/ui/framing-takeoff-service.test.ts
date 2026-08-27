import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { FLOOR_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { OPENING_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { floorFramingArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { FramingTakeoffService } from "../../src/ui/framingTakeoffService.js";

const BECKSTEAD_AUDIT_A_DIR = path.resolve(
  "artifacts/b2.2m.2/runs/beckstead-audit-a/framing",
);

const BECKSTEAD_WAVE5_FIXTURE_DIR = path.resolve(
  "artifacts/b2.3-wave5/runs/beckstead-wave5-after/framing",
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
      assert.equal(run1.sessionSource, "demo-run");
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

      const run2 = await service.submitReviewDecision({
        sessionId: run1.sessionId,
        reviewItemId: o002King.reviewItemId,
        value: 3,
        rationale: "Reviewer confirmed 3 king studs per occurrence for O-002.",
      });

      assert.equal(run2.activeRun, 2);
      assert.equal(run2.userDecisions.length, 1);
      assert.equal(run2.runLineage.runs.length, 2);
      assert.equal(run2.runLineage.runs[1]?.label, "recalculated");
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
      assert.equal(kingMaterialRun2.claimStatus, "CONFIRMED");
      assert.equal(kingMaterialRun2.assumptionIds.length, 1);
      assert.equal(
        kingMaterialRun2.assumptionIds[0],
        createOpeningKingStudCountAssumptionId("O-002"),
      );

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
          service.submitReviewDecision({
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
      assert.equal(run1.sessionSource, "demo-run");
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
        /does not exist or is not readable/,
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  if (existsSync(BECKSTEAD_AUDIT_A_DIR)) {
    it("loads Beckstead Audit A with copy-on-load and replay capability", async () => {
      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-ui-beckstead-a-"),
      );

      try {
        const service = new FramingTakeoffService({
          artifactRoot,
          artifactDir: BECKSTEAD_AUDIT_A_DIR,
        });
        const run1 = await service.startSession();

        assert.equal(run1.projectId, "beckstead-audit-a");
        assert.equal(run1.sessionSource, "artifact-load");
        assert.equal(run1.replayCapable, true);
        assert.equal(run1.takeoff.summary.materialLineItemCount, 52);
        assert.ok(run1.packages.length >= 1 || run1.limitations.some((entry) =>
          entry.includes("Package product-state companion"),
        ));
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    });
  }

  if (existsSync(BECKSTEAD_WAVE5_FIXTURE_DIR)) {
    it("Beckstead Wave 5: artifact load → package dashboard → joistLayoutLengthFeet decision → Run 2", async () => {
      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-ui-wave5-e2e-"),
      );

      try {
        const service = new FramingTakeoffService({ artifactRoot });
        const run1 = await service.startSession({
          artifactDir: BECKSTEAD_WAVE5_FIXTURE_DIR,
        });

        assert.equal(run1.sessionSource, "artifact-load");
        assert.equal(run1.replayCapable, true);
        assert.equal(run1.activeRun, 1);
        assert.ok(run1.packageProductState);
        assert.ok(run1.packages.length >= 6);

        const walls = run1.packages.find((pkg) => pkg.package === "Walls");
        const floor = run1.packages.find((pkg) => pkg.package === "Floor");
        assert.ok(walls);
        assert.equal(walls.displayState, "calculated");
        assert.equal(walls.stage16Lines, 52);
        assert.ok(floor);
        assert.equal(floor.displayState, "calculator-starved");
        assert.equal(floor.stage16Lines, 0);
        assert.equal(floor.reviewRequired, true);

        const layoutReview = run1.reviewWorkspace.items.find(
          (item) =>
            item.action.type === "provide-value" &&
            item.targetProperty === "joistLayoutLengthFeet" &&
            item.objectId === "FFA-CRAWL-SPACE-FLOOR-AREA---S",
        );
        assert.ok(
          layoutReview,
          "Expected joistLayoutLengthFeet review item for linked crawl area S",
        );

        const sourceExternalBefore = (
          await readdir(path.join(BECKSTEAD_WAVE5_FIXTURE_DIR, "external")).catch(
            () => [],
          )
        ).length;

        const run2 = await service.submitReviewDecision({
          sessionId: run1.sessionId,
          reviewItemId: layoutReview.reviewItemId,
          value: 40,
          rationale:
            "Reviewer supplied spacing-axis joist layout length 40 ft for crawl area S.",
        });

        assert.equal(run2.activeRun, 2);
        assert.equal(run2.userDecisions.length, 1);
        assert.equal(run2.runLineage.userDecisionIds.length, 1);

        const sessionRun1Dir = path.join(artifactRoot, run1.sessionId, "run1");
        const decisionFiles = await readdir(
          path.join(sessionRun1Dir, run1.projectId, "framing", "external"),
        );
        assert.ok(decisionFiles.some((name) => name.startsWith("UD-")));

        const sourceExternalAfter = (
          await readdir(path.join(BECKSTEAD_WAVE5_FIXTURE_DIR, "external")).catch(
            () => [],
          )
        ).length;
        assert.equal(sourceExternalAfter, sourceExternalBefore);

        const run2FloorArtifact = floorFramingArtifactSchema.parse(
          JSON.parse(
            await readFile(
              path.join(
                artifactRoot,
                run1.sessionId,
                "run2",
                run1.projectId,
                "framing",
                "11-floorFraming.json",
              ),
              "utf8",
            ),
          ),
        );
        const crawlS = run2FloorArtifact.payload.areas.find(
          (area) => area.id === "FFA-CRAWL-SPACE-FLOOR-AREA---S",
        );
        assert.ok(crawlS);
        assert.equal(crawlS.joistLayoutLengthFeet, 40);

        const floorAfter = run2.packages.find((pkg) => pkg.package === "Floor");
        assert.ok(floorAfter);

        const floorJoistMaterial = run2.takeoff.materials.find((material) =>
          material.id.includes(FLOOR_QUANTITY_KEYS.joists),
        );

        if (floorJoistMaterial) {
          assert.ok(floorAfter.stage16Lines > 0);
        } else {
          assert.equal(floorAfter.stage16Lines, 0);
          assert.ok(
            run2.reviewWorkspace.items.some(
              (item) =>
                item.objectId.startsWith("FFA-") &&
                (item.targetProperty === "assembly.joistSize" ||
                  item.targetProperty === "spanDirection" ||
                  item.targetProperty === "joistLayoutLengthFeet"),
            ),
            "Expected a legitimate next blocker review item when floor materials did not emit",
          );
        }

        assert.equal(
          run2.takeoff.materials.filter((material) =>
            material.sourceObjectIds.some((id) => id.startsWith("FFA-PATIO")),
          ).length,
          0,
          "Patio slab must not silently emit floor materials from a single layout-length decision",
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    });
  }
});
