#!/usr/bin/env npx tsx
/**
 * B2.2M.12 close-out: Audit #16, advisory M.13 ranking, Full MVP Coverage Audit.
 * Follows M12_MVP_VALUE_STOP — no production code changes.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "artifacts/b2.2m.12/metrics");
const REPORT = path.join(ROOT, "artifacts/b2.2m.12/REPORT.md");

async function writeJson(name: string, data: unknown): Promise<void> {
  await writeFile(
    path.join(OUT, name),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
}

async function writeMd(rel: string, body: string): Promise<void> {
  const p = path.isAbsolute(rel) ? rel : path.join(OUT, rel);
  await writeFile(p, body.endsWith("\n") ? body : `${body}\n`, "utf8");
}

function scoreCandidate(s: {
  contractorTimeSaved: number;
  materialCoverageGained: number;
  downstreamObjectsAffected: number;
  evidenceReadiness: number;
  implementationLeverage: number;
  complexity: number;
  safetyRiskPenalty: number;
  usableTakeoffProgress: number;
}): number {
  return (
    s.contractorTimeSaved +
    s.materialCoverageGained +
    s.downstreamObjectsAffected +
    s.evidenceReadiness +
    s.implementationLeverage +
    s.usableTakeoffProgress -
    s.complexity -
    s.safetyRiskPenalty
  );
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const probe = JSON.parse(
    await readFile(path.join(OUT, "opening-authority-probe.json"), "utf8"),
  );
  const gate = JSON.parse(
    await readFile(path.join(OUT, "mvp-product-value-gate.json"), "utf8"),
  );
  const m11Blockers = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.11/metrics/m11-material-blocker-matrix.json"),
      "utf8",
    ),
  );
  const m11Burden = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.11/metrics/m11-decision-burden-delta.json"),
      "utf8",
    ),
  );
  const stage16 = JSON.parse(
    await readFile(
      path.join(
        ROOT,
        "artifacts/b2.2m.6/runs/beckstead-audit-b/framing/16-report.json",
      ),
      "utf8",
    ),
  ) as { payload?: { materials?: Array<{ description?: string; quantity?: number; unit?: string; canonicalClassification?: string }> }; materials?: unknown[] };
  const materials =
    stage16.payload?.materials ??
    (stage16 as { materials?: typeof stage16.payload.materials }).materials ??
    [];
  const burton = JSON.parse(
    await readFile(
      path.join(ROOT, "benchmarks/beckstead/normalized/burton-takeoff.normalized.json"),
      "utf8",
    ),
  ) as {
    lines: Array<{
      normalizedCategory?: string;
      normalizedFamily?: string;
      description?: string;
      quantity?: number;
      unit?: string;
    }>;
  };

  const studQty = materials
    .filter((m) => (m.canonicalClassification ?? "").includes("stud") || /stud/i.test(m.description ?? ""))
    .filter((m) => !/king|jack|cripple/i.test(m.description ?? ""))
    .reduce((a, m) => a + (m.quantity ?? 0), 0);
  const plateLf = materials
    .filter((m) => /plate/i.test(m.description ?? "") || (m.canonicalClassification ?? "").includes("plate"))
    .reduce((a, m) => a + (m.quantity ?? 0), 0);
  const joistLines = materials.filter((m) => /joist/i.test(m.description ?? ""));
  const lvlLines = materials.filter((m) => /lvl|beam/i.test(m.description ?? ""));
  const openingFramingLines = materials.filter((m) =>
    /king|jack|cripple|rough-sill|header/i.test(m.description ?? ""),
  );

  // --- Audit #16 ---
  const audit16 = {
    generatedAt: new Date().toISOString(),
    milestone: "B2.2M.12",
    primaryVerdict: "M12_MVP_VALUE_STOP",
    productState: {
      rawReviewItems: m11Burden.after?.rawReviewItems ?? 424,
      contractorPrimaryQueueCount:
        m11Burden.after?.contractorPrimaryQueueCount ?? 277,
      actionableGoverningDecisions:
        m11Burden.after?.actionableGoverningDecisions ?? 0,
      stage16Lines: materials.length,
      studs: studQty,
      platesLfApprox: Math.round(plateLf * 100) / 100,
      crawlJoistLines: joistLines.length,
      lvlLines: lvlLines.length,
      openingFramingLines: openingFramingLines.length,
      note: "Stage 16 unchanged by M.12 (no BUILD). Baseline from b2.2m.6 audit-b report (55 lines).",
    },
    openingAuthority: {
      probe: "artifacts/b2.2m.12/metrics/opening-authority-probe.json",
      categoryClassification: probe.categoryClassification,
      dimensionClassification: probe.dimensionClassification,
      progressiveResolution: probe.progressiveResolution,
      mvpGate: gate.outcome,
    },
    blockerLandscape: {
      beforeM12: m11Blockers.categories,
      afterM12: "UNCHANGED — no production implementation",
      openingFramingStillBlockedBy: [
        "CATEGORY_AUTHORITY (geometry gaps)",
        "DIMENSION_AUTHORITY (AMBIGUOUS / absent)",
        "WALL_HEIGHT / ASSEMBLY (restored parent)",
        "PARENT_MISSING (semantic openings)",
        "GARAGE_DOOR_INELIGIBLE",
        "JACK_COUNT / HEADER",
      ],
      horizontalBottleneckVerdict: "MIXED_BLOCKERS",
      note: "Authority work deferred for MVP value, not because authority was impossible",
    },
    decisionBurden: {
      deltaFromM11: "none — no domain resolution changes",
      raw: m11Burden.after?.rawReviewItems ?? 424,
      primary: m11Burden.after?.contractorPrimaryQueueCount ?? 277,
    },
    regression: {
      productionCodeChanged: false,
      stage16Unchanged: true,
      verdict: "NO_M12_PRODUCTION_REGRESSION",
    },
  };
  await writeJson("AUDIT16-PRODUCT-LOOP.json", audit16);
  await writeMd(
    "AUDIT16-PRODUCT-LOOP.md",
    `# Audit #16 — Product Loop after M.12

## Verdict

\`M12_MVP_VALUE_STOP\`

M.12 completed the mandatory opening authority probe and **MVP PRODUCT-VALUE GATE**. Implementation was **not** authorized. Stage 16 and Decision Burden remain at the M.11 baseline.

## Why STOP (successful)

- Effort class: \`LOW_MATERIAL_VALUE_SUBSTANTIAL_EFFORT\`
- Contractor proximity: \`MARGINALLY\`
- Gates A/B/C: **not proven**
- Expected Stage 16 if built: **0**
- Remaining downstream blockers would still prevent opening framing materials

Authority improvement was technically imaginable (PATH E) but would primarily increase **metadata completeness**, not contractor-usable takeoff coverage.

## Blocker landscape

Unchanged from M.11 \`MIXED_BLOCKERS\`. Opening framing still blocked by category/dimension authority **plus** wall height/assembly, orphan parents, garage-door eligibility, and jack/header facts.

## Next mandatory step

\`FULL_MVP_COVERAGE_AUDIT\` — not automatic M.13.
`,
  );

  // --- Advisory M.13 ranking ---
  const candidates = [
    {
      id: "wall_height_population_partitioning",
      kind: "decision_burden",
      candidateName: "Wall height / level population partitioning",
      scores: {
        contractorTimeSaved: 9,
        materialCoverageGained: 8,
        downstreamObjectsAffected: 10,
        evidenceReadiness: 5,
        implementationLeverage: 9,
        complexity: 6,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 9,
      },
      currentBlockingAuthority: "Unresolved height populations starve walls + openings",
    },
    {
      id: "floor_framing_main_bay_ownership",
      kind: "material_coverage",
      candidateName: "Main-floor bay ownership / floor framing completion",
      scores: {
        contractorTimeSaved: 8,
        materialCoverageGained: 9,
        downstreamObjectsAffected: 8,
        evidenceReadiness: 4,
        implementationLeverage: 7,
        complexity: 6,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 9,
      },
      currentBlockingAuthority: "Crawl partial; main floor ownership prior STOP",
    },
    {
      id: "sheathing_subject_existence",
      kind: "material_coverage",
      candidateName: "Sheathing subject existence + SF authority",
      scores: {
        contractorTimeSaved: 7,
        materialCoverageGained: 9,
        downstreamObjectsAffected: 7,
        evidenceReadiness: 3,
        implementationLeverage: 6,
        complexity: 5,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 8,
      },
      currentBlockingAuthority: "M7_SHEATHING_STOP — subjects absent",
    },
    {
      id: "opening_framing_continuation_post_wall_height",
      kind: "material_coverage",
      candidateName: "Opening framing continuation (after wall height)",
      scores: {
        contractorTimeSaved: 6,
        materialCoverageGained: 7,
        downstreamObjectsAffected: 8,
        evidenceReadiness: 4,
        implementationLeverage: 6,
        complexity: 5,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 6,
      },
      currentBlockingAuthority: "M12 deferred; still needs height + cat/dims + jacks",
    },
    {
      id: "roof_framing_evidence_extraction",
      kind: "material_coverage",
      candidateName: "Roof framing evidence / plane authority",
      scores: {
        contractorTimeSaved: 6,
        materialCoverageGained: 8,
        downstreamObjectsAffected: 6,
        evidenceReadiness: 2,
        implementationLeverage: 5,
        complexity: 7,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 7,
      },
      currentBlockingAuthority: "No governed roof plane materials",
    },
    {
      id: "structural_header_lvl_placement",
      kind: "material_coverage",
      candidateName: "Structural header / LVL placement ownership",
      scores: {
        contractorTimeSaved: 5,
        materialCoverageGained: 6,
        downstreamObjectsAffected: 6,
        evidenceReadiness: 5,
        implementationLeverage: 5,
        complexity: 5,
        safetyRiskPenalty: 2,
        usableTakeoffProgress: 6,
      },
      currentBlockingAuthority: "Partial LVL; broader placement ownership",
    },
    {
      id: "hardware_calculator_rules",
      kind: "material_coverage",
      candidateName: "Hardware / connectors calculator rules",
      scores: {
        contractorTimeSaved: 4,
        materialCoverageGained: 5,
        downstreamObjectsAffected: 4,
        evidenceReadiness: 2,
        implementationLeverage: 3,
        complexity: 6,
        safetyRiskPenalty: 1,
        usableTakeoffProgress: 4,
      },
      currentBlockingAuthority: "CALCULATOR_RULE — not producing",
    },
    {
      id: "schedule_to_plan_binding_horizontal",
      kind: "horizontal",
      candidateName: "Schedule ↔ plan object binding (horizontal)",
      scores: {
        contractorTimeSaved: 5,
        materialCoverageGained: 5,
        downstreamObjectsAffected: 9,
        evidenceReadiness: 3,
        implementationLeverage: 8,
        complexity: 7,
        safetyRiskPenalty: 3,
        usableTakeoffProgress: 5,
      },
      currentBlockingAuthority: "No door/window schedule on Beckstead; generic capability unproven for MVP",
    },
  ].map((c) => ({
    ...c,
    score: scoreCandidate(c.scores),
  }));

  candidates.sort((a, b) => b.score - a.score);
  const ranked = candidates.map((c, i) => ({ rank: i + 1, ...c }));

  const m13 = {
    generatedAt: new Date().toISOString(),
    rankingStatus: "ADVISORY_PENDING_FULL_MVP_COVERAGE_AUDIT",
    rankingMethod:
      "Post-M.12 advisory re-rank from scratch (same score formula). NOT an authorization to start M.13.",
    doNotAutoStartM13: true,
    nextMandatoryRoadmapStep: "FULL_MVP_COVERAGE_AUDIT",
    m12Verdict: "M12_MVP_VALUE_STOP",
    productStateContext: audit16.productState,
    top5: ranked.slice(0, 5),
    allCandidates: ranked,
  };
  await writeJson("m13-product-unlock-ranking-advisory.json", m13);
  await writeFile(
    path.join(
      ROOT,
      "benchmarks/beckstead/comparisons/m13-product-unlock-ranking-advisory.json",
    ),
    `${JSON.stringify(m13, null, 2)}\n`,
    "utf8",
  );

  // --- Full MVP Coverage Audit ---
  const burtonByCat = burton.lines.reduce<Record<string, number>>((acc, l) => {
    const c = l.normalizedCategory ?? "unknown";
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});

  const packages = [
    {
      package: "wall_framing",
      engineStatus: "PARTIAL_PRODUCING",
      stage16Signal: `${studQty} studs; ~${Math.round(plateLf * 100) / 100} LF plates`,
      burtonScopeReference: "wall-framing stud/plate lines present",
      dominantBlocker: "DIMENSION_AUTHORITY / height population on incomplete walls",
      contractorValueGap: "medium — core walls producing but incomplete walls starve openings",
    },
    {
      package: "opening_framing",
      engineStatus: "ABSENT_FROM_STAGE16",
      stage16Signal: "0 opening framing lines",
      burtonScopeReference: "opening-framing headers + related structural LVL",
      dominantBlocker:
        "CATEGORY + DIMENSION + WALL_HEIGHT + PARENT/JACK/HEADER (M.12 deferred for MVP value)",
      contractorValueGap: "high for complete takeoff; not near-term without wall height",
    },
    {
      package: "floor_framing",
      engineStatus: "PARTIAL_PRODUCING",
      stage16Signal: `${joistLines.length} joist material line(s) (crawl path)`,
      burtonScopeReference: "floor-framing joists + floor sheathing",
      dominantBlocker: "OWNERSHIP — main-floor bay",
      contractorValueGap: "high — main floor missing vs crawl-only",
    },
    {
      package: "structural_members",
      engineStatus: "PARTIAL_PRODUCING",
      stage16Signal: `${lvlLines.length} LVL/beam line(s)`,
      burtonScopeReference: "structural-member beam/post + opening headers",
      dominantBlocker: "OWNERSHIP / placement breadth",
      contractorValueGap: "medium",
    },
    {
      package: "sheathing",
      engineStatus: "ABSENT",
      stage16Signal: "0 sheathing areas",
      burtonScopeReference: "sheathing + floor-sheathing families",
      dominantBlocker: "SUBJECT_EXISTENCE",
      contractorValueGap: "high",
    },
    {
      package: "roof_framing",
      engineStatus: "ABSENT",
      stage16Signal: "0 roof materials",
      burtonScopeReference: "roof-truss package (scope diff) + stick roof if any",
      dominantBlocker: "EVIDENCE_EXTRACTION",
      contractorValueGap: "high (or truss-package scope decision)",
    },
    {
      package: "hardware_connectors",
      engineStatus: "ABSENT",
      stage16Signal: "0",
      burtonScopeReference: "mostly out of normalized framing sample; calculators missing",
      dominantBlocker: "CALCULATOR_RULE",
      contractorValueGap: "medium-low for lumber MVP; needed for complete BOM",
    },
  ];

  const producing = packages.filter((p) => p.engineStatus.includes("PRODUCING"));
  const absent = packages.filter((p) => p.engineStatus === "ABSENT" || p.engineStatus.includes("ABSENT"));
  const coverageEstimate = {
    packagesProducingOrPartial: producing.length,
    packagesAbsentOrZeroStage16: absent.length,
    totalPackagesAudited: packages.length,
    qualitativePortionOfContractorFramingWorkflow:
      "Roughly 2–3 of 7 major packages produce usable output (walls + partial floor + partial structural). Opening, sheathing, roof, hardware absent. Estimate ~25–40% of a lumber-centric framing takeoff MVP by package breadth — not quantity-matched to Burton.",
  };

  const shortestSequence = [
    "1. Wall height / level population partitioning (unlocks incomplete walls + opening calc eligibility gate)",
    "2. Floor main-bay ownership (complete floor package beyond crawl)",
    "3. Sheathing subject existence + explicit SF authority",
    "4. Opening category/dimension authority only where short material path exists post wall-height",
    "5. Structural header/LVL placement breadth",
    "6. Roof evidence or explicit truss-package scope decision",
    "7. Hardware post-MVP polish unless customer-critical",
  ];

  const deferPostMvp = [
    "Industry door-size tag decode without schedule legend",
    "Garage-door framing calculator expansion",
    "Authority-only opening metadata completeness campaigns",
    "Generic cross-page platform without plan keys",
    "Burton quantity matching as success criterion",
    "UI redesign",
  ];

  const fullMvp = {
    generatedAt: new Date().toISOString(),
    auditId: "FULL_MVP_COVERAGE_AUDIT",
    purpose: "plans → contractor-usable framing takeoff MVP",
    burtonRole: "real-world scope/completeness reference — NOT quantity ground truth",
    burtonNormalizedLineCount: burton.lines.length,
    burtonCategoriesPresent: burtonByCat,
    engineStage16LineCount: materials.length,
    engineBaselineNote: "b2.2m.6 beckstead-audit-b 16-report (55 lines); M.12 did not change production",
    decisionBurden: {
      rawReviewItems: audit16.productState.rawReviewItems,
      contractorPrimaryQueue: audit16.productState.contractorPrimaryQueueCount,
      actionableGoverning: audit16.productState.actionableGoverningDecisions,
    },
    packages,
    coverageEstimate,
    horizontalVsDomain: {
      horizontalCandidates: [
        "progressive property resolution (proven walls; openings schema-ready)",
        "dimension ownership governance",
        "population partitioning for multi-value properties",
        "schedule↔plan binding (unproven on Beckstead doors)",
      ],
      domainSpecific: [
        "opening type-mark semantics",
        "garage-door calculator eligibility",
        "sheathing SF without invention",
        "roof plane extraction",
        "hardware connector rules",
      ],
    },
    shortestEngineeringSequenceToMvp: shortestSequence,
    deferUntilPostMvpPolish: deferPostMvp,
    optimizationTarget: "plans → useful contractor framing takeoff",
    notOptimizationTarget: "next technically interesting unresolved property",
    advisoryM13Status: "ADVISORY_PENDING_FULL_MVP_COVERAGE_AUDIT",
    doNotAutoStartM13: true,
  };

  await writeJson("FULL-MVP-COVERAGE-AUDIT.json", fullMvp);
  await writeMd(
    "FULL-MVP-COVERAGE-AUDIT.md",
    `# Full MVP Coverage Audit

## Purpose

Rebuild the roadmap around:

\`plans → contractor-usable framing takeoff MVP\`

Burton is a **scope/completeness reference**, not quantity ground truth.

## Engine today (Stage 16 baseline)

- **${materials.length}** material lines
- Walls: studs + plates producing
- Floor: crawl joist path partial
- Structural: partial LVL/header signal
- Opening framing / sheathing / roof / hardware: **absent**

## Package matrix

| Package | Status | Dominant blocker | Contractor gap |
|---|---|---|---|
${packages
  .map(
    (p) =>
      `| ${p.package} | ${p.engineStatus} | ${p.dominantBlocker} | ${p.contractorValueGap} |`,
  )
  .join("\n")}

## Coverage estimate

${coverageEstimate.qualitativePortionOfContractorFramingWorkflow}

## Shortest sequence to MVP

${shortestSequence.map((s) => `- ${s}`).join("\n")}

## Defer post-MVP

${deferPostMvp.map((s) => `- ${s}`).join("\n")}

## M.13

Advisory ranking may exist as history (\`ADVISORY_PENDING_FULL_MVP_COVERAGE_AUDIT\`). **Do not auto-start M.13** from blocker ranking alone — use this audit to choose the next engineering sequence.
`,
  );

  // --- Final verdict + REPORT ---
  const finalVerdict = {
    generatedAt: new Date().toISOString(),
    primaryVerdict: "M12_MVP_VALUE_STOP",
    mvpGate: gate,
    productionCodeChanged: false,
    stage16Delta: 0,
    nextMandatoryRoadmapStep: "FULL_MVP_COVERAGE_AUDIT",
    m13RankingStatus: "ADVISORY_PENDING_FULL_MVP_COVERAGE_AUDIT",
    artifacts: {
      probe: "artifacts/b2.2m.12/metrics/opening-authority-probe.md",
      gate: "artifacts/b2.2m.12/metrics/mvp-product-value-gate.json",
      audit16: "artifacts/b2.2m.12/metrics/AUDIT16-PRODUCT-LOOP.md",
      fullMvp: "artifacts/b2.2m.12/metrics/FULL-MVP-COVERAGE-AUDIT.md",
      advisoryM13:
        "artifacts/b2.2m.12/metrics/m13-product-unlock-ranking-advisory.json",
    },
  };
  await writeJson("final-verdict.json", finalVerdict);

  await writeMd(
    REPORT,
    `# B2.2M.12 Report — Opening Category + Dimension Authority

## Verdict

\`M12_MVP_VALUE_STOP\`

Successful milestone outcome. Mandatory Phases 1–9 probe completed. **MVP PRODUCT-VALUE GATE** did not authorize BUILD.

## What the probe found

- **57** openings: 23 semantic, 34 geometry gaps
- M.11 target **30** gaps: category \`unknown\`, dims null, ownership \`AMBIGUOUS\` (absent resolved values, not unbound schedule sizes)
- Positive controls exist elsewhere (garage 18×8; geometry width ESTABLISHED on \`39bf86…:gap0\`; semantic doors/windows already categorized)
- \`3068\` tag decode: **disallowed** without legend/schedule
- No door/window \`scheduleReference\`
- Progressive opening resolution: **already supported** at schema level
- Calculators: **not** Stage-16-ready after category/dims alone (wall height, parent, garage eligibility, jacks remain)

## MVP PRODUCT-VALUE GATE

| Field | Result |
|---|---|
| Effort class | \`LOW_MATERIAL_VALUE_SUBSTANTIAL_EFFORT\` |
| Contractor proximity | \`MARGINALLY\` |
| A Near-term material leverage | not proven |
| B Small generalized authority fix | not proven |
| C Credible horizontal + 2nd domain | not proven |
| Outcome | **\`M12_MVP_VALUE_STOP\`** |

## What was not done

- No PATH A–E implementation
- No production code changes
- No L1/L2/L3 build proofs (BUILD forbidden)
- No Stage 16 material delta
- No automatic M.13 start

## Product state (unchanged)

- Stage 16: **55** lines (baseline)
- Decision Burden: raw **424** / primary **277** / governing **0**
- Opening framing Stage 16: **0**

## Artifacts

- Probe: \`artifacts/b2.2m.12/metrics/opening-authority-probe.md\`
- Gate: \`artifacts/b2.2m.12/metrics/mvp-product-value-gate.json\`
- Audit #16: \`artifacts/b2.2m.12/metrics/AUDIT16-PRODUCT-LOOP.md\`
- Advisory M.13: \`artifacts/b2.2m.12/metrics/m13-product-unlock-ranking-advisory.json\` (\`ADVISORY_PENDING_FULL_MVP_COVERAGE_AUDIT\`)
- Full MVP Coverage Audit: \`artifacts/b2.2m.12/metrics/FULL-MVP-COVERAGE-AUDIT.md\`

## Next mandatory roadmap step

\`FULL_MVP_COVERAGE_AUDIT\` (completed in this close-out) — use it to choose the shortest path to a contractor-usable framing takeoff MVP. Do **not** auto-start M.13 from the advisory ranking alone.
`,
  );

  console.log(
    JSON.stringify(
      {
        verdict: "M12_MVP_VALUE_STOP",
        stage16Lines: materials.length,
        advisoryTop1: ranked[0]?.id,
        fullMvpPackages: packages.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
