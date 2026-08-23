import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import { computePlanSourceFingerprint } from "../../src/plans/computePlanSourceFingerprint.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import {
  createFloorFramingAreaObjectId,
  createSheathingAreaObjectId,
  createWallObjectId,
  createWallSegmentObjectId,
} from "../../src/scopes/framing/resolvers/ids.js";
import {
  extractedFramingEvidenceArtifactSchema,
  floorFramingArtifactSchema,
  framingCalculationsArtifactSchema,
  sheathingArtifactSchema,
  validationArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { buildEvidenceReplayInput } from "../../src/scopes/framing/stages/buildEvidenceReplayInput.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  FLOOR_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { createUserDecisionArtifact } from "../../src/ui/createUserDecisionArtifact.js";
import { buildRealisticResidentialInjectedEvidence } from "../fixtures/realisticResidentialInjectedEvidence.js";
import { materialLineItemId } from "../integration/liveFramingProofHelpers.js";

const FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/realistic-residential-framing-plan-text-layer.pdf",
);

const SHEATHING_AREA = createSheathingAreaObjectId("WALL SH A");
const FLOOR_AREA = createFloorFramingAreaObjectId("BAY A");
const WALL_SEGMENT = createWallSegmentObjectId(createWallObjectId("W1"));

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

/**
 * Stage 5 wrapper that counts extractor invocations and returns controlled
 * Evidence on first extraction. Production replay path is used unchanged when
 * evidenceReplay is supplied.
 */
function withCountedExtractor(
  productionStages: PipelineStage[],
  evidence: Evidence[],
  extractCallCount: { value: number },
): PipelineStage[] {
  const production = productionStages.find(
    (stage) => stage.name === "extractedEvidence",
  );
  assert.ok(production);

  return replaceStage(productionStages, "extractedEvidence", async (context) => {
    if (context.userDecisionRunInput?.evidenceReplay) {
      return production.run(context);
    }

    extractCallCount.value += 1;
    return createFramingStageArtifact(
      context,
      6,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence },
      { type: "system", identifier: "counted-extractor" },
    );
  });
}

