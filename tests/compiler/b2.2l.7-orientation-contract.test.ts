import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isGraphicConventionAuthorized,
  crossPageDefinitionsFromContext,
  type ProjectOrientationContext,
} from "../../src/project-reading/projectOrientationContext.js";
import type { SemanticDefinition } from "../../src/compiler/schemas/semanticDefinition.schema.js";

function mockContext(
  partial: Partial<ProjectOrientationContext> = {},
): ProjectOrientationContext {
  return {
    sourceFingerprint: null,
    definitions: [],
    establishedRules: [],
    dictionaryDefinitions: [],
    referenceMechanismHint: null,
    graphicConventionAuthorized: false,
    ...partial,
  };
}

describe("B2.2L.7 orientation context adapter", () => {
  it("crossPageDefinitionsFromContext returns governed definitions", () => {
    const def = {
      definitionId: "def-p1-SW4",
      semanticTypeKey: "SW4",
      definitionKind: "shear-wall" as const,
      sourcePageNumber: 1,
      sourceRegion: { x0: 0, y0: 0, x1: 1, y1: 1 },
      properties: [],
      provenance: { extractionMethod: "row-band-ocr" as const },
    } satisfies SemanticDefinition;

    const ctx = mockContext({ definitions: [def] });
    assert.deepEqual(crossPageDefinitionsFromContext(ctx), [def]);
    assert.deepEqual(crossPageDefinitionsFromContext(undefined), []);
  });

  it("graphic convention authorized requires established heavy-line rule", () => {
    assert.equal(isGraphicConventionAuthorized(mockContext()), false);
    assert.equal(
      isGraphicConventionAuthorized(
        mockContext({ graphicConventionAuthorized: true }),
      ),
      false,
    );
    assert.equal(
      isGraphicConventionAuthorized(
        mockContext({
          graphicConventionAuthorized: true,
          establishedRules: [
            {
              id: "hyp-graphic",
              status: "established_rule",
              conventionClass: "heavy-linework",
              claim: "Heavy line graphic convention governs shear class.",
              provenance: [
                { kind: "compiler", pageNumber: 4, toolCallId: "t1" },
              ],
            },
          ],
        }),
      ),
      true,
    );
  });
});
