import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../src/core/schemas/evidence.schema.js";
import type { CompiledDrawingPage } from "../../../src/drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../../src/drawing-compiler/schemas/physicalWallRun.schema.js";
import {
  buildWallExistenceEvidenceFromCompiledPages,
  isEligibleWallExistenceRun,
  WALL_EXISTENCE_PASS_ID,
  wallSubjectKeysFromEvidence,
} from "../../../src/scopes/framing/geometry/buildWallExistenceEvidenceFromCompiledPages.js";
import { resolveOpenings } from "../../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveWallFraming } from "../../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { calculateWallFraming } from "../../../src/scopes/framing/calculators/calculateWallFraming.js";
import { validateOpenings } from "../../../src/scopes/framing/validators/openings.validator.js";

function makeRun(
  overrides: Partial<PhysicalWallRunRecord> = {},
): PhysicalWallRunRecord {
  return {
    id: "lane:V:test",
    physicalRunKey: "physical-run:p4:eligible",
    pageNumber: 4,
    orientation: "V",
    sourceCandidateIds: [],
    faceSegmentIds: [1, 2, 3],
    thicknessPt: 12,
    centerline: { x1: 100, y1: 0, x2: 100, y2: 600 },
    endpoints: [
      { x: 100, y: 0 },
      { x: 100, y: 600 },
    ],
    lengthPt: 600,
    mid: { x: 100, y: 300 },
    openingGapSuspects: [
      { along: "y", gapPt: 36, at: { x: 100, y: 100 } },
      { along: "y", gapPt: 40, at: { x: 100, y: 200 } },
    ],
    junctions: [],
    connectedRunIds: [],
    wallAuthority: "high",
    authorityScore: 7,
    authorityReasons: ["long", "thickness-mode", "opening-suspect", "multi-junction"],
    ...overrides,
  };
}

function makePage(
  runs: PhysicalWallRunRecord[],
): CompiledDrawingPage {
  return {
    pageNumber: 4,
    geometry: { pbgRuns: runs },
    pageRole: { role: "plan" },
    governance: { emitDimIds: [] },
    ownership: { associations: [] },
  } as unknown as CompiledDrawingPage;
}

