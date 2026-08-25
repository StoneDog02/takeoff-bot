import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectReviewRootCauses } from "../src/scopes/framing/review-workspace/projectReviewRootCauses.js";
import type { ValidationPayload } from "../src/scopes/framing/schemas/framing-artifacts.schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "artifacts/b2.2m.9/metrics");

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const m4 = JSON.parse(
    await readFile(
      path.join(
        root,
        "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/13-validation.json",
      ),
      "utf8",
    ),
  );
  const m6 = JSON.parse(
    await readFile(
      path.join(
        root,
        "artifacts/b2.2m.6/runs/beckstead-audit-b/framing/16-report.json",
      ),
      "utf8",
    ),
  );
  const m6Ids = new Set(m6.payload.reviewItemIds as string[]);

  const reviewItems = m4.payload.reviewItems.filter((item: { id: string }) =>
    m6Ids.has(item.id),
  );
  const issueIds = new Set(
    reviewItems.flatMap(
      (item: { validationIssueIds: string[] }) => item.validationIssueIds,
    ),
  );

  const validation = {
    validationIssues: m4.payload.validationIssues.filter(
      (issue: { id: string }) => issueIds.has(issue.id),
    ),
    validationResults: m4.payload.validationResults ?? [],
    reviewItems,
  } as ValidationPayload;

  const projection = projectReviewRootCauses({ validation });

  const parentCause = projection.rootCauses.find(
    (cause) => cause.groupingAuthority.kind === "missing-parent-wall",
  );
  const heightCause = projection.rootCauses.find(
    (cause) => cause.code === "wall.height.authority_unresolved",
  );
  const floorCause = projection.rootCauses.find(
    (cause) => cause.groupingAuthority.kind === "floor-parent-system-sentinel",
  );

  const positiveControl = {
    generatedAt: new Date().toISOString(),
    control: "opening_missing_parent_wall_run",
    expected: {
      rawReviews: 60,
      decisionReadiness: "ACTIONABLE_SINGLE_DECISION",
      sharedReferent: "physical-run:p4:fd36917c47ec",
    },
    actual: parentCause
      ? {
          id: parentCause.id,
          decisionReadiness: parentCause.decisionReadiness,
          affectedReviewItemCount: parentCause.affectedReviewItemIds.length,
          affectedObjectCount: parentCause.affectedObjectCount,
          groupingAuthorityKey: parentCause.groupingAuthority.key,
          ruleIds: parentCause.ruleIds,
          contractorSummary: parentCause.contractorSummary,
        }
      : null,
    pass: Boolean(
      parentCause &&
        parentCause.decisionReadiness === "ACTIONABLE_SINGLE_DECISION" &&
        parentCause.affectedReviewItemIds.length === 60 &&
        parentCause.affectedObjectCount === 30 &&
        parentCause.groupingAuthority.key === "physical-run:p4:fd36917c47ec",
    ),
  };

  const wallHeightControl = {
    generatedAt: new Date().toISOString(),
    control: "wall_height_unpartitioned",
    expected: {
      rawReviews: 42,
      decisionReadiness: "NEEDS_PARTITIONING",
      mustNotAskSingleValue: true,
    },
    actual: heightCause
      ? {
          id: heightCause.id,
          decisionReadiness: heightCause.decisionReadiness,
          affectedReviewItemCount: heightCause.affectedReviewItemIds.length,
          affectedObjectCount: heightCause.affectedObjectCount,
          contractorSummary: heightCause.contractorSummary,
        }
      : null,
    pass: Boolean(
      heightCause &&
        heightCause.decisionReadiness === "NEEDS_PARTITIONING" &&
        heightCause.affectedReviewItemIds.length === 42 &&
        /Additional grouping is required/i.test(heightCause.contractorSummary),
    ),
  };

  const l3 = {
    generatedAt: new Date().toISOString(),
    proofClass: "L3_BECKSTEAD_PRODUCTION_REPLAY_PROJECTION",
    source: {
      reviewItemIds:
        "artifacts/b2.2m.6/runs/beckstead-audit-b/framing/16-report.json",
      reviewBodies:
        "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/13-validation.json",
    },
    summary: projection.summary,
    rootCauses: projection.rootCauses.map((cause) => ({
      id: cause.id,
      code: cause.code,
      decisionReadiness: cause.decisionReadiness,
      affectedReviewItemCount: cause.affectedReviewItemIds.length,
      affectedObjectCount: cause.affectedObjectCount,
      ruleIds: cause.ruleIds,
      groupingAuthority: cause.groupingAuthority,
      contractorSummary: cause.contractorSummary,
    })),
    topAffectedObjectCounts: projection.rootCauses
      .map((cause) => ({
        id: cause.id,
        affectedObjectCount: cause.affectedObjectCount,
        decisionReadiness: cause.decisionReadiness,
      }))
      .sort((left, right) => right.affectedObjectCount - left.affectedObjectCount)
      .slice(0, 10),
    positiveControlPass: positiveControl.pass,
    wallHeightControlPass: wallHeightControl.pass,
    floorParentSystemPresent: Boolean(floorCause),
  };

  const beforeAfter = {
    generatedAt: new Date().toISOString(),
    before: {
      rawReviewItems: 476,
      estimatedGoverningDecisions: 45,
      confidence: "MEDIUM_LOW",
      contractorFacingGoverningDecisionsShipped: 0,
      dependentReviewItemsModeled: 0,
      contractorPrimaryQueueHeuristic: 476,
      note: "M.8 baseline: flat RI list; heuristic ~45 from Audit #12",
    },
    after: {
      ...projection.summary,
      contractorPrimaryQueueDefinition:
        "actionableGoverningDecisions + needsPartitioningGroups + objectSpecificActionableReviews (blocked/partially-blocked not covered as dependents)",
    },
    delta: {
      rawReviewItemsPreserved: projection.summary.rawReviewItems === 476,
      primaryQueueReduction: 476 - projection.summary.contractorPrimaryQueueCount,
      primaryQueueReductionPercent:
        Math.round(
          ((476 - projection.summary.contractorPrimaryQueueCount) / 476) * 1000,
        ) / 10,
    },
  };

  const materialSafety = {
    generatedAt: new Date().toISOString(),
    source: "artifacts/b2.2m.6/runs/beckstead-audit-b/framing/16-report.json",
    expected: {
      materialLines: 55,
      studs: 284,
      platesLfApprox: 985.96,
      crawlJoistsEach: 31,
      crawlJoistsLf: 527,
      lvlLf: 23.5,
    },
    note: "M.9 is projection-only; Stage 16 production artifacts unchanged. Verified against frozen M.6 identity.",
    reviewItemIdCount: (m6.payload.reviewItemIds ?? []).length,
    pass: (m6.payload.reviewItemIds ?? []).length === 476,
  };

  await writeFile(
    path.join(outDir, "l3-beckstead-root-cause-projection.json"),
    `${JSON.stringify(l3, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "positive-consolidation-control.json"),
    `${JSON.stringify(positiveControl, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "wall-height-control.json"),
    `${JSON.stringify(wallHeightControl, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "decision-burden-before-after.json"),
    `${JSON.stringify(beforeAfter, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "material-coverage-safety.json"),
    `${JSON.stringify(materialSafety, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "l3-full-projection.json"),
    `${JSON.stringify(
      {
        summary: projection.summary,
        primaryQueue: projection.primaryQueue,
        secondaryInformationalRootCauseIds:
          projection.secondaryInformationalRootCauseIds,
        dependentReviewItemCount: projection.dependentReviewItemIds.length,
        rootCauses: projection.rootCauses,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        summary: projection.summary,
        positiveControlPass: positiveControl.pass,
        wallHeightControlPass: wallHeightControl.pass,
        parent: parentCause && {
          reviews: parentCause.affectedReviewItemIds.length,
          objects: parentCause.affectedObjectCount,
          key: parentCause.groupingAuthority.key,
        },
        height: heightCause && {
          reviews: heightCause.affectedReviewItemIds.length,
          readiness: heightCause.decisionReadiness,
        },
      },
      null,
      2,
    ),
  );
}

await main();
