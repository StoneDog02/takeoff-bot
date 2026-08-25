#!/usr/bin/env npx tsx
/**
 * B2.2M.11 L3 — Beckstead production proof via frozen artifact replay.
 *
 * Appends existence Evidence to frozen Stage 6 evidence, re-resolves walls,
 * re-validates openings against the new wall map, projects root causes.
 * Does not re-run Claude or modify Burton source.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Evidence } from "../src/core/schemas/evidence.schema.js";
import type { CompiledDrawingPage } from "../src/drawing-compiler/schemas/compiledDrawingPage.schema.js";
import { calculateWallFraming } from "../src/scopes/framing/calculators/calculateWallFraming.js";
import {
  buildWallExistenceEvidenceFromCompiledPages,
  openingParentDemandedRunKeysFromEvidence,
  wallSubjectKeysFromEvidence,
} from "../src/scopes/framing/geometry/buildWallExistenceEvidenceFromCompiledPages.js";
import { projectReviewRootCauses } from "../src/scopes/framing/review-workspace/projectReviewRootCauses.js";
import { resolveWallFraming } from "../src/scopes/framing/resolvers/resolveWallFraming.js";
import type {
  OpeningsPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { validateOpenings } from "../src/scopes/framing/validators/openings.validator.js";
import { validateWallFraming } from "../src/scopes/framing/validators/wall-framing.validator.js";
import { mergeValidationBatches } from "../src/scopes/framing/validators/mergeValidationBatch.js";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "artifacts/b2.2m.11/metrics");
const TARGET = "physical-run:p4:fd36917c47ec";

const PATHS = {
  compiled:
    "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/05-compiledDrawingPages.json",
  evidence:
    "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/06-extractedEvidence.json",
  wallsBefore:
    "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/07-wallFraming.json",
  openings:
    "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/08-openings.json",
  validationBefore:
    "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/13-validation.json",
  report:
    "artifacts/b2.2m.6/runs/beckstead-audit-b/framing/16-report.json",
  m9Projection:
    "artifacts/b2.2m.9/metrics/l3-full-projection.json",
};

async function loadPayload<T>(rel: string): Promise<T> {
  const raw = JSON.parse(await readFile(path.join(ROOT, rel), "utf8")) as {
    payload?: T;
  } & T;
  return (raw.payload ?? raw) as T;
}

function parentMap(wallFraming: WallFramingPayload) {
  return new Map(
    [
      ...wallFraming.walls.map(
        (wall) =>
          [
            wall.id,
            { objectId: wall.id, objectType: wall.objectType },
          ] as const,
      ),
      ...wallFraming.segments.map(
        (segment) =>
          [
            segment.id,
            { objectId: segment.id, objectType: segment.objectType },
          ] as const,
      ),
    ],
  );
}

function countParentIssues(validation: ValidationPayload, runKey: string): number {
  return validation.validationIssues.filter(
    (issue) =>
      (issue.ruleId === "opening.parent.resolved" ||
        issue.ruleId === "opening.parentWall.resolved") &&
      (issue.explanation.includes(runKey) ||
        issue.explanation.includes(`WS-${runKey}`)),
  ).length;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const compiled = await loadPayload<{ pages: CompiledDrawingPage[] }>(
    PATHS.compiled,
  );
  const evidencePayload = await loadPayload<{ evidence: Evidence[] }>(
    PATHS.evidence,
  );
  const wallsBefore = await loadPayload<WallFramingPayload>(PATHS.wallsBefore);
  const openings = await loadPayload<OpeningsPayload>(PATHS.openings);
  const validationBefore = await loadPayload<ValidationPayload>(
    PATHS.validationBefore,
  );
  const report = await loadPayload<{
    materials: Array<{
      quantity?: number;
      unit?: string;
      category?: string;
      description?: string;
      sourceObjectIds?: string[];
    }>;
    summary?: Record<string, unknown>;
  }>(PATHS.report);
  const m9 = JSON.parse(
    await readFile(path.join(ROOT, PATHS.m9Projection), "utf8"),
  ) as { summary: Record<string, number> };

  const baselineEvidence = evidencePayload.evidence;
  const existingKeys = wallSubjectKeysFromEvidence(baselineEvidence);
  const demandedKeys = openingParentDemandedRunKeysFromEvidence(baselineEvidence);
  const existence = buildWallExistenceEvidenceFromCompiledPages(compiled.pages, {
    existingWallSubjectKeys: existingKeys,
    openingParentDemandedRunKeys: demandedKeys,
  });
  const afterEvidence = [...baselineEvidence, ...existence];

  const wallsAfter = resolveWallFraming(afterEvidence);
  const addedWallIds = wallsAfter.walls
    .map((w) => w.id)
    .filter((id) => !wallsBefore.walls.some((w) => w.id === id))
    .sort();
  const removedWallIds = wallsBefore.walls
    .map((w) => w.id)
    .filter((id) => !wallsAfter.walls.some((w) => w.id === id))
    .sort();

  const openingValidationAfter = validateOpenings({
    payload: openings,
    parentObjectsById: parentMap(wallsAfter),
    structuralMembersById: new Map(),
  });
  const wallValidationAfter = validateWallFraming(wallsAfter);

  // Hybrid Decision Burden: keep non-opening-parent / non-new-wall issues from
  // frozen validation; replace opening parent + wall framing issues for after.
  const frozenNonParentOpening = validationBefore.validationIssues.filter(
    (issue) =>
      issue.ruleId !== "opening.parent.resolved" &&
      issue.ruleId !== "opening.parentWall.resolved",
  );
  const frozenNonParentReviews = validationBefore.reviewItems.filter(
    (ri) =>
      !ri.id.includes("opening-parent-resolved") &&
      !ri.id.includes("opening-parentWall-resolved"),
  );
  const frozenNonParentResults = validationBefore.validationResults.filter(
    (result) =>
      result.ruleId !== "opening.parent.resolved" &&
      result.ruleId !== "opening.parentWall.resolved",
  );

  // Drop frozen wall framing issues for walls that did not exist before —
  // none — and keep prior wall issues; append after wall validation for NEW walls only.
  const newWallIdSet = new Set(addedWallIds);
  const newSegIdSet = new Set(addedWallIds.map((id) => `WS-${id}`));
  const wallIssuesAfterNew = wallValidationAfter.validationIssues.filter(
    (issue) =>
      newWallIdSet.has(String(issue.target.objectId)) ||
      newSegIdSet.has(String(issue.target.objectId)),
  );
  const wallReviewsAfterNew = wallValidationAfter.reviewItems.filter((ri) =>
    ri.affectedObjects.some(
      (a) => newWallIdSet.has(String(a.objectId)) || newSegIdSet.has(String(a.objectId)),
    ),
  );
  const wallResultsAfterNew = wallValidationAfter.validationResults.filter(
    (result) =>
      newWallIdSet.has(String(result.target.objectId)) ||
      newSegIdSet.has(String(result.target.objectId)),
  );

  const openingParentIssuesAfter = openingValidationAfter.validationIssues.filter(
    (issue) =>
      issue.ruleId === "opening.parent.resolved" ||
      issue.ruleId === "opening.parentWall.resolved",
  );
  const openingParentReviewsAfter = openingValidationAfter.reviewItems.filter(
    (ri) =>
      ri.id.includes("opening-parent-resolved") ||
      ri.id.includes("opening-parentWall-resolved"),
  );
  const openingParentResultsAfter = openingValidationAfter.validationResults.filter(
    (result) =>
      result.ruleId === "opening.parent.resolved" ||
      result.ruleId === "opening.parentWall.resolved",
  );

  const validationAfter: ValidationPayload = {
    validationIssues: [
      ...frozenNonParentOpening,
      ...openingParentIssuesAfter,
      ...wallIssuesAfterNew,
    ],
    reviewItems: [
      ...frozenNonParentReviews,
      ...openingParentReviewsAfter,
      ...wallReviewsAfterNew,
    ],
    validationResults: [
      ...frozenNonParentResults,
      ...openingParentResultsAfter,
      ...wallResultsAfterNew,
    ],
  };

  const projectionAfter = projectReviewRootCauses({
    validation: validationAfter,
    openings,
    wallFraming: wallsAfter,
  });

  const targetOpenings = openings.openings.filter(
    (o) => o.parentWallId === TARGET,
  );
  const parentIssuesBefore = countParentIssues(validationBefore, TARGET);
  const parentIssuesAfter = countParentIssues(validationAfter, TARGET);

  const wallLinesAfter = calculateWallFraming(wallsAfter);
  const targetWallLines = wallLinesAfter.filter((li) =>
    (li.sourceObjectIds ?? []).some(
      (id) => id === TARGET || id === `WS-${TARGET}`,
    ),
  );

  const baselineMaterials = report.materials ?? [];
  const studsBefore = baselineMaterials
    .filter((m) => /stud/i.test(String(m.description ?? m.category ?? "")))
    .reduce((s, m) => s + (Number(m.quantity) || 0), 0);

  const rcTargetBefore = "RC-missing-parent-wall-physical-run:p4:fd36917c47ec";
  const rcStillPresent = projectionAfter.rootCauses.some(
    (rc) => rc.id === rcTargetBefore || rc.id.includes("fd36917c47ec"),
  );

  const targetWall = wallsAfter.walls.find((w) => w.id === TARGET) ?? null;
  const targetSeg =
    wallsAfter.segments.find((s) => s.parentWallId === TARGET) ?? null;

  const proof = {
    generatedAt: new Date().toISOString(),
    milestone: "B2.2M.11",
    verdictCandidate: rcStillPresent
      ? "M11_MISSING_WALL_STOP"
      : "M11_GREEN_AUTONOMOUS_WALL_RECOVERY",
    materializationClassification: "SYSTEMATIC_WALL_MATERIALIZATION_DEFECT",
    target: TARGET,
    existenceMint: {
      mintedSubjectCount: existence.length,
      mintedSubjectKeys: existence.map((e) => e.subjectKey).sort(),
      includesTarget: existence.some((e) => e.subjectKey === TARGET),
    },
    wallDelta: {
      before: wallsBefore.walls.length,
      after: wallsAfter.walls.length,
      added: addedWallIds,
      removed: removedWallIds,
      targetPresent: targetWall != null,
      targetProvenancePassId: existence.find((e) => e.subjectKey === TARGET)
        ?.extractionPassId,
      targetWallType: targetWall?.wallType ?? null,
      targetHeightFeet: targetWall?.assembly.heightFeet ?? null,
      targetLengthFeet: targetSeg?.lengthFeet ?? null,
    },
    openingDelta: {
      targetOpeningCount: targetOpenings.length,
      parentIssuesBefore,
      parentIssuesAfter,
      openingsGainingLiveParent: targetOpenings.length,
      remainingBlockers:
        "category unknown + null nominal/rough dimensions (not cleared by M.11)",
    },
    decisionBurden: {
      baselineM9: m9.summary,
      after: projectionAfter.summary,
      targetRcCleared: !rcStillPresent,
      automationSupersededHumanDecision: !rcStillPresent,
      openingParentIssuesCleared: parentIssuesBefore - parentIssuesAfter,
    },
    materialDelta: {
      baselineLineCount: baselineMaterials.length,
      afterWallCalculatorLines: wallLinesAfter.length,
      targetWallMaterialLines: targetWallLines.length,
      note:
        "Existence walls remain calculator-starved without governed length/height; Stage 16 material unlock not required for GREEN.",
      baselineStudQtyApprox: studsBefore,
    },
    materializationLeverage: {
      wallsRestored: addedWallIds.length,
      openingParentReviewsCleared: Math.max(0, parentIssuesBefore - parentIssuesAfter),
      openingsGainingParentAuthority: targetWall ? targetOpenings.length : 0,
      materialLinesAffected: targetWallLines.length,
      contractorInteractionsRemoved: rcStillPresent ? 0 : 1,
      ratio:
        addedWallIds.length === 0
          ? null
          : Number(
              (
                (Math.max(0, parentIssuesBefore - parentIssuesAfter) +
                  (targetWall ? targetOpenings.length : 0)) /
                addedWallIds.length
              ).toFixed(2),
            ),
    },
    inflationAudit: {
      newlyMintedWalls: addedWallIds.length,
      newWallValidationIssues: wallIssuesAfterNew.length,
      newWallReviewItems: wallReviewsAfterNew.length,
      note:
        "Generalized existence mint with gap+authority corroboration; measure Decision Burden impact of new incomplete walls.",
    },
  };

  await writeFile(
    path.join(OUT, "l3-beckstead-proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT, "l3-wall-delta.json"),
    `${JSON.stringify(
      {
        addedWallIds,
        removedWallIds,
        targetWall,
        targetSeg,
        existenceEvidenceIds: existence.map((e) => e.id),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const md = `# M.11 L3 Beckstead Proof

## Verdict candidate

\`${proof.verdictCandidate}\`

## Wall / domain delta

- Walls before → after: **${proof.wallDelta.before} → ${proof.wallDelta.after}** (+${addedWallIds.length})
- Target \`${TARGET}\` present: **${proof.wallDelta.targetPresent}**
- wallType=\`${proof.wallDelta.targetWallType}\`, height=\`${proof.wallDelta.targetHeightFeet}\`, length=\`${proof.wallDelta.targetLengthFeet}\`
- Provenance pass: \`${proof.wallDelta.targetProvenancePassId}\`

## Opening delta

- Target openings: ${proof.openingDelta.targetOpeningCount}
- Parent/parentWall issues: **${parentIssuesBefore} → ${parentIssuesAfter}**
- Remaining blockers: ${proof.openingDelta.remainingBlockers}

## Decision Burden

- Baseline (M.9): raw=${m9.summary.rawReviewItems}, primary=${m9.summary.contractorPrimaryQueueCount}, actionableGoverning=${m9.summary.actionableGoverningDecisions}
- After: raw=${projectionAfter.summary.rawReviewItems}, primary=${projectionAfter.summary.contractorPrimaryQueueCount}, actionableGoverning=${projectionAfter.summary.actionableGoverningDecisions}
- Target RC cleared: **${!rcStillPresent}**
- Automation superseded human decision: **${!rcStillPresent}**

## Material delta

- Baseline Stage 16 lines: ${baselineMaterials.length}
- Target wall material lines after: ${targetWallLines.length}
- ${proof.materialDelta.note}

## materializationLeverage

\`\`\`json
${JSON.stringify(proof.materializationLeverage, null, 2)}
\`\`\`

## Inflation audit

Newly minted walls: ${addedWallIds.length}; new wall RIs: ${wallReviewsAfterNew.length}.
`;

  await writeFile(path.join(OUT, "l3-beckstead-proof.md"), md, "utf8");
  console.log(JSON.stringify({
    verdict: proof.verdictCandidate,
    wallsAdded: addedWallIds.length,
    targetPresent: proof.wallDelta.targetPresent,
    parentIssues: `${parentIssuesBefore}->${parentIssuesAfter}`,
    rcCleared: !rcStillPresent,
    primaryQueue: `${m9.summary.contractorPrimaryQueueCount}->${projectionAfter.summary.contractorPrimaryQueueCount}`,
    raw: `${m9.summary.rawReviewItems}->${projectionAfter.summary.rawReviewItems}`,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
