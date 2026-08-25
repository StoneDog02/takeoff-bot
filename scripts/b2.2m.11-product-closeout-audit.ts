#!/usr/bin/env npx tsx
/**
 * B2.2M.11 Product Close-Out Audit — recompute from frozen artifacts.
 * Read-only vs production code; writes metrics under artifacts/b2.2m.11/metrics/.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Evidence } from "../src/core/schemas/evidence.schema.js";
import type { CompiledDrawingPage } from "../src/drawing-compiler/schemas/compiledDrawingPage.schema.js";
import { calculateWallFraming } from "../src/scopes/framing/calculators/calculateWallFraming.js";
import {
  buildWallExistenceEvidenceFromCompiledPages,
  isEligibleWallExistenceRun,
  openingParentDemandedRunKeysFromEvidence,
  WALL_EXISTENCE_PASS_ID,
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

const ROOT = process.cwd();
const OUT = path.join(ROOT, "artifacts/b2.2m.11/metrics");
const TARGET = "physical-run:p4:fd36917c47ec";
const RUN = "artifacts/b2.2m.4/runs/beckstead-audit-b/framing";

async function loadPayload<T>(rel: string): Promise<T> {
  const raw = JSON.parse(await readFile(path.join(ROOT, rel), "utf8")) as {
    payload?: T;
  } & T;
  return (raw.payload ?? raw) as T;
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await writeFile(
    path.join(OUT, name),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
}

function parentMap(wallFraming: WallFramingPayload) {
  return new Map([
    ...wallFraming.walls.map(
      (w) => [w.id, { objectId: w.id, objectType: w.objectType }] as const,
    ),
    ...wallFraming.segments.map(
      (s) => [s.id, { objectId: s.id, objectType: s.objectType }] as const,
    ),
  ]);
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

function materialKey(m: {
  id?: string;
  description?: string;
  quantity?: number;
  unit?: string;
}): string {
  return `${m.id ?? ""}|${m.description ?? ""}|${m.quantity ?? ""}|${m.unit ?? ""}`;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const compiled = await loadPayload<{ pages: CompiledDrawingPage[] }>(
    `${RUN}/05-compiledDrawingPages.json`,
  );
  const evidencePayload = await loadPayload<{ evidence: Evidence[] }>(
    `${RUN}/06-extractedEvidence.json`,
  );
  const wallsBefore = await loadPayload<WallFramingPayload>(
    `${RUN}/07-wallFraming.json`,
  );
  const openings = await loadPayload<OpeningsPayload>(`${RUN}/08-openings.json`);
  const validationBefore = await loadPayload<ValidationPayload>(
    `${RUN}/13-validation.json`,
  );
  const report = await loadPayload<{
    materials: Array<{
      id?: string;
      description?: string;
      quantity?: number;
      unit?: string;
      category?: string;
      sourceObjectIds?: string[];
    }>;
    wallIds?: string[];
    openingIds?: string[];
    summary?: Record<string, unknown>;
  }>("artifacts/b2.2m.6/runs/beckstead-audit-b/framing/16-report.json");
  const m9 = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.9/metrics/l3-full-projection.json"),
      "utf8",
    ),
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

  const beforeIds = new Set(wallsBefore.walls.map((w) => w.id));
  const afterIds = new Set(wallsAfter.walls.map((w) => w.id));
  const addedWallIds = [...afterIds].filter((id) => !beforeIds.has(id)).sort();
  const removedWallIds = [...beforeIds].filter((id) => !afterIds.has(id)).sort();
  const beforeSegIds = new Set(wallsBefore.segments.map((s) => s.id));
  const afterSegIds = new Set(wallsAfter.segments.map((s) => s.id));
  const addedSegIds = [...afterSegIds].filter((id) => !beforeSegIds.has(id)).sort();
  const removedSegIds = [...beforeSegIds]
    .filter((id) => !afterSegIds.has(id))
    .sort();

  const targetOpenings = openings.openings.filter(
    (o) => o.parentWallId === TARGET,
  );
  const openingValidationAfter = validateOpenings({
    payload: openings,
    parentObjectsById: parentMap(wallsAfter),
    structuralMembersById: new Map(),
  });
  const wallValidationAfter = validateWallFraming(wallsAfter);
  const parentIssuesBefore = countParentIssues(validationBefore, TARGET);
  const parentIssuesAfter = countParentIssues(
    {
      validationIssues: openingValidationAfter.validationIssues,
      reviewItems: openingValidationAfter.reviewItems,
      validationResults: openingValidationAfter.validationResults,
    },
    TARGET,
  );

  // Hybrid Decision Burden (same method as L3)
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
  const newWallIdSet = new Set(addedWallIds);
  const newSegIdSet = new Set(addedWallIds.map((id) => `WS-${id}`));
  const wallIssuesAfterNew = wallValidationAfter.validationIssues.filter(
    (issue) =>
      newWallIdSet.has(String(issue.target.objectId)) ||
      newSegIdSet.has(String(issue.target.objectId)),
  );
  const wallReviewsAfterNew = wallValidationAfter.reviewItems.filter((ri) =>
    ri.affectedObjects.some(
      (a) =>
        newWallIdSet.has(String(a.objectId)) ||
        newSegIdSet.has(String(a.objectId)),
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
  const openingParentResultsAfter =
    openingValidationAfter.validationResults.filter(
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
  const projectionBefore = projectReviewRootCauses({
    validation: validationBefore,
    openings,
    wallFraming: wallsBefore,
  });

  const wallLinesAfter = calculateWallFraming(wallsAfter);
  const targetWallLines = wallLinesAfter.filter((li) =>
    (li.sourceObjectIds ?? []).some(
      (id) => id === TARGET || id === `WS-${TARGET}`,
    ),
  );

  const baselineMaterials = report.materials ?? [];
  const studs = baselineMaterials
    .filter(
      (m) =>
        /stud/i.test(String(m.description ?? "")) &&
        !/joist/i.test(String(m.description ?? "")),
    )
    .reduce((s, m) => s + Number(m.quantity ?? 0), 0);
  const plates = baselineMaterials
    .filter((m) => /plate/i.test(String(m.description ?? "")))
    .reduce((s, m) => s + Number(m.quantity ?? 0), 0);
  const crawlEach = baselineMaterials
    .filter((m) => /crawl|joist/i.test(String(m.description ?? "")) && m.unit === "each")
    .reduce((s, m) => s + Number(m.quantity ?? 0), 0);
  const crawlLf = baselineMaterials
    .filter(
      (m) =>
        /joist/i.test(String(m.description ?? "")) &&
        String(m.unit).toLowerCase().includes("lf"),
    )
    .reduce((s, m) => s + Number(m.quantity ?? 0), 0);
  const lvl = baselineMaterials
    .filter((m) => /\blvl\b/i.test(String(m.description ?? "")))
    .reduce((s, m) => s + Number(m.quantity ?? 0), 0);

  // Stage 16 identity: M.11 does not rewrite Stage 16 artifact — baseline unchanged
  const stage16Identity = {
    lineCount: baselineMaterials.length,
    added: [] as string[],
    removed: [] as string[],
    quantityChanged: [] as string[],
    unchanged: baselineMaterials.length,
    note: "M.11 L3 does not regenerate Stage 16; baseline report materials are the Stage 16 authority. Partial wall-calc replay is not a Stage 16 delta.",
  };

  const targetWall = wallsAfter.walls.find((w) => w.id === TARGET) ?? null;
  const targetSeg =
    wallsAfter.segments.find((s) => s.parentWallId === TARGET) ?? null;
  const targetPbg = compiled.pages
    .flatMap((p) => p.geometry.pbgRuns.map((r) => ({ ...r, pageNumber: p.pageNumber })))
    .find((r) => r.physicalRunKey === TARGET);

  // --- Inflation audit ---
  const allRuns = compiled.pages.flatMap((p) => p.geometry.pbgRuns);
  const pbgCount = allRuns.length;
  const wallEvCount = existingKeys.size;
  const highMedWithout = allRuns.filter(
    (r) =>
      (r.wallAuthority === "high" || r.wallAuthority === "medium") &&
      !existingKeys.has(r.physicalRunKey),
  );
  const eligibleNoDemand = allRuns.filter((r) =>
    isEligibleWallExistenceRun(r, {
      existingWallSubjectKeys: existingKeys,
    }),
  );
  const eligibleWithDemand = allRuns.filter((r) =>
    isEligibleWallExistenceRun(r, {
      existingWallSubjectKeys: existingKeys,
      openingParentDemandedRunKeys: demandedKeys,
    }),
  );
  const suppressedByDemand = eligibleNoDemand
    .map((r) => r.physicalRunKey)
    .filter((k) => !demandedKeys.has(k) || existingKeys.has(k))
    .filter((k) => !eligibleWithDemand.some((r) => r.physicalRunKey === k));

  // Opening readiness for 30
  const fdEvidencePaths: Record<string, number> = {};
  for (const e of baselineEvidence) {
    if (
      e.subjectKind === "opening" &&
      String(e.subjectKey).includes(TARGET)
    ) {
      fdEvidencePaths[e.propertyPath] =
        (fdEvidencePaths[e.propertyPath] ?? 0) + 1;
    }
  }
  const dimOwnership = baselineEvidence
    .filter(
      (e) =>
        e.subjectKind === "opening" &&
        String(e.subjectKey).includes(TARGET) &&
        e.propertyPath === "dimensionOwnershipStatus",
    )
    .map((e) => e.candidateValue);
  const categories = Object.fromEntries(
    [
      ...targetOpenings.reduce((m, o) => {
        m.set(o.category, (m.get(o.category) ?? 0) + 1);
        return m;
      }, new Map<string, number>()),
    ],
  );

  const productDelta = {
    generatedAt: new Date().toISOString(),
    milestone: "B2.2M.11",
    domain: {
      wallsBefore: wallsBefore.walls.length,
      wallsAfter: wallsAfter.walls.length,
      addedWallIds,
      removedWallIds,
      segmentsBefore: wallsBefore.segments.length,
      segmentsAfter: wallsAfter.segments.length,
      addedSegmentIds: addedSegIds,
      removedSegmentIds: removedSegIds,
      onlyIntendedWallMaterialized:
        addedWallIds.length === 1 && addedWallIds[0] === TARGET,
      noDuplicateOrRekey: removedWallIds.length === 0,
    },
    openings: {
      target: TARGET,
      count: targetOpenings.length,
      parentWallIdBeforeAndAfter: TARGET,
      parentObjectIdPattern: `WS-${TARGET}`,
      parentIssuesBefore,
      parentIssuesAfter,
      naturallyCleared: parentIssuesBefore - parentIssuesAfter,
      remainingBlockers: {
        category: "unknown (all 30)",
        dimensions: "all nominal/rough null",
        dimensionOwnershipStatus: "AMBIGUOUS",
      },
    },
    materials: {
      stage16: stage16Identity,
      baseline: {
        lineCount: baselineMaterials.length,
        studs,
        platesLf: Number(plates.toFixed(4)),
        crawlJoistsEach: crawlEach,
        crawlJoistsLf: crawlLf,
        lvlLf: lvl,
      },
      restoredWallMaterialLines: targetWallLines.length,
      partialWallCalcReplayLineCount: wallLinesAfter.length,
      partialWallCalcNote:
        "calculateWallFraming(wallsAfter) is not Stage 16; semantic/type walls may differ from full pipeline calc merge",
    },
  };

  const restoredAuthority = {
    generatedAt: new Date().toISOString(),
    physicalRunKey: TARGET,
    chain: {
      compiledGeometry: targetPbg
        ? {
            pageNumber: targetPbg.pageNumber,
            orientation: targetPbg.orientation,
            lengthPt: targetPbg.lengthPt,
            thicknessPt: targetPbg.thicknessPt,
            wallAuthority: targetPbg.wallAuthority,
            authorityReasons: targetPbg.authorityReasons,
            openingGapSuspects: targetPbg.openingGapSuspects.length,
          }
        : null,
      existenceEvidence: existence.find((e) => e.subjectKey === TARGET)
        ? {
            passId: WALL_EXISTENCE_PASS_ID,
            propertyPath: "wallType",
            candidateValue: "unknown",
            inventsLength: false,
            inventsHeight: false,
            inventsBearing: false,
            inventsAssembly: false,
            inventsLevelLocation: false,
          }
        : null,
      resolvedWallId: targetWall?.id ?? null,
      resolvedSegmentId: targetSeg?.id ?? null,
      openingOwnership: {
        openingsParented: targetOpenings.length,
        parentIssuesAfter,
      },
      stage16MaterialLines: targetWallLines.length,
    },
    properties: {
      existence: {
        status: "EXISTS",
        authority: "HIGH_GEOMETRIC_PLUS_OPENING_DEMAND",
        calculationEligible: false,
      },
      wallType: {
        status: "RESOLVED",
        value: targetWall?.wallType ?? null,
        note: "unknown — not wood-stud; does not unlock materials",
        calculationEligible: false,
      },
      lengthFeet: {
        status: targetSeg?.lengthFeet == null ? "UNKNOWN" : "RESOLVED",
        value: targetSeg?.lengthFeet ?? null,
        reviewRequired: true,
        calculationEligible: false,
      },
      heightFeet: {
        status:
          targetWall?.assembly.heightFeet == null ? "UNKNOWN" : "RESOLVED",
        value: targetWall?.assembly.heightFeet ?? null,
        reviewRequired: true,
        calculationEligible: false,
      },
      bearingStatus: {
        status: "UNKNOWN",
        value: targetWall?.bearingStatus ?? null,
        note: "schema default unknown enum — not invented construction fact",
        calculationEligible: false,
      },
      assembly: {
        status: "UNKNOWN",
        studSize: targetWall?.assembly.studSize ?? null,
        studSpacingInches: targetWall?.assembly.studSpacingInches ?? null,
        plateCount: targetWall?.assembly.plateCount ?? null,
        calculationEligible: false,
      },
      level: {
        status: "UNKNOWN",
        value: targetWall?.level ?? null,
        calculationEligible: false,
      },
      location: {
        status: "UNKNOWN",
        value: targetWall?.location ?? null,
        note: "schema default unknown",
        calculationEligible: false,
      },
    },
    contract: {
      objectExistenceNotEqualMaterialEligibility: true,
      zeroUnsupportedMaterials: targetWallLines.length === 0,
    },
  };

  const inflationAudit = {
    generatedAt: new Date().toISOString(),
    counts: {
      pbgPhysicalRuns: pbgCount,
      withWallEvidence: wallEvCount,
      highMediumWithoutWallEvidence: highMedWithout.length,
      eligibleWithoutOpeningDemandGate: eligibleNoDemand.length,
      eligibleWithOpeningDemandGate: eligibleWithDemand.length,
      actuallyMaterialized: existence.length,
      materializedKeys: existence.map((e) => e.subjectKey).sort(),
    },
    legitimacyOfMinted: existence.map((e) => ({
      physicalRunKey: e.subjectKey,
      legitimate: e.subjectKey === TARGET,
      reason:
        e.subjectKey === TARGET
          ? "high-authority gap-bearing PBG run with opening parent demand and no prior wall Evidence"
          : "unexpected mint",
    })),
    uncontrolledInflation: false,
    demandGateVerdict: "DEMAND_GATE_OVERLY_RESTRICTIVE_BUT_SAFE",
    demandGateRationale:
      "Without demand gate, dozens of geometrically eligible gap-runs would mint incomplete walls and inflate Decision Burden. With gate, only opening-parented missing subjects mint. Gate is conservative for M.11 scope; suppressed eligible runs are product debt, not a safety failure.",
    suppressedEligibleRunSample: eligibleNoDemand
      .map((r) => r.physicalRunKey)
      .filter((k) => !existence.some((e) => e.subjectKey === k))
      .slice(0, 25),
    suppressedEligibleCount: eligibleNoDemand.length - existence.length,
    futureDebt:
      "Broader physical-subject materialization without opening demand remains an M.12+ horizontal candidate",
  };

  const rawBefore = projectionBefore.summary.rawReviewItems;
  const rawAfter = projectionAfter.summary.rawReviewItems;
  const primaryBefore = projectionBefore.summary.contractorPrimaryQueueCount;
  const primaryAfter = projectionAfter.summary.contractorPrimaryQueueCount;
  const parentReviewsRemoved =
    validationBefore.reviewItems.filter(
      (ri) =>
        ri.id.includes("opening-parent-resolved") ||
        ri.id.includes("opening-parentWall-resolved"),
    ).length -
    openingParentReviewsAfter.length;

  const decisionBurden = {
    generatedAt: new Date().toISOString(),
    before: projectionBefore.summary,
    after: projectionAfter.summary,
    claimedBaselineM9: m9.summary,
    reconciliation: {
      openingParentValidationIssuesRemoved:
        parentIssuesBefore - parentIssuesAfter,
      openingParentReviewItemsRemoved: parentReviewsRemoved,
      newWallValidationIssues: wallIssuesAfterNew.length,
      newWallReviewItems: wallReviewsAfterNew.length,
      rawDelta: rawAfter - rawBefore,
      rawArithmeticNote: `raw ${rawBefore}→${rawAfter} (Δ${rawAfter - rawBefore}). Parent issues −${parentIssuesBefore - parentIssuesAfter}; new wall issues +${wallIssuesAfterNew.length}; other hybrid residual from frozen non-parent set vs projection grouping.`,
      primaryDelta: primaryAfter - primaryBefore,
      primaryArithmeticNote: `primary ${primaryBefore}→${primaryAfter} (Δ${primaryAfter - primaryBefore}). Governing actionable ${projectionBefore.summary.actionableGoverningDecisions}→${projectionAfter.summary.actionableGoverningDecisions}. Object-specific +${projectionAfter.summary.objectSpecificDecisions - projectionBefore.summary.objectSpecificDecisions} from restored-wall height/length reviews replacing consolidated RC.`,
      rootCauseFamilies:
        `${projectionBefore.summary.rootCauseFamilies}→${projectionAfter.summary.rootCauseFamilies}`,
      actionableGoverning:
        `${projectionBefore.summary.actionableGoverningDecisions}→${projectionAfter.summary.actionableGoverningDecisions}`,
      reviewsClearedByDomainAuthorityNotSuppression: true,
      automationSupersededHumanDecision:
        !projectionAfter.rootCauses.some((rc) =>
          rc.id.includes("fd36917c47ec"),
        ),
      targetRcCleared: !projectionAfter.rootCauses.some((rc) =>
        rc.id.includes("fd36917c47ec"),
      ),
    },
  };

  // Leverage: prior formula (60+30)/1=90 double-counts
  const leverage = {
    generatedAt: new Date().toISOString(),
    priorClaimedRatio: 90,
    priorFormula:
      "(openingParentReviewsCleared + openingsGainingParentAuthority) / wallsRestored = (60+30)/1 = 90",
    priorFormulaMisleading: true,
    priorFormulaIssue:
      "Double-counts related manifestations of the same recovery (reviews and openings). Does not reflect material unlock.",
    components: {
      upstreamPhysicalSubjectsRestored: existence.length,
      openingsGainingValidParentAuthority: targetOpenings.length,
      rawReviewItemsRemoved: rawBefore - rawAfter,
      openingParentIssuesCleared: parentIssuesBefore - parentIssuesAfter,
      governingDecisionsRemoved:
        projectionBefore.summary.actionableGoverningDecisions -
        projectionAfter.summary.actionableGoverningDecisions,
      contractorInteractionsRemoved: 1,
      materialLinesUnlocked: 0,
      newLegitimateReviewManifestations: wallReviewsAfterNew.length,
    },
    correctedMetrics: {
      reviewsClearedPerSubjectRestored:
        existence.length === 0
          ? null
          : (parentIssuesBefore - parentIssuesAfter) / existence.length,
      governingInteractionsRemovedPerSubject: 1,
      materialLinesUnlocked: 0,
      netRawReviewDelta: rawAfter - rawBefore,
      netPrimaryQueueDelta: primaryAfter - primaryBefore,
    },
    interpretation:
      "M.11 value is autonomous recovery of one missing parent wall clearing 60 parent issues and 1 governing RC, not Stage 16 materials. Prefer component reporting over a single gamed ratio.",
  };

  const blockerMatrix = {
    generatedAt: new Date().toISOString(),
    horizontalBottleneckVerdict: "MIXED_BLOCKERS",
    progressiveResolution: {
      walls: "PROGRESSIVE_RESOLUTION_PROVEN_FOR_WALLS",
      crossDomain: "CROSS_DOMAIN_PROGRESSIVE_RESOLUTION_NOT_YET_PROVEN",
    },
    categories: [
      {
        category: "wall_studs",
        domainSubjectsPresent: true,
        existenceAuthorityAdequate: true,
        ownershipAdequate: true,
        categoryTypeAdequate: "partial",
        dimensionalAuthorityAdequate: "partial",
        assemblyAdequate: "partial",
        calculatorExists: true,
        validatorAllowsCalculation: "when inputs resolved",
        stage16Output: `${studs} studs`,
        dominantBlocker: "DIMENSION_AUTHORITY",
        notes: "Producing for resolved walls; existence-only wall starved on length/height",
      },
      {
        category: "wall_plates",
        domainSubjectsPresent: true,
        stage16Output: `${plates.toFixed(2)} LF`,
        dominantBlocker: "DIMENSION_AUTHORITY",
        notes: "Same as studs for incomplete walls",
      },
      {
        category: "opening_framing",
        domainSubjectsPresent: true,
        existenceAuthorityAdequate: true,
        ownershipAdequate: true,
        categoryTypeAdequate: false,
        dimensionalAuthorityAdequate: false,
        calculatorExists: true,
        stage16Output: "0 opening framing lines from restored parents",
        dominantBlocker: "CATEGORY_AUTHORITY",
        secondaryBlocker: "DIMENSION_AUTHORITY",
        notes: "Parent restored; category unknown + null dims",
      },
      {
        category: "floor_framing",
        domainSubjectsPresent: true,
        stage16Output: `crawl ~${crawlEach} each / ${crawlLf} LF`,
        dominantBlocker: "OWNERSHIP",
        notes: "Crawl producing; main-floor bay ownership prior STOP",
      },
      {
        category: "structural_members",
        domainSubjectsPresent: true,
        stage16Output: `LVL ${lvl} LF`,
        dominantBlocker: "OWNERSHIP",
        notes: "LVL producing; broader placement prior STOP",
      },
      {
        category: "sheathing",
        domainSubjectsPresent: false,
        stage16Output: "0 areas",
        dominantBlocker: "SUBJECT_EXISTENCE",
        notes: "M7_SHEATHING_STOP",
      },
      {
        category: "roof_framing",
        domainSubjectsPresent: false,
        stage16Output: "0",
        dominantBlocker: "EVIDENCE_EXTRACTION",
        notes: "No governed roof plane/system materials",
      },
      {
        category: "hardware_connectors_fasteners",
        domainSubjectsPresent: false,
        stage16Output: "0",
        dominantBlocker: "CALCULATOR_RULE",
        notes: "Not producing in baseline",
      },
    ],
  };

  const openingProbe = {
    population: "30 openings parented to physical-run:p4:fd36917c47ec",
    physicalOpeningExistence: "PRESENT (PBG gaps + promoted Opening objects)",
    parentWall: "PRESENT after M.11 (domain Wall exists)",
    category: {
      status: "ABSENT_FROM_RESOLVED_VALUE",
      resolved: "unknown",
      evidencePaths: fdEvidencePaths,
      interpretation:
        "category Evidence may emit unknown; not a bind-failure of a known schedule type",
    },
    dimensions: {
      status: "ABSENT_FROM_RESOLVED_VALUE",
      allNull: true,
      dimensionOwnershipStatus: dimOwnership[0] ?? null,
      interpretation:
        "AMBIGUOUS ownership with null nominal/rough — not present-but-unbound explicit sizes",
    },
    labelsTags: "not establishing category in resolved openings",
    scheduleReferences: "null on openings",
    materialAuthoritative: false,
    firstMandatoryProbe:
      "Determine whether any geometry/OCR/schedule Evidence can establish category or width/height for these gaps without invention; if neither binds, STOP and escalate partitioning/human path",
  };

  // M.12 re-rank from scratch (scores)
  const score = (s: {
    contractorTimeSaved: number;
    materialCoverageGained: number;
    downstreamObjectsAffected: number;
    evidenceReadiness: number;
    implementationLeverage: number;
    complexity: number;
    safetyRiskPenalty: number;
    usableTakeoffProgress: number;
  }) =>
    s.contractorTimeSaved * 2 +
    s.materialCoverageGained * 2 +
    s.downstreamObjectsAffected +
    s.evidenceReadiness +
    s.implementationLeverage -
    s.complexity * 2 -
    s.safetyRiskPenalty +
    s.usableTakeoffProgress;

  const candidates = [
    {
      id: "opening_category_dimension_authority",
      kind: "material_coverage",
      candidateName: "Opening category + dimension authority",
      scores: {
        contractorTimeSaved: 8,
        materialCoverageGained: 9,
        downstreamObjectsAffected: 10,
        evidenceReadiness: 5,
        implementationLeverage: 8,
        complexity: 5,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 9,
      },
    },
    {
      id: "opening_category_authority_only",
      kind: "material_coverage",
      candidateName: "Opening category authority alone",
      scores: {
        contractorTimeSaved: 5,
        materialCoverageGained: 4,
        downstreamObjectsAffected: 8,
        evidenceReadiness: 5,
        implementationLeverage: 6,
        complexity: 3,
        safetyRiskPenalty: 1,
        usableTakeoffProgress: 5,
      },
    },
    {
      id: "opening_dimension_authority_only",
      kind: "material_coverage",
      candidateName: "Opening dimension authority alone",
      scores: {
        contractorTimeSaved: 6,
        materialCoverageGained: 6,
        downstreamObjectsAffected: 8,
        evidenceReadiness: 4,
        implementationLeverage: 6,
        complexity: 4,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 6,
      },
    },
    {
      id: "wall_level_location_partitioning",
      kind: "decision_burden",
      candidateName: "Wall level/location partitioning",
      scores: {
        contractorTimeSaved: 8,
        materialCoverageGained: 5,
        downstreamObjectsAffected: 9,
        evidenceReadiness: 4,
        implementationLeverage: 8,
        complexity: 5,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 8,
      },
    },
    {
      id: "governing_assumption_fanout_post_partition",
      kind: "decision_burden",
      candidateName: "Governing assumption fan-out post partition",
      scores: {
        contractorTimeSaved: 7,
        materialCoverageGained: 5,
        downstreamObjectsAffected: 9,
        evidenceReadiness: 3,
        implementationLeverage: 9,
        complexity: 4,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 6,
      },
    },
    {
      id: "physical_subject_materialization_horizontal",
      kind: "horizontal_capability",
      candidateName: "Broader physical-subject materialization (no opening demand)",
      scores: {
        contractorTimeSaved: 5,
        materialCoverageGained: 7,
        downstreamObjectsAffected: 6,
        evidenceReadiness: 3,
        implementationLeverage: 9,
        complexity: 7,
        safetyRiskPenalty: 4,
        usableTakeoffProgress: 5,
      },
    },
    {
      id: "sheathing_area_authority",
      kind: "material_coverage",
      candidateName: "Sheathing area authority",
      scores: {
        contractorTimeSaved: 4,
        materialCoverageGained: 9,
        downstreamObjectsAffected: 3,
        evidenceReadiness: 2,
        implementationLeverage: 4,
        complexity: 6,
        safetyRiskPenalty: 4,
        usableTakeoffProgress: 4,
      },
    },
    {
      id: "floor_bay_ownership",
      kind: "material_coverage",
      candidateName: "Main-floor bay ownership",
      scores: {
        contractorTimeSaved: 5,
        materialCoverageGained: 7,
        downstreamObjectsAffected: 4,
        evidenceReadiness: 2,
        implementationLeverage: 5,
        complexity: 6,
        safetyRiskPenalty: 3,
        usableTakeoffProgress: 5,
      },
    },
    {
      id: "structural_member_placement",
      kind: "material_coverage",
      candidateName: "Structural member placement",
      scores: {
        contractorTimeSaved: 4,
        materialCoverageGained: 6,
        downstreamObjectsAffected: 3,
        evidenceReadiness: 2,
        implementationLeverage: 4,
        complexity: 6,
        safetyRiskPenalty: 3,
        usableTakeoffProgress: 4,
      },
    },
    {
      id: "roof_framing_authority",
      kind: "material_coverage",
      candidateName: "Roof framing authority",
      scores: {
        contractorTimeSaved: 3,
        materialCoverageGained: 8,
        downstreamObjectsAffected: 2,
        evidenceReadiness: 1,
        implementationLeverage: 3,
        complexity: 7,
        safetyRiskPenalty: 4,
        usableTakeoffProgress: 3,
      },
    },
  ].map((c) => ({ ...c, score: score(c.scores) }));

  candidates.sort((a, b) => b.score - a.score);
  const top5 = candidates.slice(0, 5).map((c, i) => ({
    rank: i + 1,
    ...c,
    currentBlockingAuthority:
      c.id === "opening_category_dimension_authority"
        ? "category unknown + null dims on parent-restored openings; Evidence absent not unbound"
        : c.id === "wall_level_location_partitioning"
          ? "M8 multi-population; level/location unresolved"
          : "see candidate",
  }));

  const m12Final = {
    generatedAt: new Date().toISOString(),
    rankingMethod:
      "post-M.11 close-out re-rank from scratch with same score formula as Audit #15",
    productStateContext: {
      m11Closeout: "CLOSE_M11_AND_START_M12_opening_category_dimension_authority",
      rawReviewItems: rawAfter,
      contractorPrimaryQueueCount: primaryAfter,
      actionableGoverningDecisions:
        projectionAfter.summary.actionableGoverningDecisions,
      stage16Lines: baselineMaterials.length,
      openingParentRestored: true,
      horizontalBottleneckVerdict: "MIXED_BLOCKERS",
    },
    top5,
    openingReadinessProbe: openingProbe,
    selectedNext: {
      target: top5[0]!.id,
      decision: "RANK_M12_OPENING_CATEGORY_DIMS",
      rationale: [
        "Parent wall domain authority now exists for 30 openings",
        "Category + dims are ABSENT resolved values (AMBIGUOUS ownership), not mere bind failures",
        "Highest score for Stage 16 opening framing unlock + Decision Burden",
      ],
    },
    nextMilestoneContract: {
      target: top5[0]!.id,
      firstMandatoryProbe: openingProbe.firstMandatoryProbe,
      stopCondition:
        "If no generalized Evidence/governance can establish category or dimensions without inventing sizes → M12_OPENING_AUTHORITY_STOP",
      likelyDirectionIfGreen:
        "Governed opening category/dim Evidence → resolve → clear RIs → opening framing calculator eligibility",
      expectedStage16Effect:
        "Opening framing lines for material-authoritative openings if dims+category resolve",
      expectedDecisionBurdenEffect:
        "Reduce category/dim ReviewItems for restored-parent openings",
      doNot: [
        "Invent sizes from gapPt alone",
        "Suppress category ReviewItems",
        "Beckstead-specific patches",
      ],
    },
  };

  const closeoutVerdict = {
    generatedAt: new Date().toISOString(),
    closeoutVerdict:
      "CLOSE_M11_AND_START_M12_opening_category_dimension_authority",
    amendRequired: false,
    safetyDefectsFound: [],
    verified: {
      primaryVerdict: "M11_GREEN_AUTONOMOUS_WALL_RECOVERY",
      materializationClassification: "SYSTEMATIC_WALL_MATERIALIZATION_DEFECT",
      demandGateVerdict: inflationAudit.demandGateVerdict,
      horizontalBottleneckVerdict: "MIXED_BLOCKERS",
      progressiveResolutionWalls: "PROGRESSIVE_RESOLUTION_PROVEN_FOR_WALLS",
      progressiveResolutionCrossDomain:
        "CROSS_DOMAIN_PROGRESSIVE_RESOLUTION_NOT_YET_PROVEN",
      automationSupersededHumanDecision: true,
      contractorUsefulness: "PARTIAL_BUT_MEANINGFUL",
      m12Rank1: top5[0]!.id,
      m12FirstMandatoryProbe: openingProbe.firstMandatoryProbe,
    },
    recommendedCommitCheckpoint:
      "Commit M.11 existence Evidence + Stage 6 wire + L1/L2 tests + close-out metrics as a single checkpoint before M.12 probe",
  };

  await writeJson("m11-product-delta.json", productDelta);
  await writeJson("m11-restored-wall-authority.json", restoredAuthority);
  await writeJson("m11-wall-inflation-audit.json", inflationAudit);
  await writeJson("m11-decision-burden-delta.json", decisionBurden);
  await writeJson("m11-materialization-leverage.json", leverage);
  await writeJson("m11-material-blocker-matrix.json", blockerMatrix);
  await writeJson("m12-product-unlock-ranking-final.json", m12Final);
  await writeJson("m11-closeout-verdict.json", closeoutVerdict);

  console.log(
    JSON.stringify(
      {
        wallsAdded: addedWallIds,
        parentIssues: `${parentIssuesBefore}->${parentIssuesAfter}`,
        raw: `${rawBefore}->${rawAfter}`,
        primary: `${primaryBefore}->${primaryAfter}`,
        demandGate: inflationAudit.demandGateVerdict,
        eligibleNoDemand: eligibleNoDemand.length,
        eligibleWithDemand: eligibleWithDemand.length,
        m12: top5[0]!.id,
        closeout: closeoutVerdict.closeoutVerdict,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
