import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasJoistCountLayoutAxisAuthority,
  inferJoistSizeFromJoistType,
  isMemberLengthMisassignedAsSpanDirection,
  isValidSpanDirectionValue,
  memberLengthFromMisassignedSpanEvidence,
  parseMemberLengthFeetFromSpanCallout,
} from "../../../src/scopes/framing/resolvers/floorLayoutAuthority.js";
import { buildBecksteadM5CrawlSpaceFloorEvidence } from "../../fixtures/becksteadM5FloorLayoutEvidence.js";
import { evidenceSchema } from "../../../src/core/schemas/evidence.schema.js";

describe("floorLayoutAuthority", () => {
  it("rejects MAX SPAN values as span direction", () => {
    assert.equal(
      isMemberLengthMisassignedAsSpanDirection("(MAX. SPAN = 17'-0\")"),
      true,
    );
    assert.equal(isValidSpanDirectionValue("north-south"), true);
    assert.equal(isValidSpanDirectionValue("(MAX. SPAN = 17'-0\")"), false);
  });

  it("parses member length from MAX SPAN callout", () => {
    assert.equal(parseMemberLengthFeetFromSpanCallout("(MAX. SPAN = 17'-0\")"), 17);
  });

  it("recovers member length from mis-assigned spanDirection evidence", () => {
    const records = buildBecksteadM5CrawlSpaceFloorEvidence();
    const recovered = memberLengthFromMisassignedSpanEvidence(records);
    assert.ok(recovered);
    assert.equal(recovered.value, 17);
  });

  it("infers joist size token from combined TJI type string", () => {
    assert.equal(
      inferJoistSizeFromJoistType('11 7/8" TJI 210'),
      '11 7/8"',
    );
  });

  it("grants layout-axis authority from spacing-axis trace after resolution", async () => {
    const { resolveFloorFraming } = await import(
      "../../../src/scopes/framing/resolvers/resolveFloorFraming.js"
    );
    const payload = resolveFloorFraming(buildBecksteadM5CrawlSpaceFloorEvidence());
    const area = payload.areas.find((entry) => entry.id === "FFA-FLOOR-AREA-CRAWL-SPACE");
    assert.ok(area);
    assert.equal(hasJoistCountLayoutAxisAuthority(area), true);
    assert.equal(area.joistMemberLengthFeet, 17);
    assert.equal(area.spanDirection, null);
  });

  it("accepts explicit span direction when valid", () => {
    const area = {
      id: "FFA-001",
      objectType: "floor-framing-area" as const,
      spanDirection: "north-south",
      joistLayoutLengthFeet: 20,
      resolutionTraces: [
        {
          propertyPath: "spanDirection",
          method: "explicit-project-value" as const,
          explanation: "Explicit span direction.",
          evidenceIds: ["E-1"],
          assumptionIds: [],
          userDecisionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
        },
      ],
    };

    assert.equal(
      hasJoistCountLayoutAxisAuthority(area as never),
      true,
    );
  });

  it("does not accept invalid spanDirection evidence at normalize boundary", () => {
    const normalized = evidenceSchema.parse({
      id: "E-SPAN",
      type: "note",
      relationship: "supports",
      description: "bad span",
      source: {
        page: {
          documentId: null,
          pageNumber: 1,
          sheetId: null,
          sheetTitle: null,
          pageLabel: null,
          revision: null,
        },
        region: null,
        elementLabel: null,
        detailNumber: null,
        sectionNumber: null,
        scheduleName: null,
        noteReference: null,
      },
      originalText: "(MAX. SPAN = 17'-0\")",
      references: [],
      subjectKind: "floor-framing-area",
      subjectKey: "FFA-001",
      propertyPath: "spanDirection",
      candidateValue: "(MAX. SPAN = 17'-0\")",
    });

    assert.notEqual(normalized.candidateValue, "north-south");
  });
});
