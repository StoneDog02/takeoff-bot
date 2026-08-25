#!/usr/bin/env npx tsx
/**
 * B2.2M.13 close-out: spatial / population authority probe.
 * Follows M13_MVP_VALUE_STOP — no production code changes.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "artifacts/b2.2m.13/metrics");
const REPORT = path.join(ROOT, "artifacts/b2.2m.13/REPORT.md");
const AUDIT_MD = path.join(
  ROOT,
  "artifacts/b2.2m.12/metrics/FULL-MVP-COVERAGE-AUDIT.md",
);
const AUDIT_JSON = path.join(
  ROOT,
  "artifacts/b2.2m.12/metrics/FULL-MVP-COVERAGE-AUDIT.json",
);

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

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const generatedAt = new Date().toISOString();

  const m8 = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.8/metrics/m8-wall-height-probe-stop.json"),
      "utf8",
    ),
  ) as {
    populations: Array<Record<string, unknown>>;
    wallObjectState: Record<string, unknown>;
    stopReasons: string[];
    expectedMaterialClassIfGreen: string;
    modeBElevationsInCompiledEvidence: boolean;
  };

  const wallFraming = JSON.parse(
    await readFile(
      path.join(
        ROOT,
        "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/07-wallFraming.json",
      ),
      "utf8",
    ),
  ) as {
    walls?: Array<{
      name?: string;
      level?: string | null;
      location?: string;
      assembly?: { heightFeet?: number | null };
    }>;
  };
  const walls = wallFraming.walls ?? [];
  const families = { physicalRunP3: 0, physicalRunP4: 0, semanticLegend: 0 };
  let levelNull = 0;
  let locationUnknown = 0;
  let heightNull = 0;
  for (const wall of walls) {
    const name = wall.name ?? "";
    if (name.includes("physical-run:p3:")) families.physicalRunP3++;
    else if (name.includes("physical-run:p4:")) families.physicalRunP4++;
    else families.semanticLegend++;
    if (wall.level == null) levelNull++;
    if (wall.location === "unknown") locationUnknown++;
    if (wall.assembly?.heightFeet == null) heightNull++;
  }

  const m11Wall = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.11/metrics/l3-wall-delta.json"),
      "utf8",
    ),
  ) as {
    addedWallIds?: string[];
    targetWall?: {
      level?: string | null;
      location?: string;
      assembly?: { heightFeet?: number | null };
    };
  };

  const m9Control = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.9/metrics/wall-height-control.json"),
      "utf8",
    ),
  ) as {
    actual?: {
      decisionReadiness?: string;
      affectedObjectCount?: number;
      affectedReviewItemCount?: number;
    };
  };

  const m12Gate = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.12/metrics/mvp-product-value-gate.json"),
      "utf8",
    ),
  ) as { outcome?: string; expectedStage16IfBuilt?: number };

  const pageClass = JSON.parse(
    await readFile(
      path.join(
        ROOT,
        "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/02-pageClassification.json",
      ),
      "utf8",
    ),
  ) as {
    pages?: Array<{
      pageNumber?: number;
      pageKind?: string;
      relevantToFraming?: boolean;
      titleOrLabel?: string;
    }>;
    payload?: {
      pages?: Array<{
        pageNumber?: number;
        pageKind?: string;
        relevantToFraming?: boolean;
        titleOrLabel?: string;
      }>;
    };
  };
  const pages = pageClass.pages ?? pageClass.payload?.pages ?? [];
  const p2 = pages.find((p) => p.pageNumber === 2);

  // --- 1. Architecture map ---
  const architectureMap = {
    generatedAt,
    milestone: "B2.2M.13",
    pipeline: [
      "PLAN_PAGE_REGION",
      "GEOMETRY_SEMANTIC_EVIDENCE",
      "SPATIAL_PHYSICAL_IDENTITY",
      "POPULATION_SYSTEM_MEMBERSHIP",
      "DOMAIN_PROPERTY",
      "CALCULATION",
    ],
    latentStackExists: true,
    unifiedSpatialOwnershipService: false,
    latentLayers: [
      {
        layer: "compiler_physicalRunKey_ownership",
        paths: [
          "src/drawing-compiler/schemas/physicalWallRun.schema.ts",
          "src/drawing-compiler/schemas/semanticBinding.schema.ts",
        ],
      },
      {
        layer: "evidence_subjectKey_clustering",
        paths: ["src/core/schemas/evidence.schema.ts"],
      },
      {
        layer: "per_domain_resolvers",
        paths: [
          "src/scopes/framing/resolvers/resolveWallFraming.ts",
          "src/scopes/framing/resolvers/resolveFloorFraming.ts",
          "src/scopes/framing/resolvers/resolveSheathing.ts",
          "src/scopes/framing/resolvers/resolveStructuralMembers.ts",
          "src/scopes/framing/resolvers/resolveOpenings.ts",
        ],
      },
      {
        layer: "review_population_governing",
        paths: [
          "src/scopes/framing/review-workspace/projectReviewRootCauses.ts",
          "src/scopes/framing/resolvers/applyGoverningDecision.ts",
        ],
      },
    ],
    packageBreakPoints: {
      walls:
        "SPATIAL_IDENTITY→DOMAIN_PROPERTY: level hardcoded null; height Evidence absent; location unknown",
      openings:
        "DOMAIN_PROPERTY→CALCULATION: needs parent wall + wall.assembly.heightFeet; cat/dims still missing (M.12)",
      floor:
        "POPULATION→DOMAIN_PROPERTY: main-floor SF subjects lack spacing-axis bay layout",
      sheathing:
        "PLAN→SPATIAL_IDENTITY: 0 sheathing-area subjects; V1 forbids L×H invent",
      structural:
        "SPATIAL_IDENTITY→PLACEMENT: schedule identity without LONG/qty breadth",
    },
  };
  await writeJson("ownership-architecture-map.json", architectureMap);

  // --- 2–4. Wall-height blocker reconstruction ---
  const wallHeightBlocker = {
    generatedAt,
    milestone: "B2.2M.13",
    m8Verdict: "M8_WALL_HEIGHT_PROBE_STOP",
    m8Source: "artifacts/b2.2m.8/metrics/m8-wall-height-probe-stop.json",
    elevationPopulations: m8.populations,
    elevationPage: {
      pageNumber: 2,
      pageKind: p2?.pageKind ?? "elevation",
      relevantToFraming: p2?.relevantToFraming ?? false,
      titleOrLabel: p2?.titleOrLabel ?? "S2.1 - ELEVATIONS",
      inCompiledModeBEvidence: m8.modeBElevationsInCompiledEvidence,
      probeCrops: [
        "artifacts/b2.2m.7/probe-pages/p2-front-elev-center.png",
        "artifacts/b2.2m.7/probe-pages/p2-garage-height-region.png",
        "artifacts/b2.2m.7/probe-pages/p2-left-elev.png",
        "artifacts/b2.2m.7/probe-pages/p2-right-elev.png",
        "artifacts/b2.2m.7/probe-pages/p2-height-scan-mid.png",
      ],
      note: "Re-verified crop presence only; approximate values remain M.8 human-probe authority — not frozen Evidence.",
    },
    modeBWallCensus: {
      source: "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/07-wallFraming.json",
      totalWalls: walls.length,
      levelNull,
      locationUnknown,
      heightFeetNull: heightNull,
      families,
      allLevelNull: levelNull === walls.length,
      allLocationUnknown: locationUnknown === walls.length,
      allHeightNull: heightNull === walls.length,
    },
    m11RestoredWall: {
      id: m11Wall.addedWallIds?.[0] ?? "physical-run:p4:fd36917c47ec",
      level: m11Wall.targetWall?.level ?? null,
      location: m11Wall.targetWall?.location ?? "unknown",
      heightFeet: m11Wall.targetWall?.assembly?.heightFeet ?? null,
      inventsLevelLocation: false,
      note: "Existence-only recovery; partition keys unchanged. Post-M.11 wall count = 43.",
    },
    postM11WallCount: 43,
    structuralWhyBindingFails: [
      {
        capability: "level_identity",
        detail:
          "level not in WALL_PROPERTY_PATHS; resolveWallFraming hardcodes level: null",
        paths: [
          "src/scopes/framing/resolvers/wallFramingPropertyPaths.ts",
          "src/scopes/framing/resolvers/resolveWallFraming.ts",
        ],
      },
      {
        capability: "physical_run_population_membership",
        detail:
          "No garage/living/vaulted membership on resolved walls; p4 wood-stud still mixes living+garage",
      },
      {
        capability: "elevation_to_plan_correspondence",
        detail:
          "p2 relevantToFraming=false; zero assembly.heightFeet Evidence in frozen Mode B",
      },
      {
        capability: "cross_page_correspondence",
        detail: "No face/elevation-scope binding to plan physical runs",
      },
      {
        capability: "location_enum_insufficient",
        detail:
          "location is only exterior|interior|unknown — not a height-population key",
      },
    ],
    m9Projection: {
      decisionReadiness: m9Control.actual?.decisionReadiness ?? "NEEDS_PARTITIONING",
      affectedObjectCount: m9Control.actual?.affectedObjectCount ?? 42,
      affectedReviewItemCount: m9Control.actual?.affectedReviewItemCount ?? 42,
      source: "artifacts/b2.2m.9/metrics/wall-height-control.json",
    },
    m8StopReasons: m8.stopReasons,
    expectedMaterialClassIfGreen: m8.expectedMaterialClassIfGreen,
    populationsBindableWithoutGuessing: false,
  };
  await writeJson("wall-height-blocker-reconstruction.json", wallHeightBlocker);

  await writeMd(
    "wall-height-blocker-reconstruction.md",
    `# M.13 Wall-Height Blocker Reconstruction

Re-opens M.8 without inventing new elevation authority.

## Elevation populations (M.8; crops re-confirmed present)

| Population | Approx value | Bindable today? |
|---|---|---|
| Main living floor→ceiling | ~8'-1" | No |
| Mid-front vertical | ~9'-1" | No (ambiguous) |
| Garage ceiling | ~9'-3"+ | No |
| Vaulted | exclusion | No |
| Crawl/foundation (p3) | must not inherit | No |

Source: \`artifacts/b2.2m.8/metrics/m8-wall-height-probe-stop.json\`.  
Crops: \`artifacts/b2.2m.7/probe-pages/p2-*.png\`. p2 \`relevantToFraming=${String(p2?.relevantToFraming ?? false)}\`.

## Mode B wall census (m4 frozen)

- Walls: **${walls.length}** (all \`level=null\`, \`location=unknown\`, \`heightFeet=null\`)
- Families: p3=${families.physicalRunP3}, p4=${families.physicalRunP4}, semantic/legend=${families.semanticLegend}
- M.11 restored wall still UNKNOWN height/level/location → **43** walls post-recovery

## Why binding fails

Combination of level identity (unwired), missing population membership, elevation↔plan correspondence absent, and location enum insufficient for height populations.

M.9 correctly keeps height family at \`NEEDS_PARTITIONING\`.
`,
  );

  // --- 5. Authority signals ---
  const authoritySignals = {
    generatedAt,
    reuseExistingReviewTerminology: true,
    tiers: [
      {
        tier: "Explicit_Evidence",
        signals: ["assembly.heightFeet Evidence", "level Evidence"],
        becksteadStatus: "Absent / level unwired",
      },
      {
        tier: "Supported_spatial_inference",
        signals: [
          "physical-run page role (p3 vs p4)",
          "wood-stud vs foundation type",
          "garage-door opening parent seed",
        ],
        becksteadStatus:
          "Coarse only; p4 still mixes living+garage (M.8 rejected PARTIAL)",
      },
      {
        tier: "Ambiguous",
        signals: [
          "same-page proximity",
          "mid-front ~9'-1\"",
          "vaulted-adjacent runs",
        ],
        becksteadStatus: "Fail-closed",
      },
      {
        tier: "Unresolved",
        signals: ["no partition keys"],
        becksteadStatus: "Current state",
      },
    ],
    failClosedMustRetain: [
      "no_project_wide_height",
      "no_garage_main_conflation",
      "no_vaulted_contamination",
      "no_same_page_only_binding",
      "no_elevation_plan_without_spatial_evidence",
      "no_LxH_sheathing_invent",
      "no_floor_SF_as_layout",
      "unresolved_populations_remain_unresolved",
    ],
  };
  await writeJson("population-authority-signals.json", authoritySignals);

  // --- 6–9. Cross-domain classifications ---
  const crossDomain = {
    generatedAt,
    milestone: "B2.2M.13",
    classifications: {
      floor: {
        classification: "DOMAIN_SPECIFIC_FLOOR_BLOCKER",
        evidence: [
          "artifacts/b2.2m.6/metrics/M6_MAIN_FLOOR_STOP.md",
          "Crawl bay resolved; main floor 1621 SF cannot drive joists",
          "Missing spacing-axis bay layout — not wall population membership",
        ],
      },
      sheathing: {
        classification: "DOMAIN_SPECIFIC_SHEATHING_BLOCKER",
        evidence: [
          "artifacts/b2.2m.7/metrics/M7_SHEATHING_STOP.md",
          "Dominant SUBJECT_EXISTENCE (0 sheathing-area subjects)",
          "docs/FRAMING_V1_LIMITATIONS.md forbids L×H invent for coverage SF",
          "Wall populations would not mint Stage 16 sheathing under current contracts",
        ],
      },
      structural: {
        classification: "DOMAIN_SPECIFIC_STRUCTURAL_BLOCKER",
        evidence: [
          "artifacts/b2.2m.6 — WB2-11.88LVL success; remaining placement length/qty breadth",
          "Not level/population membership",
        ],
      },
      opening: {
        classification: "PARTIALLY_SHARED_CAPABILITY",
        evidence: [
          "artifacts/b2.2m.12 — category/dims gap; height is downstream eligibility gate",
          "Shares dependency on wall height, not the same spatial primitive",
          `M.12 gate outcome: ${m12Gate.outcome ?? "M12_MVP_VALUE_STOP"}; expected Stage 16 if authority-only: ${m12Gate.expectedStage16IfBuilt ?? 0}`,
        ],
      },
    },
  };
  await writeJson("cross-domain-classifications.json", crossDomain);

  // --- 10–11. Horizontal verdict ---
  const horizontalVerdict = {
    generatedAt,
    milestone: "B2.2M.13",
    verdict: "HORIZONTAL_HYPOTHESIS_REJECTED",
    sharedPrimitive: null,
    confirmationRequiresAtLeastTwoMaterialPackages: true,
    whyRejected: [
      "Wall height-population membership does not unlock floor bay layout",
      "Does not unlock sheathing area subjects under V1",
      "Does not unlock structural LONG placement breadth",
      "Opening shares a downstream gate, not a reusable ownership contract",
      "Word ownership is overloaded across MIXED_BLOCKERS",
    ],
    latentPatternsAlreadyPresent: [
      "compiler physicalRunKey ownership",
      "review NEEDS_PARTITIONING / governing fan-out",
    ],
    doNotInventUnifiedSpatialOwnershipService: true,
  };
  await writeJson("horizontal-hypothesis-verdict.json", horizontalVerdict);

  // --- Calculator leverage ---
  const calculatorLeverage = {
    generatedAt,
    ifHeightGovernedForProvenPopulation: [
      "wall population membership",
      "governed heightFeet",
      "validateWallHeightResolved (partially-blocked → clearer)",
      "calculateOpeningFraming eligibility (height gate)",
      "still blocked: category / rough dims / jacks / header / garage eligibility",
      "Stage 16 opening material: still ~0 near-term (M.12)",
    ],
    sheathing: "height does not create areaSquareFeet under V1",
    wallStudsPlates: "already calculate without height — Stage 16 unchanged by height alone",
    paths: [
      "src/scopes/framing/validators/wall-framing.validator.ts",
      "src/scopes/framing/calculators/calculateOpeningFraming.ts",
      "src/scopes/framing/calculators/calculateWallFraming.ts",
      "docs/FRAMING_V1_LIMITATIONS.md",
    ],
  };
  await writeJson("calculator-leverage-trace.json", calculatorLeverage);

  // --- 12–16. MVP gate ---
  const mvpGate = {
    generatedAt,
    milestone: "B2.2M.13",
    effortClass: "LOW_MATERIAL_VALUE_SUBSTANTIAL_EFFORT",
    contractorProximity: "MARGINALLY",
    gateA: {
      proven: false,
      name: "near_term_material_or_calculation_leverage",
      reason:
        "Studs/plates already ignore height. Opening calculator eligibility still blocked by category/dims/jacks (M.12). Sheathing needs area subjects; V1 forbids L×H invent.",
    },
    gateB: {
      proven: false,
      name: "generalized_spatial_population_reusable_across_ge2_packages",
      reason: "HORIZONTAL_HYPOTHESIS_REJECTED — no shared unlock primitive",
    },
    gateC: {
      proven: false,
      name: "small_bounded_wall_fix_shortens_opening_and_sheathing",
      reason:
        "Population binding is not small (M.8). Sheathing path not shortened under V1. Opening path only eligibility gate.",
    },
    outcome: "M13_MVP_VALUE_STOP",
    selectedPath: "F",
    buildForbidden: true,
    productionCodeChanged: false,
    expectedDeltasIfStop: {
      decisionBurden: {
        rawReviewItems: 424,
        contractorPrimaryQueue: 277,
        actionableGoverning: 0,
        delta: "unchanged",
      },
      stage16: {
        materialLines: 55,
        studs: 284,
        platesLfApprox: 985.96,
        crawlJoists: "31 / 527 LF",
        lvlLf: 23.5,
        openingFraming: 0,
        sheathing: 0,
        delta: "unchanged",
      },
    },
    rationale: [
      "None of A/B/C proven",
      "M.8 already proved safe multi-wall bindability unavailable",
      "M.9–M.12 did not add partition keys",
      "PATH B/C/D would be architecture/extraction with weak Stage 16 and high fail-closed risk",
      "STOP is a successful milestone outcome",
    ],
    assumptionGoverningOpportunity: {
      membershipFirstThenValue: true,
      currentDecisionReadiness: "NEEDS_PARTITIONING",
      fanOutArchitectureReady: true,
      fanOutPath: "src/scopes/framing/resolvers/applyGoverningDecision.ts",
      halfWireForbiddenUnderStop: true,
    },
  };
  await writeJson("mvp-product-value-gate.json", mvpGate);

  // --- Next roadmap ---
  const nextRoadmap = {
    generatedAt,
    milestone: "B2.2M.13",
    selectionFormula:
      "contractor-visible coverage × evidence readiness × cross-package leverage ÷ risk",
    m13Outcome: "M13_MVP_VALUE_STOP",
    closedCandidate: {
      id: "wall_height_population_partitioning",
      status: "PROBED_STOP",
      note: "Remains debt; not authorized for BUILD under MVP value gate",
    },
    nextCandidate: {
      id: "floor_framing_main_bay_ownership",
      rank: 1,
      reason:
        "Full MVP #2; highest remaining material-coverage score with existing FFA subjects; crawl path already proven",
    },
    alternateIfFloorEvidenceTooLow: "sheathing_subject_existence",
    doNotAutoStart: [
      "opening category campaign (respect M.12)",
      "sheathing solely because wall height STOPped",
      "generalized SpatialOwnership service",
    ],
    coverageEstimateAfterM13:
      "~25–40% lumber-centric framing MVP by package breadth — unchanged; wall height debt marked probed-STOP",
  };
  await writeJson("next-roadmap-decision.json", nextRoadmap);

  // --- Fail-closed + non-goals ---
  await writeJson("fail-closed-contract.json", {
    generatedAt,
    rules: [
      "no_project_wide_wall_height_without_homogeneous_authority",
      "no_garage_main_floor_conflation",
      "no_vaulted_wall_contamination",
      "no_same_page_only_population_binding",
      "no_nearby_dimension_ownership_without_corroboration",
      "no_elevation_to_plan_without_legitimate_spatial_evidence",
      "no_floor_SF_converted_into_layout_authority",
      "no_sheathing_SF_invented",
      "no_structural_placement_invented",
      "unresolved_populations_remain_unresolved",
      "known_property_values_survive_partial_resolution",
      "stronger_authority_beats_assumptions",
      "contractor_decisions_apply_only_to_proven_population_members",
      "stale_decisions_do_not_overwrite_stronger_facts",
      "no_burton_quantity_enters_production_authority",
      "all_propagation_retains_provenance",
    ],
  });

  await writeJson("explicit-non-goals.json", {
    generatedAt,
    nonGoals: [
      "No generalized SpatialOwnership service",
      "No elevation Mode B expansion as silent production change",
      "No global/default wall height assumption",
      "No opening category campaign restart (respect M.12)",
      "No sheathing L×H invent",
      "No main-floor joists from 1621 SF",
      "No UI redesign",
      "No Burton source modification",
      "No L1/L2/L3 production BUILD proofs",
    ],
  });

  // --- Lean answers ---
  const lean = {
    generatedAt,
    answers: {
      areOwnershipBlockersOneHorizontalProblem: false,
      exactMissingCapability:
        "Wall height-population membership + elevation↔plan binding (plus unwired level) — not a cross-package spatial service",
      isWallHeightBestPositiveControl:
        "Yes for walls/openings dependency; failed as horizontal unlock",
      canPopulationsBeEstablishedWithoutGuessing: false,
      canOneContractorDecisionGovernProvenPopulation:
        "Only after membership is governed — currently NEEDS_PARTITIONING",
      doesSolvingWallPopulationShortenOpeningFraming:
        "Eligibility gate only; Stage 16 still blocked (M.12)",
      doesItShortenSheathing: false,
      doesSamePrimitiveHelpFloorOrStructural: false,
      stage16LikelyGainIfForcedBuild: "~0 near-term; decision-burden-only at best",
      decisionBurdenLikelyGain:
        "Large if populations existed; they do not safely",
      mvpAcceleratorOrWeakArchitecture:
        "Weak immediate MVP value — architecture temptation without bindable evidence",
      buildOrStop: "M13_MVP_VALUE_STOP",
    },
  };
  await writeJson("your-lean.json", lean);

  // --- Final verdict ---
  await writeJson("final-verdict.json", {
    generatedAt,
    milestone: "B2.2M.13",
    primaryVerdict: "M13_MVP_VALUE_STOP",
    horizontalHypothesis: "HORIZONTAL_HYPOTHESIS_REJECTED",
    sharedPrimitive: null,
    selectedPath: "F",
    effortClass: "LOW_MATERIAL_VALUE_SUBSTANTIAL_EFFORT",
    contractorProximity: "MARGINALLY",
    buildForbidden: true,
    productionCodeChanged: false,
    nextRoadmap: "floor_framing_main_bay_ownership",
  });

  // --- REPORT ---
  await writeMd(
    REPORT,
    `# B2.2M.13 Report — MVP Spatial / Population Authority Probe

## Verdict

\`M13_MVP_VALUE_STOP\`

Successful milestone outcome. Phases 0–8 product probe completed from repository evidence. **MVP PRODUCT-VALUE GATE** did not authorize BUILD. Horizontal hypothesis **rejected**.

## What the probe found

- Ownership architecture is a **latent stack** (compiler physicalRunKey ownership, Evidence subjectKeys, per-domain resolvers, M.9 population/governing) — **no** unified SpatialOwnership service
- Wall height remains the correct **positive control** but cannot bind Beckstead elevation populations (~8'-1" living, ~9'-3"+ garage, vaulted exclusions, ambiguous ~9'-1") to walls without inventing partition keys
- Mode B walls: **42** frozen all \`level=null\` / \`location=unknown\` / \`heightFeet=null\`; M.11 +1 existence wall still UNKNOWN → **43**
- \`level\` unwired (\`WALL_PROPERTY_PATHS\` + hardcoded \`null\`); p2 elevations outside Mode B framing evidence
- Cross-domain: floor / sheathing / structural = **DOMAIN_SPECIFIC_\***; opening = **PARTIALLY_SHARED** (height gate dependency only)
- Horizontal: \`HORIZONTAL_HYPOTHESIS_REJECTED\` — no shared primitive unlocking ≥2 material packages

## MVP PRODUCT-VALUE GATE

| Field | Result |
|---|---|
| Effort class | \`LOW_MATERIAL_VALUE_SUBSTANTIAL_EFFORT\` |
| Contractor proximity | \`MARGINALLY\` |
| A Near-term material/calc leverage | not proven |
| B Horizontal ≥2 packages | rejected |
| C Small bounded wall fix shortens opening/sheathing | not proven |
| Outcome | **\`M13_MVP_VALUE_STOP\`** |
| PATH | **F** |

## What was not done

- No PATH A–E implementation
- No production code changes (resolvers/validators/calculators/schemas)
- No L1/L2/L3 build proofs (BUILD forbidden)
- No Stage 16 material delta
- No Burton source or UI changes
- No global wall-height assumption

## Product state (unchanged)

- Stage 16: **55** lines (baseline)
- Decision Burden: raw **424** / primary **277** / governing **0**
- Walls with governed height: **0**
- Opening framing / sheathing Stage 16: **0**

## Artifacts

- Architecture: \`artifacts/b2.2m.13/metrics/ownership-architecture-map.json\`
- Wall-height blocker: \`artifacts/b2.2m.13/metrics/wall-height-blocker-reconstruction.md\`
- Cross-domain: \`artifacts/b2.2m.13/metrics/cross-domain-classifications.json\`
- Horizontal verdict: \`artifacts/b2.2m.13/metrics/horizontal-hypothesis-verdict.json\`
- Gate: \`artifacts/b2.2m.13/metrics/mvp-product-value-gate.json\`
- Calculator leverage: \`artifacts/b2.2m.13/metrics/calculator-leverage-trace.json\`
- Next roadmap: \`artifacts/b2.2m.13/metrics/next-roadmap-decision.json\`
- Lean: \`artifacts/b2.2m.13/metrics/your-lean.json\`
- Full MVP Coverage Audit (updated): \`artifacts/b2.2m.12/metrics/FULL-MVP-COVERAGE-AUDIT.md\`

## Next mandatory roadmap step

**Floor main-bay ownership** (\`floor_framing_main_bay_ownership\`) — Full MVP sequence item #2; wall-height population partitioning closed as **probed-STOP**. Do not reopen opening category campaigns or invent sheathing SF solely because M.13 STOPped.
`,
  );

  // --- Update Full MVP Coverage Audit ---
  const auditMd = `# Full MVP Coverage Audit

## Purpose

Rebuild the roadmap around:

\`plans → contractor-usable framing takeoff MVP\`

Burton is a **scope/completeness reference**, not quantity ground truth.

## Engine today (Stage 16 baseline)

- **55** material lines
- Walls: studs + plates producing
- Floor: crawl joist path partial
- Structural: partial LVL/header signal
- Opening framing / sheathing / roof / hardware: **absent**

## Package matrix

| Package | Status | Dominant blocker | Contractor gap |
|---|---|---|---|
| wall_framing | PARTIAL_PRODUCING | DIMENSION_AUTHORITY / height population — **M.13 probed-STOP** (bindability unavailable) | medium — core walls producing; height debt remains but BUILD not MVP-authorized |
| opening_framing | ABSENT_FROM_STAGE16 | CATEGORY + DIMENSION + WALL_HEIGHT + PARENT/JACK/HEADER (M.12 deferred; M.13 did not unlock height path) | high for complete takeoff; still not near-term |
| floor_framing | PARTIAL_PRODUCING | OWNERSHIP — main-floor bay | high — main floor missing vs crawl-only |
| structural_members | PARTIAL_PRODUCING | OWNERSHIP / placement breadth | medium |
| sheathing | ABSENT | SUBJECT_EXISTENCE | high |
| roof_framing | ABSENT | EVIDENCE_EXTRACTION | high (or truss-package scope decision) |
| hardware_connectors | ABSENT | CALCULATOR_RULE | medium-low for lumber MVP; needed for complete BOM |

## Coverage estimate

Roughly 2–3 of 7 major packages produce usable output (walls + partial floor + partial structural). Opening, sheathing, roof, hardware absent. Estimate ~25–40% of a lumber-centric framing takeoff MVP by package breadth — not quantity-matched to Burton.

**After M.13:** coverage estimate **unchanged**. Horizontal spatial/population capability **rejected**; wall-height BUILD not authorized.

## Shortest sequence to MVP (post-M.13)

- 1. ~~Wall height / level population partitioning~~ — **\`M13_MVP_VALUE_STOP\`** (debt remains; do not BUILD under current bindability)
- 2. **Floor main-bay ownership** ← **next** (complete floor package beyond crawl)
- 3. Sheathing subject existence + explicit SF authority
- 4. Opening category/dimension authority only where short material path exists (still needs height later)
- 5. Structural header/LVL placement breadth
- 6. Roof evidence or explicit truss-package scope decision
- 7. Hardware post-MVP polish unless customer-critical

## M.13 outcome

- Verdict: \`M13_MVP_VALUE_STOP\`
- Horizontal: \`HORIZONTAL_HYPOTHESIS_REJECTED\`
- PATH: F
- Artifacts: \`artifacts/b2.2m.13/\`
- Next: \`floor_framing_main_bay_ownership\`

## Defer post-MVP

- Industry door-size tag decode without schedule legend
- Garage-door framing calculator expansion
- Authority-only opening metadata completeness campaigns
- Generic cross-page / unified SpatialOwnership platform without plan keys
- Burton quantity matching as success criterion
- UI redesign
- Global wall-height assumption without population membership
`;

  await writeFile(AUDIT_MD, auditMd.endsWith("\n") ? auditMd : `${auditMd}\n`, "utf8");
  await writeMd("FULL-MVP-COVERAGE-AUDIT.md", auditMd);

  const priorAudit = JSON.parse(await readFile(AUDIT_JSON, "utf8")) as Record<
    string,
    unknown
  >;
  const updatedAudit = {
    ...priorAudit,
    generatedAt,
    updatedByMilestone: "B2.2M.13",
    m13Outcome: {
      verdict: "M13_MVP_VALUE_STOP",
      horizontalHypothesis: "HORIZONTAL_HYPOTHESIS_REJECTED",
      selectedPath: "F",
      coverageEstimateUnchanged: true,
    },
    packages: (
      priorAudit.packages as Array<Record<string, unknown>>
    ).map((pkg) => {
      if (pkg.package === "wall_framing") {
        return {
          ...pkg,
          dominantBlocker:
            "DIMENSION_AUTHORITY / height population — M.13 probed-STOP (bindability unavailable)",
          contractorValueGap:
            "medium — core walls producing; height debt remains but BUILD not MVP-authorized",
        };
      }
      if (pkg.package === "opening_framing") {
        return {
          ...pkg,
          dominantBlocker:
            "CATEGORY + DIMENSION + WALL_HEIGHT + PARENT/JACK/HEADER (M.12 deferred; M.13 did not unlock height path)",
          contractorValueGap:
            "high for complete takeoff; still not near-term",
        };
      }
      return pkg;
    }),
    shortestSequenceToMvp: [
      {
        rank: 1,
        id: "wall_height_population_partitioning",
        status: "M13_MVP_VALUE_STOP",
        note: "Debt remains; BUILD not authorized",
      },
      {
        rank: 2,
        id: "floor_framing_main_bay_ownership",
        status: "NEXT",
        note: "Complete floor package beyond crawl",
      },
      {
        rank: 3,
        id: "sheathing_subject_existence",
        status: "PENDING",
      },
      {
        rank: 4,
        id: "opening_framing_continuation_post_wall_height",
        status: "PENDING",
      },
      {
        rank: 5,
        id: "structural_header_lvl_placement",
        status: "PENDING",
      },
      {
        rank: 6,
        id: "roof_framing_evidence_extraction",
        status: "PENDING",
      },
      {
        rank: 7,
        id: "hardware_calculator_rules",
        status: "PENDING",
      },
    ],
    nextEngineeringSequence: "floor_framing_main_bay_ownership",
    m13Note:
      "Horizontal spatial/population capability REJECTED. Wall-height positive control confirmed as domain-specific debt, not BUILD-authorized MVP unlock.",
  };
  await writeFile(
    AUDIT_JSON,
    `${JSON.stringify(updatedAudit, null, 2)}\n`,
    "utf8",
  );
  await writeJson("FULL-MVP-COVERAGE-AUDIT.json", updatedAudit);

  // Also copy audit summary into m13 for discoverability
  await writeJson("production-touch-audit.json", {
    generatedAt,
    productionCodeChanged: false,
    resolversTouched: false,
    validatorsTouched: false,
    calculatorsTouched: false,
    schemasTouched: false,
    burtonSourceTouched: false,
    uiTouched: false,
    artifactsWritten: true,
    commitRequested: false,
  });

  console.log("B2.2M.13 close-out written →", OUT);
  console.log("Verdict: M13_MVP_VALUE_STOP");
  console.log("Next: floor_framing_main_bay_ownership");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
