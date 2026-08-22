import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import {
  aggregateExtractionEvidencePasses,
  groupRepeatedEvidenceObservations,
} from "../../src/plans/aggregateExtractionEvidencePasses.js";
import {
  buildSequentialExtractionPageBundles,
  planIntentExtractionRouting,
} from "../../src/plans/deriveRoleAssignmentsFromPageClassification.js";
import {
  classifiedPlanPageSchema,
  type ClassifiedPlanPage,
} from "../../src/plans/pageClassification.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";
import { estimateBundleImageCount } from "../../src/plans/buildExtractionPageBundles.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../src/plans/visualImageBudget.js";

function wallEvidence(input: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number;
  pageNumber: number;
  tileId?: string | null;
}): Evidence {
  return {
    id: input.id,
    type: "note",
    relationship: "supports",
    description: "synthetic",
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: input.tileId ?? null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: "synthetic",
    references: [],
    subjectKind: "wall",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: null,
    bundleId: null,
  };
}

function planIndexWithPages(pageCount: number): PlanIndex {
  return {
    pdfPath: "/tmp/synthetic.pdf",
    totalPages: pageCount,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "a".repeat(64),
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      sheetId: `S${index + 1}`,
      label: `Sheet ${index + 1}`,
      textContent: "",
    })),
  };
}

describe("B1.6 multi-primary Evidence aggregation", () => {
  it("routes Beckstead wall-framing into two distinct sequential bundles sharing page 1", () => {
    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures/beckstead-b1.4-live-classification.json",
    );
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      pages: ClassifiedPlanPage[];
    };
    const pages = fixture.pages.map((page) => classifiedPlanPageSchema.parse(page));
    const routing = planIntentExtractionRouting({
      pages,
      intent: "wall-framing",
    });
    assert.equal(routing.routingSafe, true);
    assert.deepEqual(routing.primaryPageNumbers, [3, 4]);

    const bundles = buildSequentialExtractionPageBundles({
      planIndex: planIndexWithPages(11),
      scopeName: "framing",
      routingPlan: routing,
    });
    assert.equal(bundles.length, 2);
    assert.notEqual(bundles[0]!.bundleId, bundles[1]!.bundleId);
    assert.ok(
      bundles[0]!.members.some((m) => m.role === "primary" && m.pageNumber === 3),
    );
    assert.ok(
      bundles[1]!.members.some((m) => m.role === "primary" && m.pageNumber === 4),
    );
    for (const bundle of bundles) {
      assert.ok(bundle.members.some((m) => m.role === "global" && m.pageNumber === 1));
      assert.equal(estimateBundleImageCount(bundle.members, 12), 14);
      assert.ok(
        bundle.imageBudget.estimatedImages <= MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST,
      );
    }
  });

  it("aggregates two passes into one graph with pass/bundle/page/tile provenance", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: {
            extractionPassId: "pass-a-p3",
            bundleId: "bundle:framing:wall-framing:p3-1",
          },
          evidence: [
            wallEvidence({
              id: "E-SW2-TYPE",
              subjectKey: "SW2",
              propertyPath: "wallType",
              candidateValue: "shear wall",
              pageNumber: 3,
              tileId: "t-r1-c1",
            }),
            wallEvidence({
              id: "E-SW2-SHEATH",
              subjectKey: "SW2",
              propertyPath: "assembly.sheathing",
              candidateValue: "7/16 OSB",
              pageNumber: 1,
            }),
          ],
        },
        {
          stamp: {
            extractionPassId: "pass-b-p4",
            bundleId: "bundle:framing:wall-framing:p4-1",
          },
          evidence: [
            wallEvidence({
              id: "E-SW2-LOC",
              subjectKey: "SW2",
              propertyPath: "location",
              candidateValue: "exterior",
              pageNumber: 4,
              tileId: "t-r0-c2",
            }),
            wallEvidence({
              id: "E-SW2-SHEATH",
              subjectKey: "SW2",
              propertyPath: "assembly.sheathing",
              candidateValue: "7/16 OSB",
              pageNumber: 1,
            }),
          ],
        },
      ],
    });

    assert.equal(aggregated.length, 4);
    assert.equal(aggregated[0]?.extractionPassId, "pass-a-p3");
    assert.equal(aggregated[0]?.bundleId, "bundle:framing:wall-framing:p3-1");
    assert.equal(aggregated[0]?.source.tileId, "t-r1-c1");
    assert.equal(aggregated[3]?.id, "E-SW2-SHEATH:pass-b-p4");
    assert.equal(aggregated[3]?.extractionPassId, "pass-b-p4");

    const repeated = groupRepeatedEvidenceObservations(aggregated);
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0]?.records.length, 2);

    // Aggregation does not resolve — callers resolve the combined graph once.
    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 1);
    assert.equal(resolved.walls[0]?.assembly.sheathing, "7/16 OSB");
    assert.equal(resolved.walls[0]?.location, "exterior");
  });

  it("keeps corroboration and conflicts distinct; matching properties do not collapse subjects", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: { extractionPassId: "a", bundleId: "ba" },
          evidence: [
            wallEvidence({
              id: "E-A-SPACE",
              subjectKey: "WALL-A",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 16,
              pageNumber: 3,
            }),
            wallEvidence({
              id: "E-B-SPACE",
              subjectKey: "WALL-B",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 16,
              pageNumber: 4,
            }),
          ],
        },
        {
          stamp: { extractionPassId: "b", bundleId: "bb" },
          evidence: [
            wallEvidence({
              id: "E-A-SPACE-B",
              subjectKey: "WALL-A",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 24,
              pageNumber: 3,
            }),
          ],
        },
      ],
    });

    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 2);
    const wallA = resolved.walls.find((wall) => wall.name === "WALL-A");
    const wallB = resolved.walls.find((wall) => wall.name === "WALL-B");
    assert.ok(wallA);
    assert.ok(wallB);
    assert.equal(wallA.assembly.studSpacingInches, null); // conflict
    assert.equal(wallB.assembly.studSpacingInches, 16);
  });
});
