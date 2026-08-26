import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRoofPlaneParentSystemLink } from "../../../src/scopes/framing/resolvers/resolveRoofPlaneParentSystem.js";

describe("resolveRoofPlaneParentSystemLink", () => {
  it("links via explicit parentSystemTag evidence only", () => {
    const planeRecords = [
      {
        id: "E-PLANE-PARENT",
        propertyPath: "parentSystemTag",
        originalText: "RFS-MAIN",
        candidateValue: "RFS-MAIN",
      },
    ] as never;

    const link = resolveRoofPlaneParentSystemLink({
      planeSubjectKey: "RFP-MAIN",
      planeRecords,
      explicitParentSystemTag: "RFS-MAIN",
      systemCandidates: [
        {
          subjectKey: "RFS-MAIN",
          records: [{ id: "E-SYS", originalText: "RFS-MAIN" }] as never,
        },
      ],
    });

    assert.ok(link);
    assert.equal(link.method, "explicit-parent-system-tag");
    assert.equal(link.requiresReview, false);
  });

  it("fail-closes without explicit parentSystemTag", () => {
    const link = resolveRoofPlaneParentSystemLink({
      planeSubjectKey: "RFP-MAIN",
      planeRecords: [
        {
          id: "E-PITCH",
          propertyPath: "pitch",
          originalText: "6/12",
        },
      ] as never,
      explicitParentSystemTag: null,
      systemCandidates: [
        {
          subjectKey: "RFS-MAIN",
          records: [{ id: "E-SYS", originalText: "RFS-MAIN" }] as never,
        },
      ],
    });

    assert.equal(link, null);
  });
});
