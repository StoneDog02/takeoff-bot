import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calculateRoofFraming } from "../../../src/scopes/framing/calculators/calculateRoofFraming.js";
import { calculateSheathing } from "../../../src/scopes/framing/calculators/calculateSheathing.js";
import { calculateStructuralMembers } from "../../../src/scopes/framing/calculators/calculateStructuralMembers.js";
import { calculateWallFraming } from "../../../src/scopes/framing/calculators/calculateWallFraming.js";
import {
  buildFramingPackageProductState,
  loadFramingRunArtifactsFromDirectory,
} from "../../../src/scopes/framing/observability/buildFramingPackageProductState.js";
import {
  buildStructuralProductFunnel,
  isStructuralMemberCalculatorReady,
} from "../../../src/scopes/framing/observability/structuralCalculatorReadiness.js";
import { resolveRoofFraming } from "../../../src/scopes/framing/resolvers/resolveRoofFraming.js";
import { resolveSheathing } from "../../../src/scopes/framing/resolvers/resolveSheathing.js";
import { resolveStructuralMembers } from "../../../src/scopes/framing/resolvers/resolveStructuralMembers.js";
import { STRUCTURAL_MEMBER_QUANTITY_KEYS } from "../../../src/scopes/framing/validators/rule-ids.js";
import { createMaterialLineItemId } from "../../../src/scopes/framing/calculators/ids.js";

const WAVE5_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../artifacts/b2.3-wave5/runs/beckstead-wave5-after/framing",
);

describe("beckstead wave5 structural milestone", () => {
  it("converges WB2-11.88LVL equivalent sizes and emits owned Structural material", async () => {
    const artifacts = await loadFramingRunArtifactsFromDirectory(WAVE5_DIR);
    assert.ok(artifacts?.evidence?.length);

    const structural = resolveStructuralMembers(artifacts.evidence);
    const wb2 = structural.structuralMembers.find(
      (member) => member.id === "SM-WB2-11.88LVL",
    );
    assert.ok(wb2);
    assert.equal(wb2.category, "header");
    assert.equal(wb2.materialType, "LVL");
    assert.equal(wb2.lengthFeet, 23.5);
    assert.equal(wb2.quantity, 1);
    assert.equal(wb2.size, '(2)-1.75"x11.875"');
    assert.equal(
      wb2.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "size" && trace.method === "unresolved",
      ),
      false,
    );
    assert.equal(isStructuralMemberCalculatorReady(wb2, undefined), true);

    const structuralMaterials = calculateStructuralMembers(structural);
    const owned = structuralMaterials.filter((line) =>
      line.sourceObjectIds.includes("SM-WB2-11.88LVL"),
    );
    assert.ok(owned.length >= 1);
    const expectedId = createMaterialLineItemId(
      STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      "SM-WB2-11.88LVL",
    );
    assert.ok(structuralMaterials.some((line) => line.id === expectedId));
    assert.equal(owned[0]!.quantity, 23.5);
    assert.equal(owned[0]!.unit, "linear-foot");

    const funnel = buildStructuralProductFunnel({
      structuralMembers: structural,
      materials: structuralMaterials,
      stage16StructuralLines: owned.length,
    });
    assert.equal(funnel.kind, "structural");
    assert.ok(funnel.calculatorReady >= 1);
    assert.ok(funnel.stage14MaterialLines >= 1);
    assert.ok(funnel.calculatedMembers >= 1);

    // Walls remain producing from frozen Stage 14 ownership.
    const wallOwned =
      artifacts.calculations?.materials.filter((line) =>
        line.sourceObjectIds.some(
          (id) => id.startsWith("WS-") || id.startsWith("physical-run:"),
        ),
      ).length ?? 0;
    assert.equal(wallOwned, 52);

    // Recompute wall materials from frozen wall payload — still Walls-owned.
    assert.ok(artifacts.wallFraming);
    const wallMaterials = calculateWallFraming(artifacts.wallFraming);
    assert.ok(wallMaterials.length >= 52);

    // Sheathing: DOUBLE-GARAGE must not produce wood sheathing quantities.
    const sheathing = resolveSheathing(artifacts.evidence);
    const sheathingMaterials = calculateSheathing(sheathing);
    assert.equal(sheathingMaterials.length, 0);
    const garageArea = sheathing.areas.find(
      (area) => area.id === "SHA-DOUBLE-GARAGE",
    );
    assert.ok(garageArea);
    assert.ok(garageArea.parentSystemId.endsWith("UNRESOLVED"));

    // Roof: prefab/scissor systems stay fail-closed (no fabricated lines).
    const roof = resolveRoofFraming(artifacts.evidence);
    const roofMaterials = calculateRoofFraming(roof);
    assert.equal(roofMaterials.length, 0);

    // Product state with re-resolved structural + merged materials.
    // Omit stale Stage-13 validation (size was unresolved at capture time).
    const mergedMaterials = [
      ...(artifacts.calculations?.materials.filter(
        (line) =>
          !line.sourceObjectIds.some((id) => id.startsWith("SM-")),
      ) ?? []),
      ...structuralMaterials,
    ];
    const state = buildFramingPackageProductState({
      runLabel: "wave5-structural-bundle-c",
      artifacts: {
        ...artifacts,
        structuralMembers: structural,
        validation: null,
        calculations: {
          materials: mergedMaterials,
          assumptions: artifacts.calculations?.assumptions ?? [],
        },
      },
    });
    const structuralPkg = state.packages.find(
      (row) => row.package === "Structural",
    );
    assert.ok(structuralPkg);
    assert.ok((structuralPkg.calculatorReady as number) >= 1);
    assert.ok((structuralPkg.materialLines as number) >= 1);
    assert.ok(structuralPkg.productFunnel);
    assert.equal(
      (structuralPkg.productFunnel as { kind?: string }).kind,
      "structural",
    );

    const wallsPkg = state.packages.find((row) => row.package === "Walls");
    assert.ok(wallsPkg);
    assert.equal(wallsPkg.stage16Lines, 52);

    const sheathingPkg = state.packages.find(
      (row) => row.package === "Sheathing",
    );
    assert.ok(sheathingPkg);
    assert.equal(sheathingPkg.stage16Lines, 0);

    const roofPkg = state.packages.find((row) => row.package === "Roof");
    assert.ok(roofPkg);
    assert.equal(roofPkg.stage16Lines, 0);
  });
});