function wallEvidence(
  subjectKey: string,
  propertyPath: string,
  candidateValue: string | number,
): Evidence {
  return evidenceSchema.parse({
    id: `E-prior-${subjectKey}-${propertyPath}`.slice(0, 128),
    type: "geometry",
    relationship: "supports",
    description: "Prior wall property Evidence",
    source: {
      page: {
        documentId: null,
        pageNumber: 4,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: subjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: String(candidateValue),
    references: [],
    subjectKind: "wall",
    subjectKey,
    propertyPath,
    candidateValue,
    extractionPassId: "test-prior",
    bundleId: "test",
  });
}

function openingParentEvidence(
  openingKey: string,
  runKey: string,
): Evidence {
  return evidenceSchema.parse({
    id: `E-opening-parent-${openingKey}`.slice(0, 128),
    type: "geometry",
    relationship: "supports",
    description: "Opening parent run",
    source: {
      page: {
        documentId: null,
        pageNumber: 4,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: openingKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: runKey,
    references: [],
    subjectKind: "opening",
    subjectKey: openingKey,
    propertyPath: "parentPhysicalRunKey",
    candidateValue: runKey,
    extractionPassId: "opening-geometry-pbg",
    bundleId: "opening",
  });
}

describe("B2.2M.11 wall existence Evidence L1", () => {
  it("positive: high-authority corroborated run materializes exactly once", () => {
    const run = makeRun();
    const page = makePage([run]);
    const evidence = buildWallExistenceEvidenceFromCompiledPages([page]);

    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]!.subjectKind, "wall");
    assert.equal(evidence[0]!.subjectKey, run.physicalRunKey);
    assert.equal(evidence[0]!.propertyPath, "wallType");
    assert.equal(evidence[0]!.candidateValue, "unknown");
    assert.equal(evidence[0]!.extractionPassId, WALL_EXISTENCE_PASS_ID);
    assert.ok(evidence[0]!.description.includes(run.physicalRunKey));

    const walls = resolveWallFraming(evidence);
    assert.equal(walls.walls.length, 1);
    assert.equal(walls.segments.length, 1);
    assert.equal(walls.walls[0]!.id, run.physicalRunKey);
    assert.equal(walls.walls[0]!.wallType, "unknown");
    assert.equal(walls.walls[0]!.assembly.heightFeet, null);
    // Schema defaults bearing/location/phase to "unknown" enum — not invented scalars.
    assert.equal(walls.walls[0]!.bearingStatus, "unknown");
    assert.equal(walls.segments[0]!.lengthFeet, null);
    assert.equal(walls.segments[0]!.id, `WS-${run.physicalRunKey}`);
  });

  it("negative: reject and low authority do not materialize", () => {
    const page = makePage([
      makeRun({ wallAuthority: "reject", physicalRunKey: "physical-run:p4:rej" }),
      makeRun({ wallAuthority: "low", physicalRunKey: "physical-run:p4:low" }),
    ]);
    assert.equal(buildWallExistenceEvidenceFromCompiledPages([page]).length, 0);
  });

  it("negative: medium without enough corroborating reasons fails closed", () => {
    const page = makePage([
      makeRun({
        physicalRunKey: "physical-run:p4:med-weak",
        wallAuthority: "medium",
        authorityReasons: ["thickness-mode"],
      }),
    ]);
    assert.equal(isEligibleWallExistenceRun(page.geometry.pbgRuns[0]!), false);
    assert.equal(buildWallExistenceEvidenceFromCompiledPages([page]).length, 0);
  });

  it("negative: demand gate skips geometrically eligible run without opening parent demand", () => {
    const run = makeRun({ physicalRunKey: "physical-run:p4:undemanded" });
    const page = makePage([run]);
    const minted = buildWallExistenceEvidenceFromCompiledPages([page], {
      openingParentDemandedRunKeys: new Set(["physical-run:p4:other"]),
    });
    assert.equal(minted.length, 0);
  });

  it("positive: demand gate allows mint when opening parent demands the run", () => {
    const run = makeRun({ physicalRunKey: "physical-run:p4:demanded" });
    const page = makePage([run]);
    const minted = buildWallExistenceEvidenceFromCompiledPages([page], {
      openingParentDemandedRunKeys: new Set([run.physicalRunKey]),
    });
    assert.equal(minted.length, 1);
    assert.equal(minted[0]!.subjectKey, run.physicalRunKey);
  });

  it("negative: no opening gaps fails closed (not opening-count authority)", () => {
    const page = makePage([
      makeRun({
        physicalRunKey: "physical-run:p4:nogap",
        openingGapSuspects: [],
      }),
    ]);
    assert.equal(buildWallExistenceEvidenceFromCompiledPages([page]).length, 0);
  });

  it("negative: existing wall Evidence subject is not duplicated", () => {
    const run = makeRun();
    const page = makePage([run]);
    const prior = [wallEvidence(run.physicalRunKey, "lengthFeet", 20)];
    const existing = wallSubjectKeysFromEvidence(prior);
    const minted = buildWallExistenceEvidenceFromCompiledPages([page], {
      existingWallSubjectKeys: existing,
    });
    assert.equal(minted.length, 0);

    const walls = resolveWallFraming([...prior, ...minted]);
    assert.equal(walls.walls.length, 1);
  });

  it("negative: opening references alone cannot create a wall", () => {
    const openingEv = [
      openingParentEvidence(
        "opening:p4:physical-run:p4:ghost:gap0",
        "physical-run:p4:ghost",
      ),
    ];
    // No compiled pages / PBG run → no existence mint
    const minted = buildWallExistenceEvidenceFromCompiledPages([]);
    assert.equal(minted.length, 0);
    const walls = resolveWallFraming(openingEv);
    assert.equal(walls.walls.length, 0);
  });

  it("negative: unresolved secondary properties do not become assumptions", () => {
    const run = makeRun();
    const evidence = buildWallExistenceEvidenceFromCompiledPages([makePage([run])]);
    const walls = resolveWallFraming(evidence);
    const wall = walls.walls[0]!;
    assert.equal(wall.assembly.studSize, null);
    assert.equal(wall.assembly.studSpacingInches, null);
    assert.equal(wall.assembly.plateCount, null);
    assert.equal(wall.assembly.heightFeet, null);
    assert.equal(wall.assumptionIds.length, 0);

    const calc = calculateWallFraming(walls);
    assert.equal(calc.length, 0);
  });
});

describe("B2.2M.11 wall existence Evidence L2 mixed", () => {
  it("proves valid mint, skip duplicate, reject invalid, clear opening parent RI", () => {
    const validRun = makeRun({ physicalRunKey: "physical-run:p4:valid" });
    const alreadyRun = makeRun({
      physicalRunKey: "physical-run:p4:already",
      id: "lane:V:already",
    });
    const rejectRun = makeRun({
      physicalRunKey: "physical-run:p4:reject",
      wallAuthority: "reject",
      id: "lane:V:reject",
    });
    const noGapRun = makeRun({
      physicalRunKey: "physical-run:p4:nogap",
      openingGapSuspects: [],
      id: "lane:V:nogap",
    });

    const page = makePage([validRun, alreadyRun, rejectRun, noGapRun]);
    const priorWallEv = [
      wallEvidence(alreadyRun.physicalRunKey, "wallType", "wood-stud-wall"),
      wallEvidence(alreadyRun.physicalRunKey, "lengthFeet", 12),
    ];
    const existing = wallSubjectKeysFromEvidence(priorWallEv);
    const existence = buildWallExistenceEvidenceFromCompiledPages([page], {
      existingWallSubjectKeys: existing,
    });

    assert.equal(existence.length, 1);
    assert.equal(existence[0]!.subjectKey, validRun.physicalRunKey);

    const wallFraming = resolveWallFraming([...priorWallEv, ...existence]);
    assert.equal(wallFraming.walls.length, 2);
    assert.ok(wallFraming.walls.some((w) => w.id === validRun.physicalRunKey));
    assert.ok(wallFraming.walls.some((w) => w.id === alreadyRun.physicalRunKey));
    assert.ok(!wallFraming.walls.some((w) => w.id === rejectRun.physicalRunKey));
    assert.ok(!wallFraming.walls.some((w) => w.id === noGapRun.physicalRunKey));

    const validWall = wallFraming.walls.find((w) => w.id === validRun.physicalRunKey)!;
    assert.equal(validWall.assembly.heightFeet, null);
    const validSeg = wallFraming.segments.find(
      (s) => s.parentWallId === validRun.physicalRunKey,
    )!;
    assert.equal(validSeg.lengthFeet, null);

    const openingKey = `opening:p4:${validRun.physicalRunKey}:gap0`;
    const ghostKey = "opening:p4:physical-run:p4:ghost:gap0";
    const openingEv = [
      openingParentEvidence(openingKey, validRun.physicalRunKey),
      openingParentEvidence(ghostKey, "physical-run:p4:ghost"),
      evidenceSchema.parse({
        id: "E-opening-qty-valid",
        type: "geometry",
        relationship: "supports",
        description: "qty",
        source: {
          page: {
            documentId: null,
            pageNumber: 4,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          tileId: null,
          elementLabel: openingKey,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "1",
        references: [],
        subjectKind: "opening",
        subjectKey: openingKey,
        propertyPath: "quantity",
        candidateValue: 1,
        extractionPassId: "opening-geometry-pbg",
        bundleId: "opening",
      }),
      evidenceSchema.parse({
        id: "E-opening-qty-ghost",
        type: "geometry",
        relationship: "supports",
        description: "qty",
        source: {
          page: {
            documentId: null,
            pageNumber: 4,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          tileId: null,
          elementLabel: ghostKey,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "1",
        references: [],
        subjectKind: "opening",
        subjectKey: ghostKey,
        propertyPath: "quantity",
        candidateValue: 1,
        extractionPassId: "opening-geometry-pbg",
        bundleId: "opening",
      }),
    ];

    const openings = resolveOpenings(openingEv, { wallFraming });
    assert.equal(openings.openings.length, 2);

    const parentObjectsById = new Map(
      [
        ...wallFraming.walls.map((wall) => [
          wall.id,
          { objectId: wall.id, objectType: wall.objectType },
        ] as const),
        ...wallFraming.segments.map((segment) => [
          segment.id,
          { objectId: segment.id, objectType: segment.objectType },
        ] as const),
      ],
    );

    const validation = validateOpenings({
      payload: openings,
      parentObjectsById,
      structuralMembersById: new Map(),
    });

    const parentIssues = validation.validationIssues.filter(
      (issue) =>
        issue.ruleId === "opening.parent.resolved" ||
        issue.ruleId === "opening.parentWall.resolved",
    );
    const validOpening = openings.openings.find((o) =>
      o.id.includes("valid"),
    )!;
    const ghostOpening = openings.openings.find((o) =>
      o.id.includes("ghost"),
    )!;

    const validParentIssues = parentIssues.filter(
      (issue) => issue.target.objectId === validOpening.id,
    );
    const ghostParentIssues = parentIssues.filter(
      (issue) => issue.target.objectId === ghostOpening.id,
    );

    assert.equal(validParentIssues.length, 0);
    assert.ok(ghostParentIssues.length >= 1);

    // Null-length existence wall does not emit stud/plate materials
    const calcLines = calculateWallFraming(wallFraming);
    const validWallLines = calcLines.filter((li) =>
      (li.sourceObjectIds ?? []).some(
        (id) =>
          id === validRun.physicalRunKey ||
          id === `WS-${validRun.physicalRunKey}`,
      ),
    );
    assert.equal(validWallLines.length, 0);
  });
});
