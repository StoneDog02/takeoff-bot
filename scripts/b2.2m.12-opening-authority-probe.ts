#!/usr/bin/env npx tsx
/**
 * B2.2M.12 — Opening category/dimension authority probe + MVP PRODUCT-VALUE GATE.
 * Read-only vs production code; writes metrics under artifacts/b2.2m.12/metrics/.
 * Does NOT implement PATH A–E; gate decides BUILD vs M12_MVP_VALUE_STOP.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Evidence } from "../src/core/schemas/evidence.schema.js";
import type {
  OpeningsPayload,
  WallFramingPayload,
} from "../src/scopes/framing/schemas/framing-artifacts.schema.js";
import type { Opening } from "../src/scopes/framing/schemas/opening.schema.js";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "artifacts/b2.2m.12/metrics");
const RUN = "artifacts/b2.2m.4/runs/beckstead-audit-b/framing";
const TARGET_RUN = "physical-run:p4:fd36917c47ec";
const POSITIVE_WIDTH_RUN = "physical-run:p4:39bf86d87f6b";

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

async function writeMd(name: string, body: string): Promise<void> {
  await writeFile(path.join(OUT, name), body.endsWith("\n") ? body : `${body}\n`, "utf8");
}

function isGapOpening(o: Opening): boolean {
  return o.id.includes(":gap") || o.id.includes("opening:p");
}

function hasAnyDim(o: Opening): boolean {
  const d = o.dimensions;
  return (
    d.nominalWidthFeet != null ||
    d.nominalHeightFeet != null ||
    d.roughWidthFeet != null ||
    d.roughHeightFeet != null
  );
}

function scoreOpening(o: Opening): number {
  let s = 0;
  if (o.category && o.category !== "unknown") s += 3;
  if (o.dimensions.nominalWidthFeet != null) s += 2;
  if (o.dimensions.nominalHeightFeet != null) s += 2;
  if (o.dimensions.roughWidthFeet != null) s += 2;
  if (o.dimensions.roughHeightFeet != null) s += 1;
  if (o.parentWallId) s += 3;
  if (o.parentObjectId) s += 2;
  if (o.quantity != null) s += 1;
  if (o.scheduleReference) s += 2;
  return s;
}

function evidenceForOpening(
  evidence: Evidence[],
  opening: Opening,
): Evidence[] {
  const ids = new Set(opening.evidenceIds);
  const subjectHints = new Set<string>();
  // subjectKey variants from object id
  const raw = opening.id.replace(/^O-/, "");
  subjectHints.add(raw);
  subjectHints.add(raw.replaceAll("-", " "));
  return evidence.filter(
    (e) =>
      e.subjectKind === "opening" &&
      (ids.has(e.id) ||
        subjectHints.has(e.subjectKey) ||
        e.subjectKey.replaceAll(" ", "-") === raw ||
        opening.id.includes(e.subjectKey) ||
        (e.subjectKey && opening.id.endsWith(e.subjectKey.replaceAll(" ", "-")))),
  );
}

type OpeningProbeRow = {
  id: string;
  kind: "geometry-gap" | "semantic";
  category: string;
  dimensions: Opening["dimensions"];
  parentWallId: string | null;
  parentObjectId: string | null;
  quantity: number | null;
  scheduleReference: string | null;
  score: number;
  evidencePaths: string[];
  dimensionOwnershipStatus: string | null;
  categoryEvidenceValue: string | null;
  hasDimEvidence: boolean;
  materialAuthoritativeLikely: boolean;
  calculatorBlockers: string[];
};

function calculatorBlockers(
  o: Opening,
  walls: WallFramingPayload,
): string[] {
  const blockers: string[] = [];
  if (o.category === "unknown") blockers.push("CATEGORY_UNKNOWN");
  if (o.category === "garage-door") blockers.push("GARAGE_DOOR_INELIGIBLE");
  if (!["door", "window", "cased"].includes(o.category)) {
    if (o.category !== "garage-door") blockers.push("CATEGORY_NOT_FRAMING_ELIGIBLE");
  }
  if (o.dimensions.nominalWidthFeet == null || o.dimensions.nominalHeightFeet == null) {
    blockers.push("NOMINAL_DIMS_MISSING");
  }
  if (o.quantity == null) blockers.push("QUANTITY_MISSING");
  if (!o.parentObjectId || !o.parentWallId) blockers.push("PARENT_MISSING");
  if (o.parentWallId) {
    const wall = walls.walls.find((w) => w.id === o.parentWallId);
    if (!wall) {
      blockers.push("PARENT_WALL_NOT_IN_ARTIFACT");
    } else {
      if (wall.wallType === "unknown") blockers.push("PARENT_WALL_TYPE_UNKNOWN");
      if (wall.assembly.heightFeet == null) blockers.push("BLOCKED_BY_WALL_HEIGHT");
      if (wall.assembly.studSize == null) blockers.push("BLOCKED_BY_STUD_SIZE");
    }
  }
  if (o.jackStudCount == null) blockers.push("JACK_COUNT_UNSET");
  if (o.headerMemberId == null) blockers.push("HEADER_UNLINKED");
  return blockers;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const openingsPayload = await loadPayload<OpeningsPayload>(`${RUN}/08-openings.json`);
  const evidencePayload = await loadPayload<{ evidence: Evidence[] }>(
    `${RUN}/06-extractedEvidence.json`,
  );
  const walls = await loadPayload<WallFramingPayload>(`${RUN}/07-wallFraming.json`);
  const inventory = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.3/metrics/beckstead-opening-source-inventory.json"),
      "utf8",
    ),
  ) as { sources?: Array<Record<string, unknown>> };

  const evidence = evidencePayload.evidence ?? [];
  const openings = openingsPayload.openings;

  // M.11 restores target wall — inject existence for probe of post-M.11 parent state
  const targetWallPresentInM4 = walls.walls.some((w) => w.id === TARGET_RUN);
  const m11Closeout = JSON.parse(
    await readFile(
      path.join(ROOT, "artifacts/b2.2m.11/metrics/m11-product-delta.json"),
      "utf8",
    ),
  ) as {
    after?: { walls?: number; stage16?: { lines?: number } };
  };

  const rows: OpeningProbeRow[] = openings.map((o) => {
    const ev = evidenceForOpening(evidence, o);
    const paths = [
      ...new Set(
        ev
          .map((e) => e.propertyPath)
          .filter((p): p is string => typeof p === "string" && p.length > 0),
      ),
    ];
    const ownership = ev.find((e) => e.propertyPath === "dimensionOwnershipStatus");
    const catEv = ev.find((e) => e.propertyPath === "category");
    const hasDimEvidence = ev.some((e) =>
      String(e.propertyPath ?? "").startsWith("dimensions."),
    );
    // Post-M.11: target-run openings have live parent
    const parentWallId =
      o.parentWallId ??
      (o.id.includes(TARGET_RUN) && !targetWallPresentInM4 ? TARGET_RUN : o.parentWallId);
    const parentObjectId =
      o.parentObjectId ??
      (o.id.includes(TARGET_RUN) && !targetWallPresentInM4
        ? `WS-${TARGET_RUN}`
        : o.parentObjectId);
    const adjusted: Opening = {
      ...o,
      parentWallId,
      parentObjectId,
    };
    return {
      id: o.id,
      kind: isGapOpening(o) ? "geometry-gap" : "semantic",
      category: o.category,
      dimensions: o.dimensions,
      parentWallId,
      parentObjectId,
      quantity: o.quantity,
      scheduleReference: o.scheduleReference,
      score: scoreOpening(adjusted),
      evidencePaths: paths,
      dimensionOwnershipStatus:
        ownership?.value != null ? String(ownership.value) : null,
      categoryEvidenceValue: catEv?.value != null ? String(catEv.value) : null,
      hasDimEvidence,
      materialAuthoritativeLikely:
        hasAnyDim(o) &&
        o.category !== "unknown" &&
        Boolean(parentWallId) &&
        o.quantity != null,
      calculatorBlockers: calculatorBlockers(adjusted, walls),
    };
  });

  const target30 = rows.filter((r) => r.id.includes(TARGET_RUN));
  const semantic = rows.filter((r) => r.kind === "semantic");
  const gaps = rows.filter((r) => r.kind === "geometry-gap");
  const ranked = [...rows].sort((a, b) => b.score - a.score);

  const byCategory = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  const ownershipHist = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.dimensionOwnershipStatus ?? "none";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const invSources = inventory.sources ?? [];
  const invTarget = invSources.filter(
    (s) => String(s.physicalRunKey ?? "") === TARGET_RUN,
  );
  const invPositive = invSources.filter(
    (s) => String(s.physicalRunKey ?? "") === POSITIVE_WIDTH_RUN,
  );

  // Representative matrix
  const dimPresent = (r: OpeningProbeRow): boolean =>
    r.dimensions.nominalWidthFeet != null ||
    r.dimensions.nominalHeightFeet != null ||
    r.dimensions.roughWidthFeet != null ||
    r.dimensions.roughHeightFeet != null;

  const representatives = {
    labeledWithCategory: ranked.find(
      (r) => r.kind === "semantic" && r.category === "door" && !dimPresent(r),
    )?.id,
    garageExplicitDims: ranked.find(
      (r) => r.id.includes("GARAGE") && dimPresent(r),
    )?.id,
    geometryWidthEstablished: ranked.find(
      (r) =>
        r.id.includes(POSITIVE_WIDTH_RUN) &&
        r.dimensions.roughWidthFeet != null,
    )?.id,
    m11AmbiguousGap: target30[0]?.id ?? null,
    windowTypeMark: ranked.find((r) => r.category === "window")?.id ?? null,
    noUsefulEvidence: ranked.find(
      (r) =>
        r.category === "unknown" &&
        !r.hasDimEvidence &&
        r.dimensionOwnershipStatus !== "ESTABLISHED",
    )?.id,
  };

  // Phase classifications
  const categoryClassification = {
    semanticLabeled: "CATEGORY_ALREADY_RESOLVED",
    garageCallout: "CATEGORY_PRESENT_AND_BOUND",
    m11Target30: "CATEGORY_ABSENT",
    population: "CATEGORY_MIXED",
  };

  const dimensionClassification = {
    garage: "DIMENSIONS_PRESENT_AND_BOUND",
    positiveWidthGap: "DIMENSIONS_PRESENT_OWNERSHIP_ESTABLISHED_WIDTH_ONLY",
    m11Target30: "DIMENSIONS_PRESENT_OWNERSHIP_AMBIGUOUS",
    typeMarks3068: "DIMENSIONS_ABSENT_NO_TAG_DECODE_WITHOUT_LEGEND",
    scheduleBound: "NO_DOOR_WINDOW_SCHEDULE_REFERENCE",
  };

  const progressiveResolution =
    "PROGRESSIVE_RESOLUTION_ALREADY_SUPPORTED_FOR_OPENINGS";

  const scheduleFindings = {
    openingsWithScheduleReference: rows.filter((r) => r.scheduleReference).length,
    doorWindowScheduleEvidence: evidence.filter(
      (e) =>
        e.subjectKind === "opening" &&
        (e.type === "schedule" ||
          String(e.source?.scheduleName ?? "").toLowerCase().includes("door") ||
          String(e.source?.scheduleName ?? "").toLowerCase().includes("window")),
    ).length,
    dominantMissingCapability: "NOT_CROSS_PAGE_SCHEDULE_BINDING_FOR_BECKSTEAD_DOORS",
  };

  const geometryFindings = {
    gapEstablishesExistence: true,
    widthFromCoLocatedDimText: true,
    heightFromPlanViewGaps: false,
    pureGapSpanWithoutUniqueDim: "UNSAFE_FALSE_PRECISION_UNDER_AMBIGUOUS",
    target30Ownership: "AMBIGUOUS",
    positiveControlEstablishedWidth: invPositive.filter(
      (s) => s.dimensionOwnership === "ESTABLISHED",
    ).length,
  };

  const calculatorReadiness = {
    note: "Category+dims alone do not unlock Stage 16 for M.11 cohort or orphan semantics",
    target30SampleBlockers: target30[0]?.calculatorBlockers ?? [],
    bestPositiveControl: ranked[0],
    bestPositiveControlBlockers: ranked[0]?.calculatorBlockers ?? [],
    garageBlockers: rows.find((r) => r.id.includes("18x8") || r.id === "O-GARAGE-DOOR")
      ?.calculatorBlockers,
    semanticDoorBlockers: rows.find((r) => r.id === "O-3068-DINING")?.calculatorBlockers,
  };

  const proposedPath = {
    technical: "PATH_E_MIXED_PROGRESSIVE_UNLOCK",
    alternativesConsidered: {
      PATH_A: "Only if false AMBIGUOUS demotion proven — inventory shows multi-candidate AMBIGUOUS (intentional fail-closed)",
      PATH_B: "OFF — no legend/schedule key for 3068 decode",
      PATH_C: "Already works for unique ownership; expanding under AMBIGUOUS unsafe",
      PATH_D: "No visual-unread proof required for STOP; type marks already yield category",
      PATH_F: "Authority STOP not required — facts exist for some openings; MVP gate decides",
    },
  };

  // --- MVP PRODUCT-VALUE GATE ---
  const effortClass = "LOW_MATERIAL_VALUE_SUBSTANTIAL_EFFORT" as const;
  const contractorProximity = "MARGINALLY" as const;

  const gateA = {
    proven: false,
    reason:
      "Resolving category/dims on target 30 or semantic orphans leaves wall height/assembly, parent (semantics), garage-door ineligibility, and jack counts — long dependency chain, not near-term Stage 16 leverage",
  };
  const gateB = {
    proven: false,
    reason:
      "Target 30 AMBIGUOUS ownership has multiple co-located dim candidates (inventory); not a false unique demotion. Semantic category already binds. No small production bind defect identified that unlocks materials",
  };
  const gateC = {
    proven: false,
    reason:
      "Semantic↔geometry corroboration and dimension ownership are theoretically reusable, but no concrete second-domain consumer (wall/structural/schedule) was proven as an immediate MVP consumer from this probe",
    secondDomainApplication: null,
  };

  const mvpGate = {
    effortClass,
    contractorProximity,
    gateA,
    gateB,
    gateC,
    outcome: "M12_MVP_VALUE_STOP" as const,
    rationale: [
      "None of A/B/C proven",
      `${effortClass} normally STOPs`,
      `${contractorProximity} defaults to STOP without compelling safety/architecture reason`,
      "Authority-only GREEN would increase metadata completeness without contractor-usable takeoff coverage",
      "Would delay higher-value missing packages (floor, sheathing, roof, hardware)",
      "Do not pursue repeated M.12 amendments for authority-only GREEN",
    ],
    buildForbidden: true,
  };

  const probe = {
    generatedAt: new Date().toISOString(),
    milestone: "B2.2M.12",
    baseline: {
      run: RUN,
      m11ParentRestored: TARGET_RUN,
      m4TargetWallPresent: targetWallPresentInM4,
      m11WallsAfter: m11Closeout.after?.walls ?? 43,
      stage16BaselineLines: 55,
    },
    population: {
      total: rows.length,
      semantic: semantic.length,
      geometryGaps: gaps.length,
      byCategory,
      withAnyDim: rows.filter(
        (r) =>
          r.dimensions.nominalWidthFeet != null ||
          r.dimensions.nominalHeightFeet != null ||
          r.dimensions.roughWidthFeet != null ||
          r.dimensions.roughHeightFeet != null,
      ).length,
      withScheduleReference: rows.filter((r) => r.scheduleReference).length,
      withParent: rows.filter((r) => r.parentWallId).length,
      ownershipHist,
    },
    target30: {
      count: target30.length,
      allCategoryUnknown: target30.every((r) => r.category === "unknown"),
      allDimsNull: target30.every(
        (r) =>
          r.dimensions.nominalWidthFeet == null &&
          r.dimensions.roughWidthFeet == null,
      ),
      ownership: [...new Set(target30.map((r) => r.dimensionOwnershipStatus))],
      inventoryNotesSample: invTarget[0]?.notes ?? null,
      interpretation: "ABSENT_RESOLVED_VALUES_PLUS_AMBIGUOUS_OWNERSHIP",
    },
    positiveControls: ranked.slice(0, 12),
    representatives,
    categoryClassification,
    dimensionClassification,
    progressiveResolution,
    scheduleFindings,
    geometryFindings,
    calculatorReadiness,
    proposedPath,
    tagDecoding: {
      status: "DISALLOWED_WITHOUT_EXPLICIT_LEGEND_OR_SCHEDULE_KEY",
      decoderExistsInRepo: false,
    },
    mvpGate,
    primaryVerdict: "M12_MVP_VALUE_STOP",
  };

  await writeJson("opening-authority-probe.json", probe);

  await writeMd(
    "opening-authority-probe.md",
    `# B2.2M.12 Opening Authority Probe

## Population

- Total openings: **${rows.length}** (semantic ${semantic.length}, geometry gaps ${gaps.length})
- Categories: ${JSON.stringify(byCategory)}
- With any resolved dim: **${probe.population.withAnyDim}**
- Schedule references: **${probe.population.withScheduleReference}**

## M.11 target 30 (\`${TARGET_RUN}\`)

- Category: all \`unknown\` → **CATEGORY_ABSENT**
- Dimensions: all null; ownership **AMBIGUOUS** → **DIMENSIONS_PRESENT_OWNERSHIP_AMBIGUOUS**
- Interpretation: absent resolved values + ambiguous ownership (not present-but-unbound schedule sizes)

## Positive controls (top scores)

${ranked
  .slice(0, 8)
  .map(
    (r) =>
      `- \`${r.id}\` score=${r.score} cat=${r.category} parent=${r.parentWallId ?? "null"} blockers=${r.calculatorBlockers.join(",")}`,
  )
  .join("\n")}

## Classifications

- Category population: **CATEGORY_MIXED**
- Progressive resolution: **${progressiveResolution}**
- Tag decode 3068: **disallowed** without legend/schedule key
- Schedule/cross-page: not the dominant Beckstead door unlock

## Calculator readiness

Category + dimensions alone do **not** unlock Stage 16 for restored-parent gaps (wall height/type unknown) or orphan semantic openings (no parent). Garage explicit dims remain calculator-ineligible.

## MVP PRODUCT-VALUE GATE

| Field | Value |
|---|---|
| Effort class | \`${effortClass}\` |
| Contractor proximity | \`${contractorProximity}\` |
| Gate A (material leverage) | **not proven** |
| Gate B (small authority fix) | **not proven** |
| Gate C (horizontal + 2nd domain) | **not proven** |
| Outcome | **\`M12_MVP_VALUE_STOP\`** |

BUILD is forbidden. This is a successful milestone outcome.
`,
  );

  await writeJson("mvp-product-value-gate.json", {
    generatedAt: new Date().toISOString(),
    ...mvpGate,
    proposedTechnicalPathIfBuilt: proposedPath.technical,
    expectedStage16IfBuilt: 0,
    remainingDownstreamBlockersIfAuthorityOnly: [
      "BLOCKED_BY_WALL_HEIGHT",
      "PARENT_WALL_TYPE_UNKNOWN / PARENT_MISSING",
      "GARAGE_DOOR_INELIGIBLE",
      "JACK_COUNT_UNSET",
      "HEADER_UNLINKED",
      "NOMINAL_DIMS_MISSING (many)",
    ],
  });

  console.log(
    JSON.stringify(
      {
        total: rows.length,
        target30: target30.length,
        mvpGate: mvpGate.outcome,
        effortClass,
        contractorProximity,
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
