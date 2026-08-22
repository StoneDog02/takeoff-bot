import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { aggregateExtractionEvidencePasses } from "../../src/plans/aggregateExtractionEvidencePasses.js";
import { extractedFramingEvidencePayloadSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { normalizeOpeningCandidate } from "../../src/scopes/framing/resolvers/openingPropertyPaths.js";
import { buildSystemPrompt } from "../../src/scopes/framing/prompts/extractFramingEvidence.js";

function openingRecord(input: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number | null;
  pageNumber: number;
  tileId?: string | null;
  originalText: string;
}) {
  return evidenceSchema.parse({
    id: input.id,
    type: "dimension",
    relationship: "supports",
    description: "source-grounded opening fact",
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
    originalText: input.originalText,
    references: [],
    subjectKind: "opening",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: null,
    bundleId: null,
  });
}

describe("visual opening Evidence contract", () => {
  it("represents source-grounded garage-door dimensions without inventing framing math", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        openingRecord({
          id: "E-GARAGE-CAT",
          subjectKey: "GARAGE DOOR",
          propertyPath: "category",
          candidateValue: "garage-door",
          pageNumber: 4,
          tileId: "t-r2-c2",
          originalText: "labeled garage door opening",
        }),
        openingRecord({
          id: "E-GARAGE-W",
          subjectKey: "GARAGE DOOR",
          propertyPath: "dimensions.nominalWidthFeet",
          candidateValue: 18,
          pageNumber: 4,
          tileId: "t-r2-c2",
          originalText: "explicit garage width label",
        }),
        openingRecord({
          id: "E-GARAGE-H",
          subjectKey: "GARAGE DOOR",
          propertyPath: "dimensions.nominalHeightFeet",
          candidateValue: 8,
          pageNumber: 4,
          tileId: "t-r2-c2",
          originalText: "explicit garage height label",
        }),
        openingRecord({
          id: "E-GARAGE-HDR",
          subjectKey: "GARAGE DOOR",
          propertyPath: "headerMemberTag",
          candidateValue: "HDR-EXAMPLE",
          pageNumber: 4,
          tileId: "t-r2-c2",
          originalText: "linked header mark at opening",
        }),
      ],
    });

    assert.equal(payload.evidence.length, 4);
    assert.equal(
      normalizeOpeningCandidate("category", "garage-door"),
      "garage-door",
    );
    assert.equal(
      normalizeOpeningCandidate("dimensions.nominalWidthFeet", 18),
      18,
    );
    assert.ok(
      !payload.evidence.some(
        (record) =>
          record.propertyPath === "kingStudCount" ||
          record.propertyPath === "jackStudCount",
      ),
    );
  });

  it("keeps multiple distinct visual openings as separate subjects with correct attachments", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        openingRecord({
          id: "E-DOOR-A-CAT",
          subjectKey: "DOOR A",
          propertyPath: "category",
          candidateValue: "door",
          pageNumber: 4,
          tileId: "t-r0-c1",
          originalText: "door swing A",
        }),
        openingRecord({
          id: "E-DOOR-A-W",
          subjectKey: "DOOR A",
          propertyPath: "dimensions.nominalWidthFeet",
          candidateValue: 2.5,
          pageNumber: 4,
          tileId: "t-r0-c1",
          originalText: "width for door A only",
        }),
        openingRecord({
          id: "E-WIN-B-CAT",
          subjectKey: "WINDOW B",
          propertyPath: "category",
          candidateValue: "window",
          pageNumber: 4,
          tileId: "t-r1-c2",
          originalText: "window symbol B",
        }),
        openingRecord({
          id: "E-WIN-B-HDR",
          subjectKey: "WINDOW B",
          propertyPath: "headerMemberTag",
          candidateValue: "HDR-B",
          pageNumber: 4,
          tileId: "t-r1-c2",
          originalText: "header leader at window B",
        }),
        openingRecord({
          id: "E-GARAGE-C-CAT",
          subjectKey: "GARAGE C",
          propertyPath: "category",
          candidateValue: "garage-door",
          pageNumber: 4,
          tileId: "t-r2-c2",
          originalText: "garage opening C",
        }),
      ],
    });

    const subjects = [
      ...new Set(payload.evidence.map((record) => record.subjectKey)),
    ];
    assert.deepEqual(subjects.sort(), ["DOOR A", "GARAGE C", "WINDOW B"]);
    assert.equal(
      payload.evidence.find((record) => record.id === "E-DOOR-A-W")
        ?.subjectKey,
      "DOOR A",
    );
    assert.equal(
      payload.evidence.find((record) => record.id === "E-WIN-B-HDR")
        ?.candidateValue,
      "HDR-B",
    );
    assert.ok(
      !payload.evidence.some((record) => record.propertyPath === "parentWallTag"),
    );
  });

  it("allows tile-sourced tileId and full-sheet-sourced null without post-hoc guessing", () => {
    const stamped = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: {
            extractionPassId: "pass-openings",
            bundleId: "bundle:framing:wall-framing:p4-1",
          },
          evidence: [
            openingRecord({
              id: "E-TILE-DOOR",
              subjectKey: "DOOR TILE",
              propertyPath: "category",
              candidateValue: "door",
              pageNumber: 4,
              tileId: "t-r0-c1",
              originalText: "read from tile",
            }),
            openingRecord({
              id: "E-SHEET-NOTE",
              subjectKey: "DOOR TILE",
              propertyPath: "scheduleReference",
              candidateValue: "SCHEDULE REF",
              pageNumber: 4,
              tileId: null,
              originalText: "read from full sheet only",
            }),
          ],
        },
      ],
    });

    assert.equal(stamped[0]?.source.tileId, "t-r0-c1");
    assert.equal(stamped[1]?.source.tileId, null);
    assert.equal(stamped[0]?.extractionPassId, "pass-openings");
    assert.equal(stamped[0]?.bundleId, "bundle:framing:wall-framing:p4-1");
  });

  it("documents multi-opening search and tile provenance guidance without project literals", () => {
    const prompt = buildSystemPrompt("kb");
    assert.match(prompt, /opening visual floor-plan search rules/);
    assert.match(prompt, /Do not stop\n {2}after finding one prominent opening/);
    assert.match(prompt, /Emit a separate opening subjectKey for each distinct/);
    assert.match(prompt, /Tile provenance: when a fact is read from an attached Tile/);
    assert.match(prompt, /"tileId": "t-r0-c1"/);
    assert.match(prompt, /"tileId": null/);
    assert.doesNotMatch(prompt, /18'x8'/);
    assert.doesNotMatch(prompt, /Beckstead/);
    assert.doesNotMatch(prompt, /pageNumber === 4/);
    assert.doesNotMatch(prompt, /#5050/);
  });
});
