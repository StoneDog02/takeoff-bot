import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLAUDE_REGION_OUTPUT_CONTRACT,
  PROJECT_LEARNING_DEFINITION_KINDS,
  claudeRegionInterpretResponseSchema,
  normalizeDefinitionKind,
  normalizeDefinitionProperties,
  prepareClaudeRegionPayload,
} from "../../src/project-interpreter/projectLearning/claudeRegionInterpretContract.js";
import { selectP0ClaudeRegions } from "../../src/project-interpreter/projectLearning/interpretProjectLearningRegionsClaude.js";
import { validateProjectLearningDefinitions } from "../../src/project-interpreter/projectLearning/validateProjectLearningDefinitions.js";
import { projectLearningCandidateSchema } from "../../src/project-interpreter/projectLearning/projectLearningTypes.js";
import { validateWithSchema } from "../../src/core/validation/validateWithSchema.js";

describe("project learning Claude region contract (V1c failure regressions)", () => {
  it("exposes shared definitionKind vocabulary in the output contract", () => {
    for (const kind of PROJECT_LEARNING_DEFINITION_KINDS) {
      assert.ok(CLAUDE_REGION_OUTPUT_CONTRACT.includes(kind));
    }
  });

  it("normalizes invalid definitionKind aliases without inventing facts", () => {
    assert.equal(normalizeDefinitionKind("shear_wall"), "shear-wall");
    assert.equal(normalizeDefinitionKind("wood-beam"), "header");
    assert.equal(normalizeDefinitionKind("holddown"), "holdown");
    assert.equal(normalizeDefinitionKind("totally-made-up"), "totally-made-up");
  });

  it("rejects invalid definitionKind after normalize (V1c enum failure)", () => {
    const prepared = prepareClaudeRegionPayload({
      definitions: [
        {
          semanticTypeKey: "SW2",
          definitionKind: "shearwall-panel",
          properties: [{ propertyPath: "assembly.sheathingType", rawText: "OSB" }],
          interpretedValue: "SW2 OSB",
        },
      ],
    });
    assert.throws(() =>
      validateWithSchema(
        claudeRegionInterpretResponseSchema,
        prepared,
        "enum-fail",
      ),
    );
  });

  it("rejects missing propertyPath (V1c missing field failure)", () => {
    const prepared = prepareClaudeRegionPayload({
      definitions: [
        {
          semanticTypeKey: "SW2",
          definitionKind: "shear-wall",
          properties: [{ rawText: "OSB" }],
          interpretedValue: "SW2",
        },
      ],
    });
    // prepare drops unusable property objects → empty properties → definition dropped → empty ok
    const parsed = claudeRegionInterpretResponseSchema.parse(prepared);
    assert.equal(parsed.definitions.length, 0);
  });

  it("rejects missing rawText by dropping the property (V1c)", () => {
    const prepared = prepareClaudeRegionPayload({
      definitions: [
        {
          semanticTypeKey: "SW2",
          definitionKind: "shear-wall",
          properties: [{ propertyPath: "assembly.sheathingType" }],
          interpretedValue: "SW2",
        },
      ],
    });
    const parsed = claudeRegionInterpretResponseSchema.parse(prepared);
    assert.equal(parsed.definitions.length, 0);
  });

  it("normalizes object-map properties into required array shape (repair assist)", () => {
    const props = normalizeDefinitionProperties({
      "assembly.sheathingType": '7/16" OSB',
      size: "2x10",
    });
    assert.deepEqual(props, [
      { propertyPath: "assembly.sheathingType", rawText: '7/16" OSB' },
      { propertyPath: "size", rawText: "2x10" },
    ]);

    const prepared = prepareClaudeRegionPayload({
      definitions: [
        {
          semanticTypeKey: "WB2-10DF",
          definitionKind: "beam",
          properties: { size: "(2) 1-3/4 x 11-7/8 LVL" },
          interpretedValue: "WB2-10DF",
          sourceCandidateId: "pl-wb",
        },
      ],
    });
    const parsed = claudeRegionInterpretResponseSchema.parse(prepared);
    assert.equal(parsed.definitions.length, 1);
    assert.equal(parsed.definitions[0]?.definitionKind, "header");
    assert.equal(parsed.definitions[0]?.properties[0]?.propertyPath, "size");
  });

  it("malformed JSON remains context-ineligible (repair failure path)", () => {
    assert.throws(() => JSON.parse("{ unterminated"));
    const harvested = projectLearningCandidateSchema.parse({
      id: "pl-bad",
      pageNumber: 1,
      sourceKind: "odl-hybrid",
      elementType: "table",
      rawValue: "SHEAR WALL SCHEDULE",
      validationStatus: "unresolved",
      conflictNotes: ["Claude region interpret failed after repair: Invalid JSON"],
      definitionKind: "shear-wall",
    });
    const validated = validateProjectLearningDefinitions({
      candidates: [harvested],
    });
    assert.equal(validated.validatedDefinitions.length, 0);
    assert.equal(validated.candidates[0]?.validationStatus, "unresolved");
  });

  it("schema-valid Claude proposal still requires validation gate for context", () => {
    const interpreted = projectLearningCandidateSchema.parse({
      id: "pl-sw2",
      pageNumber: 1,
      sourceKind: "odl-hybrid",
      elementType: "table",
      rawValue: "SW2",
      validationStatus: "interpreted",
      definitionKind: "shear-wall",
      semanticTypeKey: "SW2",
      properties: [{ propertyPath: "assembly.sheathingType", rawText: '7/16" OSB' }],
      interpretedValue: "SW2 OSB",
    });
    const validated = validateProjectLearningDefinitions({
      candidates: [interpreted],
      provenanceToolCallId: "project-learning-v1",
    });
    assert.equal(validated.candidates[0]?.validationStatus, "validated");
    assert.equal(validated.validatedDefinitions[0]?.semanticTypeKey, "SW2");
  });

  it("selectP0ClaudeRegions keeps SW and WB schedule tables only", () => {
    const candidates = [
      projectLearningCandidateSchema.parse({
        id: "holdown",
        pageNumber: 1,
        sourceKind: "odl-hybrid",
        elementType: "table",
        rawValue: "METAL HOLDOWN SCHEDULE",
        validationStatus: "harvested",
        definitionKind: "holdown",
      }),
      projectLearningCandidateSchema.parse({
        id: "sw",
        pageNumber: 1,
        sourceKind: "odl-hybrid",
        elementType: "table",
        rawValue: "SHEAR WALL SCHEDULE | SW2 | OSB",
        validationStatus: "harvested",
        definitionKind: "shear-wall",
        bbox: { left: 1, bottom: 1, right: 2, top: 2 },
      }),
      projectLearningCandidateSchema.parse({
        id: "wb",
        pageNumber: 1,
        sourceKind: "odl-hybrid",
        elementType: "table",
        rawValue: "WOOD BEAM / HEADER SCHEDULE | WB2-10DF",
        validationStatus: "harvested",
        definitionKind: "header",
        bbox: { left: 1, bottom: 1, right: 2, top: 2 },
      }),
      projectLearningCandidateSchema.parse({
        id: "cell",
        pageNumber: 1,
        sourceKind: "odl-hybrid",
        elementType: "table cell",
        rawValue: "SW2",
        validationStatus: "harvested",
        definitionKind: "shear-wall",
      }),
    ];
    const picked = selectP0ClaudeRegions(candidates);
    assert.deepEqual(
      picked.map((c) => c.id).sort(),
      ["sw", "wb"],
    );
  });

  it("prepareClaudeRegionPayload does not invent properties during repair normalization", () => {
    const prepared = prepareClaudeRegionPayload({
      definitions: [
        {
          semanticTypeKey: "SW9",
          definitionKind: "shear-wall",
          properties: [],
          interpretedValue: "invented",
        },
      ],
    });
    const parsed = claudeRegionInterpretResponseSchema.parse(prepared);
    assert.equal(parsed.definitions.length, 0);
  });
});
