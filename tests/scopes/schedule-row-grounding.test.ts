import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { buildSystemPrompt } from "../../src/scopes/framing/prompts/extractFramingEvidence.js";
import { linkOpeningHeaderRelationships } from "../../src/scopes/framing/resolvers/linkOpeningHeaderRelationships.js";
import { resolveOpenings } from "../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveStructuralMembers } from "../../src/scopes/framing/resolvers/resolveStructuralMembers.js";
import { extractedFramingEvidencePayloadSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

function record(input: {
  id: string;
  subjectKind: "opening" | "wall" | "structural-member";
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number | null;
  pageNumber?: number;
  tileId?: string | null;
  originalText: string;
}) {
  return evidenceSchema.parse({
    id: input.id,
    type: "schedule",
    relationship: "supports",
    description: "source-grounded fact",
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber ?? 1,
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
    subjectKind: input.subjectKind,
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
  });
}

describe("schedule-row grounding and opening property completeness contract", () => {
  it("keeps schedule properties isolated to matching subjects without neighbor leak", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        record({
          id: "E-SW-A-SHEATH",
          subjectKind: "wall",
          subjectKey: "SW-A",
          propertyPath: "assembly.sheathing",
          candidateValue: "7/16 in OSB",
          originalText: "SW-A 7/16 in OSB ONE SIDE",
        }),
        record({
          id: "E-SW-B-DETAIL",
          subjectKind: "wall",
          subjectKey: "SW-B",
          propertyPath: "detailReference",
          candidateValue: "5/S9.9",
          originalText: "SW-B SEE DETAIL 5/S9.9",
        }),
      ],
    });

    const byKey = new Map(
      payload.evidence.map((item) => [item.subjectKey, item] as const),
    );
    assert.equal(byKey.get("SW-A")?.propertyPath, "assembly.sheathing");
    assert.equal(byKey.get("SW-B")?.propertyPath, "detailReference");
    assert.ok(
      !payload.evidence.some(
        (item) =>
          item.subjectKey === "SW-B" && item.propertyPath === "assembly.sheathing",
      ),
    );
    assert.ok(
      !payload.evidence.some(
        (item) =>
          item.subjectKey === "SW-C" && item.propertyPath === "assembly.sheathing",
      ),
    );
  });

  it("represents type-mark identity without inventing dimensions or framing math", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        record({
          id: "E-MARK-CAT",
          subjectKind: "opening",
          subjectKey: "TYPE MARK A",
          propertyPath: "category",
          candidateValue: "door",
          pageNumber: 4,
          tileId: "t-r0-c1",
          originalText: "type mark at door symbol",
        }),
        record({
          id: "E-EXPLICIT-W",
          subjectKind: "opening",
          subjectKey: "LABELED OPENING",
          propertyPath: "dimensions.nominalWidthFeet",
          candidateValue: 1.833,
          pageNumber: 4,
          tileId: "t-r1-c2",
          originalText: "22\" x 30\" access label",
        }),
      ],
    });

    assert.equal(payload.evidence[0]?.source.tileId, "t-r0-c1");
    assert.ok(
      !payload.evidence.some(
        (item) =>
          item.subjectKey === "TYPE MARK A" &&
          item.propertyPath.startsWith("dimensions."),
      ),
    );
    assert.ok(
      !payload.evidence.some(
        (item) =>
          item.propertyPath === "kingStudCount" ||
          item.propertyPath === "jackStudCount",
      ),
    );
  });

  it("links opening header from member supportedOpeningTag without requiring reciprocal Evidence", () => {
    const evidence = [
      record({
        id: "E-OPEN-CAT",
        subjectKind: "opening",
        subjectKey: "OPEN-A",
        propertyPath: "category",
        candidateValue: "garage-door",
        originalText: "opening label",
      }),
      record({
        id: "E-OPEN-W",
        subjectKind: "opening",
        subjectKey: "OPEN-A",
        propertyPath: "dimensions.nominalWidthFeet",
        candidateValue: 10,
        originalText: "10 ft width",
      }),
      record({
        id: "E-OPEN-H",
        subjectKind: "opening",
        subjectKey: "OPEN-A",
        propertyPath: "dimensions.nominalHeightFeet",
        candidateValue: 8,
        originalText: "8 ft height",
      }),
      record({
        id: "E-OPEN-Q",
        subjectKind: "opening",
        subjectKey: "OPEN-A",
        propertyPath: "quantity",
        candidateValue: 1,
        originalText: "qty 1",
      }),
      record({
        id: "E-HDR-CAT",
        subjectKind: "structural-member",
        subjectKey: "HDR-A",
        propertyPath: "category",
        candidateValue: "header",
        originalText: "header mark",
      }),
      record({
        id: "E-HDR-OPEN",
        subjectKind: "structural-member",
        subjectKey: "HDR-A",
        propertyPath: "supportedOpeningTag",
        candidateValue: "OPEN-A",
        originalText: "header at OPEN-A",
      }),
    ];

    assert.ok(
      !evidence.some((item) => item.propertyPath === "headerMemberTag"),
    );

    const openings = resolveOpenings(evidence);
    const structuralMembers = resolveStructuralMembers(evidence);
    const linked = linkOpeningHeaderRelationships(
      evidence,
      openings,
      structuralMembers,
    );
    assert.equal(linked.openings.openings[0]?.headerMemberId, "SM-HDR-A");
    assert.deepEqual(
      linked.structuralMembers.structuralMembers[0]?.supportedObjectIds,
      ["O-OPEN-A"],
    );
  });

  it("documents schedule-row grounding and type-mark dimension authority in Stage-5 prompt", () => {
    const prompt = buildSystemPrompt("kb");
    assert.match(prompt, /Schedule-row grounding/);
    assert.match(prompt, /Do not propagate a schedule cell to neighboring marks/);
    assert.match(prompt, /opening type-mark \/ schedule dimension rules/);
    assert.match(prompt, /Do not decode industry size conventions/);
    assert.match(
      prompt,
      /Prefer one clear source-grounded link over duplicate/,
    );
    assert.doesNotMatch(prompt, /Beckstead/);
    assert.doesNotMatch(prompt, /18'x8'/);
    assert.doesNotMatch(prompt, /SW5/);
    assert.doesNotMatch(prompt, /WB2-11\.88LVL/);
  });
});
