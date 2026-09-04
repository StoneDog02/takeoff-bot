import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateStructuralMembers } from "../../src/framing/calculate/calculateStructuralMembers.js";
import type { StructuralMembersPayload } from "../../src/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/framing/schemas/material.schema.js";
import type { StructuralMember } from "../../src/framing/schemas/structural-member.schema.js";

function resolvedTrace(propertyPath: string, assumptionIds: string[] = []) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit on the schedule.`,
    assumptionIds,
  };
}

function buildMember(
  overrides: Partial<StructuralMember> = {},
): StructuralMember {
  return {
    id: "SM-008",
    objectType: "structural-member",
    resolutionTraces: [
      resolvedTrace("materialType"),
      resolvedTrace("size"),
      resolvedTrace("lengthFeet", ["A-LENGTH"]),
      resolvedTrace("quantity"),
    ],
    category: "header",
    materialType: "lvl",
    size: "1.75x11.875",
    plyCount: null,
    lengthFeet: 6,
    quantity: 1,
    location: "W-001 window header",
    associatedObjectIds: [],
    supportedObjectIds: [],
    supportingObjectIds: [],
    connectorIds: [],
    ...overrides,
  };
}

function buildPayload(
  members: StructuralMember[] = [buildMember()],
): StructuralMembersPayload {
  return { structuralMembers: members };
}

describe("calculateStructuralMembers", () => {
  it("preserves structural quantity as linear-foot with size/length presentation", () => {
    const [item] = calculateStructuralMembers(buildPayload());
    assert.equal(item?.quantity, 6);
    assert.equal(item?.unit, "linear-foot");
    assert.equal(item?.category, "engineered-wood");
    assert.equal(item?.canonicalClassification, "header-lvl-1.75x11.875");
    assert.equal(item?.material, "1.75x11.875 lvl");
    assert.match(item?.lengthOrType ?? "", /6 ft/);
  });

  it("multiplies length by repeated single-piece quantity", () => {
    const [item] = calculateStructuralMembers(
      buildPayload([buildMember({ quantity: 3 })]),
    );

    assert.equal(item?.quantity, 18);
  });

  it("multiplies ply count for an explicitly built-up member", () => {
    const [item] = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: 2,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            resolvedTrace("plyCount"),
          ],
        }),
      ]),
    );

    assert.equal(item?.quantity, 12);
    assert.match(item?.description ?? "", /2-ply/);
  });

  it("multiplies repeated quantity and ply count for a built-up member", () => {
    const [item] = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: 2,
          quantity: 3,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            resolvedTrace("plyCount"),
          ],
        }),
      ]),
    );

    assert.equal(item?.quantity, 36);
  });

  it("calculates when plyCount is null on a non-built-up member", () => {
    const materials = calculateStructuralMembers(
      buildPayload([buildMember({ plyCount: null })]),
    );

    assert.equal(materials[0]?.quantity, 6);
  });

  it("skips an explicitly built-up member with null ply count", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: null,
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips an explicitly built-up member with unresolved ply count", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: 2,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            {
              propertyPath: "plyCount",
              method: "unresolved",
              explanation: "Ply count was not resolved.",
              assumptionIds: [],
            },
          ],
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when length is unresolved", () => {
    const materials = calculateStructuralMembers(
      buildPayload([buildMember({ lengthFeet: null })]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when quantity is explicitly unresolved", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember({
          quantity: 2,
          resolutionTraces: [
            resolvedTrace("materialType"),
            resolvedTrace("size"),
            resolvedTrace("lengthFeet"),
            {
              propertyPath: "quantity",
              method: "unresolved",
              explanation: "Quantity was not resolved.",
              assumptionIds: [],
            },
          ],
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when material identity is unresolved", () => {
    const missingSize = calculateStructuralMembers(
      buildPayload([buildMember({ size: null })]),
    );
    const unknownCategory = calculateStructuralMembers(
      buildPayload([buildMember({ category: "unknown" })]),
    );
    const missingMaterial = calculateStructuralMembers(
      buildPayload([buildMember({ materialType: null })]),
    );

    assert.equal(missingSize.length, 0);
    assert.equal(unknownCategory.length, 0);
    assert.equal(missingMaterial.length, 0);
  });

  it("emits 18 LF when quantity is 3", () => {
    const [item] = calculateStructuralMembers(
      buildPayload([buildMember({ quantity: 3 })]),
    );

    assert.equal(item?.quantity, 18);
  });

  it("preserves source object and assumption provenance from used traces", () => {
    const [item] = calculateStructuralMembers(buildPayload());

    assert.deepEqual(item?.sourceObjectIds, ["SM-008"]);
    assert.deepEqual(item?.assumptionIds, ["A-LENGTH"]);
  });

  it("is deterministic across reruns", () => {
    const payload = buildPayload();

    assert.deepEqual(
      calculateStructuralMembers(payload),
      calculateStructuralMembers(payload),
    );
  });

  it("emits line items that parse through FramingMaterialLineItem", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember(),
        buildMember({
          id: "SM-009",
          category: "built-up-member",
          plyCount: 3,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            resolvedTrace("plyCount"),
          ],
        }),
      ]),
    );

    assert.equal(materials.length, 2);
    for (const item of materials) {
      assert.deepEqual(framingMaterialLineItemSchema.parse(item), item);
    }
  });
});
