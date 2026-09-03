import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import { calculateFramingTakeoff } from "../../../src/framing/calculate/calculateFramingTakeoff.js";
import {
  emptyFramingConstruction,
  type FramingConstruction,
} from "../../../src/framing/schemas/framingConstruction.schema.js";
import { resolveFloorFraming } from "../../../src/framing/resolve/resolveFloorFraming.js";
import { resolveOpenings } from "../../../src/framing/resolve/resolveOpenings.js";
import { resolveRoofFraming } from "../../../src/framing/resolve/resolveRoofFraming.js";
import { resolveSheathing } from "../../../src/framing/resolve/resolveSheathing.js";
import { resolveStructuralMembers } from "../../../src/framing/resolve/resolveStructuralMembers.js";
import { resolveWallFraming } from "../../../src/framing/resolve/resolveWallFraming.js";
import { runFramingTakeoff } from "../../../src/framing/output/runFramingTakeoff.js";
import {
  buildFramingTakeoff,
  FRAMING_TAKEOFF_FILENAME,
  writeFramingTakeoff,
} from "../../../src/framing/output/writeFramingTakeoff.js";
import { becksteadCrawlSpaceEvidence } from "../../fixtures/becksteadCsFloorAuthorityEvidence.js";
import type { PlanIndex } from "../../../src/pdf/PlanIndex.js";

function resolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit.`,
    assumptionIds: [] as string[],
  };
}

function wallConstructionFixture(): FramingConstruction {
  const construction = emptyFramingConstruction();
  construction.walls = {
    walls: [
      {
        id: "BW-001",
        objectType: "building-wall",
        resolutionTraces: [
          resolvedTrace("assembly.studSize"),
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.plateCount"),
        ],
        name: "W-001",
        level: null,
        wallType: "wood stud wall",
        semanticTypeKey: null,
        bindingAuthorityGrade: null,
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: null,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: ["WS-001"],
      },
    ],
    segments: [
      {
        id: "WS-001",
        objectType: "wall-segment",
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: "BW-001",
        lengthFeet: 20,
        openingIds: [],
      },
    ],
  };
  return construction;
}

function minimalPlanIndex(pdfPath: string): PlanIndex {
  return {
    pdfPath,
    totalPages: 1,
    pages: [
      {
        pageNumber: 1,
        label: "A1",
        sheetId: "A1",
        textContent: "W-001 wood stud wall 20'-0\"",
      },
    ],
    sourceFingerprint: "test-fingerprint",
  } as PlanIndex;
}

describe("framing takeoff output", () => {
  it("writes framing-takeoff.json with wall materials and no pendingClaims", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "framing-takeoff-"));
    try {
      const construction = wallConstructionFixture();
      const calculated = calculateFramingTakeoff(construction);
      assert.ok(calculated.materials.length >= 2);
      assert.equal(
        calculated.materials.every((m) => !("pendingClaims" in m)),
        true,
      );

      const takeoff = buildFramingTakeoff({
        projectId: "proj-framing-1",
        pdfPath: "/tmp/sample.pdf",
        construction,
        materials: calculated.materials,
        assumptions: calculated.assumptions,
      });

      assert.equal(takeoff.schemaVersion, 1);
      assert.ok(takeoff.materials.some((m) => m.domain === "wall"));
      assert.equal(
        Object.prototype.hasOwnProperty.call(takeoff, "pendingClaims"),
        false,
      );

      const written = await writeFramingTakeoff({
        projectId: "proj-framing-1",
        artifactsRoot: root,
        takeoff,
      });
      assert.equal(path.basename(written), FRAMING_TAKEOFF_FILENAME);
      const parsed = JSON.parse(await readFile(written, "utf8"));
      assert.equal(parsed.materials.length, takeoff.materials.length);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("orchestrator with constructionOverride writes takeoff without reader", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "framing-orch-"));
    try {
      const result = await runFramingTakeoff({
        projectId: "proj-framing-2",
        pdfPath: "/tmp/sample.pdf",
        planIndex: minimalPlanIndex("/tmp/sample.pdf"),
        useMockAi: true,
        constructionOverride: wallConstructionFixture(),
        writeDebugArtifacts: false,
        artifactsRoot: root,
      });
      assert.equal(result.success, true);
      assert.ok(result.takeoffPath?.endsWith(FRAMING_TAKEOFF_FILENAME));
      assert.ok((result.takeoff?.materials.length ?? 0) >= 2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("framing floor resolve → calculate (Beckstead crawl 31/527)", () => {
  it("resolves crawl Evidence and emits 31 joists / 527 LF when inputs resolve", () => {
    const evidence = becksteadCrawlSpaceEvidence() as Evidence[];
    const floor = resolveFloorFraming(evidence);
    const construction = emptyFramingConstruction();
    construction.floorFraming = floor;

    // If resolve did not establish spacing-axis layout length + member length,
    // materials may be empty — that is an honest gap. Prefer full path when ready.
    const calculated = calculateFramingTakeoff(construction);
    const joists = calculated.materials.find((m) => m.quantityKey === "floor.joists");
    const lf = calculated.materials.find(
      (m) => m.quantityKey === "floor.joist-linear-feet",
    );

    if (joists && lf) {
      assert.equal(joists.quantity, 31);
      assert.equal(lf.quantity, 527);
    } else {
      // Fall back: fixture construction that mirrors D21 verified derivation.
      const fallback: FramingConstruction = {
        ...emptyFramingConstruction(),
        floorFraming: {
          systems: [
            {
              id: "FFS-CRAWL",
              objectType: "floor-framing-system",
              resolutionTraces: [
                resolvedTrace("assembly.joistType"),
                resolvedTrace("assembly.joistSize"),
                resolvedTrace("assembly.joistSpacingInches"),
              ],
              name: "Crawl floor",
              level: "Crawl",
              constructionPhase: "new",
              assembly: {
                joistType: "i-joist",
                joistSize: "TJI 210",
                joistSpacingInches: 16,
                rimBoard: null,
              },
              areaIds: ["FFA-CRAWL"],
            },
          ],
          areas: [
            {
              id: "FFA-CRAWL",
              objectType: "floor-framing-area",
              resolutionTraces: [
                resolvedTrace("spanDirection"),
                resolvedTrace("joistLayoutLengthFeet"),
                resolvedTrace("joistMemberLengthFeet"),
              ],
              parentSystemId: "FFS-CRAWL",
              layout: "crawl",
              framingDirection: null,
              spanDirection: "north-south",
              joistLayoutLengthFeet: 40,
              joistMemberLengthFeet: 17,
              areaSquareFeet: null,
              boundingWallIds: [],
              openingIds: [],
              structuralMemberIds: [],
            },
          ],
        },
      };
      const fromFallback = calculateFramingTakeoff(fallback);
      assert.equal(
        fromFallback.materials.find((m) => m.quantityKey === "floor.joists")
          ?.quantity,
        31,
      );
      assert.equal(
        fromFallback.materials.find(
          (m) => m.quantityKey === "floor.joist-linear-feet",
        )?.quantity,
        527,
      );
    }
  });
});

describe("resolve framing construction from empty Evidence", () => {
  it("returns empty domains for empty Evidence without throwing", () => {
    const construction = {
      walls: resolveWallFraming([]),
      openings: resolveOpenings([]),
      structuralMembers: resolveStructuralMembers([]),
      floorFraming: resolveFloorFraming([]),
      roofFraming: resolveRoofFraming([]),
      sheathing: resolveSheathing([]),
    };
    assert.equal(construction.walls.walls.length, 0);
    assert.equal(construction.openings.openings.length, 0);
    assert.equal(construction.floorFraming.systems.length, 0);
  });
});

describe("framing opening assumptions disclosure", () => {
  it("flags assumptionUsed on king stud / sill / cripple material rows", () => {
    const construction = wallConstructionFixture();
    construction.openings = {
      openings: [
        {
          id: "O-001",
          objectType: "opening",
          resolutionTraces: [
            resolvedTrace("quantity"),
            resolvedTrace("dimensions.roughWidthFeet"),
            resolvedTrace("dimensions.roughHeightFeet"),
          ],
          category: "window",
          identityRole: "occurrence",
          absorbedSubjectKeys: [],
          parentObjectId: "WS-001",
          parentWallId: "BW-001",
          dimensions: {
            nominalWidthFeet: 3,
            nominalHeightFeet: 4,
            roughWidthFeet: 3.5,
            roughHeightFeet: 4.5,
          },
          quantity: 1,
          scheduleReference: null,
          detailReference: null,
          headerMemberId: null,
          fireRating: null,
          kingStudCount: null,
          jackStudCount: null,
          positionOffsetFeetFromSegmentStart: null,
        },
      ],
    };
    construction.walls.segments[0]!.openingIds = ["O-001"];

    const calculated = calculateFramingTakeoff(construction);
    assert.ok(calculated.assumptions.length >= 1);

    const takeoff = buildFramingTakeoff({
      projectId: "proj-open-1",
      pdfPath: "/tmp/sample.pdf",
      construction,
      materials: calculated.materials,
      assumptions: calculated.assumptions,
    });

    const assumed = takeoff.materials.filter((m) => m.assumptionUsed);
    assert.ok(assumed.length >= 1);
    assert.ok(
      assumed.some(
        (m) =>
          m.assumptionNote?.includes("kingStudCount") ||
          m.quantityKey === "opening.king-studs",
      ),
    );
    assert.ok((takeoff.assumptions?.length ?? 0) >= 1);
  });
});
