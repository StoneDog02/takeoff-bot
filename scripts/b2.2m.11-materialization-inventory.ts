#!/usr/bin/env npx tsx
/**
 * B2.2M.11 Phase 0–4: freeze Beckstead physical-run / wall / opening inventory.
 *
 * Reads frozen audit-b artifacts; does not modify Burton source or invent walls.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/b2.2m.11/metrics");
const COMPILED = path.join(
  ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/05-compiledDrawingPages.json",
);
const EVIDENCE = path.join(
  ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/06-extractedEvidence.json",
);
const WALLS = path.join(
  ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/07-wallFraming.json",
);
const OPENINGS = path.join(
  ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/08-openings.json",
);

const TARGET = "physical-run:p4:fd36917c47ec";

async function loadPayload(filePath: string): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as {
    payload?: Record<string, unknown>;
  };
  return raw.payload ?? raw;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const compiled = await loadPayload(COMPILED);
  const evidencePayload = await loadPayload(EVIDENCE);
  const wallPayload = await loadPayload(WALLS);
  const openingPayload = await loadPayload(OPENINGS);

  const pages = (compiled.pages ?? []) as Array<{
    pageNumber: number;
    geometry: {
      pbgRuns: Array<{
        physicalRunKey: string;
        id: string;
        orientation: string;
        lengthPt: number;
        thicknessPt: number | null;
        wallAuthority: string;
        authorityScore: number;
        authorityReasons: string[];
        faceSegmentIds: number[];
        openingGapSuspects: unknown[];
        centerline: unknown;
        mid: unknown;
      }>;
    };
    ownership?: { associations?: Array<Record<string, unknown>> };
    governance?: { emitDimIds?: string[] };
    semanticDereference?: { bindings?: Array<Record<string, unknown>> };
  }>;

  const evidence = (evidencePayload.evidence ?? []) as Array<{
    subjectKind: string;
    subjectKey: string;
    propertyPath: string;
    candidateValue: unknown;
  }>;

  const walls = (wallPayload.walls ?? []) as Array<{ id: string }>;
  const openings = (openingPayload.openings ?? []) as Array<{
    id: string;
    parentWallId: string | null;
    parentObjectId: string | null;
    category: string;
    dimensions: Record<string, unknown> | null;
  }>;

  const pbgKeys = new Map<string, (typeof pages)[0]["geometry"]["pbgRuns"][0] & { pageNumber: number }>();
  for (const page of pages) {
    for (const run of page.geometry.pbgRuns) {
      pbgKeys.set(run.physicalRunKey, { ...run, pageNumber: page.pageNumber });
    }
  }

  const wallIds = new Set(walls.map((w) => w.id));
  const wallEvKeys = new Set(
    evidence.filter((e) => e.subjectKind === "wall").map((e) => e.subjectKey),
  );

  const parentCounts = new Map<string, number>();
  for (const opening of openings) {
    if (!opening.parentWallId) continue;
    parentCounts.set(
      opening.parentWallId,
      (parentCounts.get(opening.parentWallId) ?? 0) + 1,
    );
  }

  const missingParents = [...parentCounts.entries()].filter(
    ([id]) => !wallIds.has(id),
  );

  const highMedWithoutWallEv = [...pbgKeys.values()].filter(
    (r) =>
      (r.wallAuthority === "high" || r.wallAuthority === "medium") &&
      !wallEvKeys.has(r.physicalRunKey),
  );

  const target = pbgKeys.get(TARGET) ?? null;
  const targetPage = pages.find((p) => p.pageNumber === 4);
  const targetDims =
    targetPage?.ownership?.associations?.filter(
      (a) => a.physicalRunKey === TARGET,
    ) ?? [];
  const targetDeref =
    targetPage?.semanticDereference?.bindings?.filter(
      (b) => b.physicalRunKey === TARGET,
    ) ?? [];
  const targetOpeningEvidence = evidence.filter(
    (e) =>
      e.subjectKind === "opening" && String(e.subjectKey).includes(TARGET),
  );
  const targetOpenings = openings.filter((o) => o.parentWallId === TARGET);

  const inventory = {
    generatedAt: new Date().toISOString(),
    milestone: "B2.2M.11",
    sourceArtifacts: { COMPILED, EVIDENCE, WALLS, OPENINGS },
    classification: "SYSTEMATIC_WALL_MATERIALIZATION_DEFECT",
    counts: {
      pbgRuns: pbgKeys.size,
      wallEvidenceSubjects: wallEvKeys.size,
      resolvedWalls: wallIds.size,
      openings: openings.length,
      uniqueOpeningParents: parentCounts.size,
      openingParentsMissingFromWalls: missingParents.length,
      highMediumPbgWithoutWallEvidence: highMedWithoutWallEv.length,
    },
    missingOpeningParents: missingParents.map(([id, n]) => ({
      parentWallId: id,
      openingCount: n,
      inPbg: pbgKeys.has(id),
      inWallEvidence: wallEvKeys.has(id),
    })),
    targetRun: {
      physicalRunKey: TARGET,
      present: target != null,
      run: target,
      emitDimIds: targetPage?.governance?.emitDimIds ?? [],
      dimAssociations: targetDims,
      semanticDereference: targetDeref,
      wallEvidenceCount: evidence.filter(
        (e) => e.subjectKind === "wall" && e.subjectKey === TARGET,
      ).length,
      openingEvidenceByProperty: Object.fromEntries(
        [...targetOpeningEvidence.reduce((m, e) => {
          m.set(e.propertyPath, (m.get(e.propertyPath) ?? 0) + 1);
          return m;
        }, new Map<string, number>())],
      ),
      openings: {
        count: targetOpenings.length,
        categories: Object.fromEntries(
          [...targetOpenings.reduce((m, o) => {
            m.set(o.category, (m.get(o.category) ?? 0) + 1);
            return m;
          }, new Map<string, number>())],
        ),
        allDimensionsNull: targetOpenings.every(
          (o) =>
            o.dimensions == null ||
            Object.values(o.dimensions).every((v) => v == null),
        ),
      },
      forensicAnswers: {
        A_firstIdentity: "PBG scoreAuthority → physical-run:p4:{hash}; lane:V:c1b6a1d78123",
        E_wallEvidence: "none",
        F_genuineWallRun: true,
        G_equivalentWall: false,
        M_identityDiverge: false,
        N_openingsWrongParent: false,
        O_nonWallSubject: false,
        defectClass: "MATERIALIZATION",
      },
    },
  };

  const outPath = path.join(OUT_DIR, "materialization-inventory.json");
  await writeFile(outPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

  const md = `# M.11 Materialization Inventory (frozen)

Classification: **SYSTEMATIC_WALL_MATERIALIZATION_DEFECT**

| Metric | Count |
|--------|------:|
| PBG runs | ${inventory.counts.pbgRuns} |
| Wall Evidence subjects | ${inventory.counts.wallEvidenceSubjects} |
| Resolved walls | ${inventory.counts.resolvedWalls} |
| High/medium PBG without wall Evidence | ${inventory.counts.highMediumPbgWithoutWallEvidence} |
| Opening parents missing from walls | ${inventory.counts.openingParentsMissingFromWalls} |

Target \`${TARGET}\`: present=${inventory.targetRun.present}, wallEvidence=${inventory.targetRun.wallEvidenceCount}, openings=${inventory.targetRun.openings.count}, allDimensionsNull=${inventory.targetRun.openings.allDimensionsNull}.

Defect: **MATERIALIZATION** (existence Evidence gap), not identity translation.
`;
  await writeFile(path.join(OUT_DIR, "materialization-inventory.md"), md, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