describe("Milestone G — immutable Evidence replay for User Decision runs", () => {
  it("computes a stable plan-source fingerprint from page text", async () => {
    const planIndex = await indexPlan(FIXTURE_PDF);
    const first = computePlanSourceFingerprint(planIndex);
    const second = computePlanSourceFingerprint({
      ...planIndex,
      pdfPath: "/other/path/same-content.pdf",
      indexedAt: new Date().toISOString(),
    });
    assert.equal(first, second);
    assert.equal(first.length, 64);

    const altered = computePlanSourceFingerprint({
      ...planIndex,
      pages: planIndex.pages.map((page, index) =>
        index === 0
          ? { ...page, textContent: `${page.textContent}\nCHANGED` }
          : page,
      ),
    });
    assert.notEqual(first, altered);
  });

  it("Run-2 sheathing SF User Decision replays Evidence with zero extractor calls", async () => {
    const evidence = buildRealisticResidentialInjectedEvidence();
    const extractCallCount = { value: 0 };
    const productionStages = createFramingStages();
    const stages = withCountedExtractor(
      productionStages,
      evidence,
      extractCallCount,
    );

    const run1Root = await mkdtemp(path.join(tmpdir(), "g-sha-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "g-sha-r2-"));
    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const run1 = await new PipelineRunner(new ArtifactStore(run1Root)).run({
        projectId: "g-sha-r1",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
      });
      assert.equal(run1.success, true, run1.errors.join("\n"));
      assert.equal(extractCallCount.value, 1);

      const run1Evidence = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      const run1EvidenceIds = run1Evidence.payload.evidence.map((record) => record.id);
      const run1EvidenceClone = structuredClone(run1Evidence.payload);

      const run1Calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const run1StudQty = run1Calc.materials.find(
        (item) =>
          item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, WALL_SEGMENT),
      )?.quantity;

      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      );
      const sheathingSfReview = validation.payload.reviewItems.find(
        (item) =>
          item.affectedObjects.some((object) => object.objectId === SHEATHING_AREA) &&
          item.action.targetProperty === "areaSquareFeet",
      );
      assert.ok(sheathingSfReview);

      const decision: UserDecision = {
        id: "UD-G-SHEATHING-SF-001",
        reviewItemId: sheathingSfReview.id,
        result: {
          type: "value-provided",
          value: 1420,
          rationale: "Milestone G sheathing SF completion.",
        },
        supersedesUserDecisionId: null,
      };
      const written = createUserDecisionArtifact({
        projectId: "g-sha-r1",
        pipelineRunId: run1.pipelineRunId,
        validationArtifactId: validation.artifactId,
        decision,
      });

      const callsBeforeRun2 = extractCallCount.value;
      const run2 = await new PipelineRunner(new ArtifactStore(run2Root)).run({
        projectId: "g-sha-r2",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
        userDecisionRunInput: {
          userDecisions: [written.payload],
          reviewItemsById: new Map(
            validation.payload.reviewItems.map((item) => [item.id, item]),
          ),
          inputArtifactIds: [written.artifactId],
          evidenceReplay: buildEvidenceReplayInput({
            extractedEvidenceArtifact: run1Evidence,
            planIndex,
          }),
        },
      });
      assert.equal(run2.success, true, run2.errors.join("\n"));
      assert.equal(extractCallCount.value, callsBeforeRun2);
      assert.equal(extractCallCount.value, 1);

      // Run-1 Evidence artifact remains immutable on disk.
      const run1EvidenceAfter = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      assert.deepEqual(run1EvidenceAfter.payload, run1EvidenceClone);
      assert.equal(run1EvidenceAfter.artifactId, run1Evidence.artifactId);

      const run2Evidence = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      assert.notEqual(run2Evidence.artifactId, run1Evidence.artifactId);
      assert.equal(run2Evidence.pipelineRunId, run2.pipelineRunId);
      assert.equal(run2Evidence.producer.identifier, "extractedEvidence-replay");
      assert.ok(run2Evidence.inputArtifactIds.includes(run1Evidence.artifactId));
      assert.ok(run2Evidence.inputArtifactIds.includes(written.artifactId));
      assert.deepEqual(
        run2Evidence.payload.evidence.map((record) => record.id),
        run1EvidenceIds,
      );

      const run2Sheathing = sheathingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "sheathing")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const area = run2Sheathing.areas.find((entry) => entry.id === SHEATHING_AREA);
      assert.equal(area?.areaSquareFeet, 1420);
      const areaTrace = area?.resolutionTraces.find(
        (trace) => trace.propertyPath === "areaSquareFeet",
      );
      assert.equal(areaTrace?.method, "user-override");
      assert.deepEqual(areaTrace?.userDecisionIds, ["UD-G-SHEATHING-SF-001"]);
      assert.ok(areaTrace?.reviewItemIds.includes(sheathingSfReview.id));
      assert.equal(
        run2Sheathing.systems.find((system) => system.id === area?.parentSystemId)
          ?.application,
        "wall",
      );

      const run2Calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        run2Calc.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, SHEATHING_AREA),
        )?.quantity,
        1420,
      );

      // Corrected review is no longer open for areaSquareFeet.
      const run2Validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        run2Validation.reviewItems.find(
          (item) =>
            item.affectedObjects.some((object) => object.objectId === SHEATHING_AREA) &&
            item.action.targetProperty === "areaSquareFeet",
        ),
        undefined,
      );
      assert.equal(
        run2Validation.validationResults.find(
          (entry) =>
            entry.ruleId === "sheathing.area.areaSquareFeet.resolved" &&
            entry.target.kind === "object" &&
            entry.target.objectId === SHEATHING_AREA,
        )?.outcome,
        "passed",
      );

      // Blast radius: unrelated wall stud quantity unchanged.
      assert.equal(
        run2Calc.materials.find(
          (item) =>
            item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, WALL_SEGMENT),
        )?.quantity,
        run1StudQty,
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("Run-2 floor member-length User Decision also replays Evidence with zero extractor calls", async () => {
    const evidence = buildRealisticResidentialInjectedEvidence().filter(
      (record) => record.propertyPath !== "joistMemberLengthFeet",
    );
    const extractCallCount = { value: 0 };
    const stages = withCountedExtractor(
      createFramingStages(),
      evidence,
      extractCallCount,
    );

    const run1Root = await mkdtemp(path.join(tmpdir(), "g-floor-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "g-floor-r2-"));
    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const run1 = await new PipelineRunner(new ArtifactStore(run1Root)).run({
        projectId: "g-floor-r1",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
      });
      assert.equal(run1.success, true, run1.errors.join("\n"));
      assert.equal(extractCallCount.value, 1);

      const run1Floor = floorFramingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "floorFraming")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        run1Floor.areas.find((area) => area.id === FLOOR_AREA)?.joistMemberLengthFeet,
        null,
      );

      const run1Calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        run1Calc.materials.find(
          (item) =>
            item.id === materialLineItemId(FLOOR_QUANTITY_KEYS.joists, FLOOR_AREA),
        )?.quantity,
        16,
      );
      assert.equal(
        run1Calc.materials.find(
          (item) =>
            item.id ===
            materialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, FLOOR_AREA),
        ),
        undefined,
      );

      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      );
      const memberReview = validation.payload.reviewItems.find(
        (item) =>
          item.affectedObjects.some((object) => object.objectId === FLOOR_AREA) &&
          item.action.targetProperty === "joistMemberLengthFeet",
      );
      assert.ok(memberReview);

      const run1Evidence = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      const decision: UserDecision = {
        id: "UD-G-FLOOR-MEMBER-001",
        reviewItemId: memberReview.id,
        result: {
          type: "value-provided",
          value: 12,
          rationale: "Milestone G floor member length completion.",
        },
        supersedesUserDecisionId: null,
      };
      const written = createUserDecisionArtifact({
        projectId: "g-floor-r1",
        pipelineRunId: run1.pipelineRunId,
        validationArtifactId: validation.artifactId,
        decision,
      });

      const callsBeforeRun2 = extractCallCount.value;
      const run2 = await new PipelineRunner(new ArtifactStore(run2Root)).run({
        projectId: "g-floor-r2",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
        userDecisionRunInput: {
          userDecisions: [written.payload],
          reviewItemsById: new Map(
            validation.payload.reviewItems.map((item) => [item.id, item]),
          ),
          inputArtifactIds: [written.artifactId],
          evidenceReplay: buildEvidenceReplayInput({
            extractedEvidenceArtifact: run1Evidence,
            planIndex,
          }),
        },
      });
      assert.equal(run2.success, true, run2.errors.join("\n"));
      assert.equal(extractCallCount.value, callsBeforeRun2);

      const run2Floor = floorFramingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "floorFraming")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const bay = run2Floor.areas.find((area) => area.id === FLOOR_AREA);
      assert.equal(bay?.joistMemberLengthFeet, 12);
      assert.equal(
        bay?.resolutionTraces.find(
          (trace) => trace.propertyPath === "joistMemberLengthFeet",
        )?.method,
        "user-override",
      );

      const run2Calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        run2Calc.materials.find(
          (item) =>
            item.id ===
            materialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, FLOOR_AREA),
        )?.quantity,
        192,
      );
      assert.equal(
        run2Calc.materials.find(
          (item) =>
            item.id === materialLineItemId(FLOOR_QUANTITY_KEYS.joists, FLOOR_AREA),
        )?.quantity,
        16,
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("rejects Evidence replay when the source plan fingerprint no longer matches", async () => {
    const evidence = buildRealisticResidentialInjectedEvidence();
    const extractCallCount = { value: 0 };
    const stages = withCountedExtractor(
      createFramingStages(),
      evidence,
      extractCallCount,
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "g-stale-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "g-stale-r2-"));
    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const run1 = await new PipelineRunner(new ArtifactStore(run1Root)).run({
        projectId: "g-stale-r1",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
      });
      assert.equal(run1.success, true, run1.errors.join("\n"));

      const run1Evidence = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      );
      const review = validation.payload.reviewItems.find(
        (item) =>
          item.affectedObjects.some((object) => object.objectId === SHEATHING_AREA) &&
          item.action.targetProperty === "areaSquareFeet",
      );
      assert.ok(review);
      const written = createUserDecisionArtifact({
        projectId: "g-stale-r1",
        pipelineRunId: run1.pipelineRunId,
        validationArtifactId: validation.artifactId,
        decision: {
          id: "UD-G-STALE-001",
          reviewItemId: review.id,
          result: {
            type: "value-provided",
            value: 1420,
            rationale: "stale-source proof",
          },
          supersedesUserDecisionId: null,
        },
      });

      const staleFingerprint = createHash("sha256")
        .update("not-the-plan")
        .digest("hex");
      const run2 = await new PipelineRunner(new ArtifactStore(run2Root)).run({
        projectId: "g-stale-r2",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
        userDecisionRunInput: {
          userDecisions: [written.payload],
          reviewItemsById: new Map(
            validation.payload.reviewItems.map((item) => [item.id, item]),
          ),
          inputArtifactIds: [written.artifactId],
          evidenceReplay: {
            artifact: run1Evidence,
            sourcePlanFingerprint: staleFingerprint,
          },
        },
      });
      assert.equal(run2.success, false);
      assert.match(
        run2.errors.join("\n"),
        /source plan fingerprint changed/i,
      );
      assert.equal(extractCallCount.value, 1);
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });
});
