import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import { buildAreaSystemRelationshipEvidence } from "../../../src/scopes/framing/geometry/buildAreaSystemRelationshipEvidence.js";

function baseSource(pageNumber: number) {
  return {
    page: {
      documentId: null,
      pageNumber,
      sheetId: null,
      sheetTitle: null,
      pageLabel: null,
      revision: null,
    },
    region: null,
    tileId: null,
    elementLabel: null,
    detailNumber: null,
    sectionNumber: null,
    scheduleName: null,
    noteReference: null,
  };
}

function floorAreaRecord(
  subjectKey: string,
  overrides: Partial<Evidence> = {},
): Evidence {
  return {
    id: `E-${subjectKey}`,
    type: "callout",
    relationship: "supports",
    description: "Floor area",
    source: baseSource(4),
    originalText: `${subjectKey} = 100 SF`,
    references: [],
    subjectKind: "floor-framing-area",
    subjectKey,
    propertyPath: "areaSquareFeet",
    candidateValue: 100,
    ...overrides,
  } as Evidence;
}

function floorSystemRecord(subjectKey: string): Evidence {
  return {
    id: `E-SYS-${subjectKey}`,
    type: "callout",
    relationship: "supports",
    description: "Floor system",
    source: baseSource(4),
    originalText: subjectKey,
    references: [],
    subjectKind: "floor-framing-system",
    subjectKey,
    propertyPath: "name",
    candidateValue: subjectKey,
  } as Evidence;
}

describe("buildAreaSystemRelationshipEvidence", () => {
  it("emits P4 bridge evidence for dual-tag explicit ownership text", () => {
    const areaKey = "FFA-CRAWL";
    const systemKey = "FFS-CRAWL";
    const evidence = [
      floorAreaRecord(areaKey, {
        id: "E-AREA-OWNERSHIP",
        originalText: `${areaKey} under ${systemKey}`,
        propertyPath: "layout",
        candidateValue: "crawl",
      }),
      floorSystemRecord(systemKey),
    ];

    const bridge = buildAreaSystemRelationshipEvidence(evidence, null);
    assert.equal(bridge.length, 1);
    assert.equal(bridge[0]!.propertyPath, "parentSystemTag");
    assert.equal(bridge[0]!.candidateValue, systemKey);
    assert.match(bridge[0]!.description ?? "", /Bridge\[P4\]/);
  });

  it("does not emit from shared assembly callout alone (P5 rejected)", () => {
    const sharedText =
      '11.7/8" TJI 210 FLOOR JOISTS AT 16" O.C. OVER (MAX. SPAN = 17\'-0")';
    const evidence = [
      floorAreaRecord("FFA-BAY", {
        originalText: sharedText,
        propertyPath: "joistMemberLengthFeet",
        candidateValue: 17,
      }),
      floorSystemRecord("FFS-BAY"),
      {
        ...floorSystemRecord("FFS-BAY"),
        id: "E-SYS-CALLOUT",
        originalText: sharedText,
      } as Evidence,
    ];

    const bridge = buildAreaSystemRelationshipEvidence(evidence, null);
    assert.equal(bridge.length, 0);
  });

  it("emits P2 from dictionary semantic definition parentSystemTag", () => {
    const areaKey = "FFA-MAIN";
    const systemKey = "FFS-MAIN";
    const evidence = [floorAreaRecord(areaKey), floorSystemRecord(systemKey)];

    const bridge = buildAreaSystemRelationshipEvidence(evidence, {
      projectId: "test",
      generatedAt: new Date().toISOString(),
      interpreterModel: "test",
      experimentBranch: "hybrid",
      observations: [],
      hypotheses: [],
      definitions: [
        {
          semanticTypeKey: areaKey,
          sourcePage: 4,
          properties: [
            { propertyPath: "parentSystemTag", rawText: systemKey },
          ],
          status: "definition",
          provenance: [{ kind: "artifact", toolCallId: "t1", pageNumber: 4 }],
        },
      ],
      bindings: [],
      unresolved: [],
      contradictions: [],
      metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    });

    assert.equal(bridge.length, 1);
    assert.match(bridge[0]!.description ?? "", /Bridge\[P2\]/);
  });

  it("does not cross-link floor area to sheathing system", () => {
    const evidence = [
      floorAreaRecord("FFA-1", {
        originalText: "FFA-1 under SHS-1",
      }),
      {
        ...floorSystemRecord("SHS-1"),
        subjectKind: "sheathing-system",
      } as Evidence,
    ];

    const bridge = buildAreaSystemRelationshipEvidence(evidence, null);
    assert.equal(bridge.length, 0);
  });
});
