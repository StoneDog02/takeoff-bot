import type { FoundationInterfacePayload } from "../schemas/framing-artifacts.schema.js";
import type { FoundationSillSegment } from "../schemas/foundation-sill.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type { UnresolvedRecord } from "../schemas/honesty-records.schema.js";
import {
  FOUNDATION_INTERFACE_QUANTITY_KEYS,
  HONESTY_RULE_IDS,
} from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const LENGTH_PROPERTY_PATH = "lengthFeet";
const SIZE_PROPERTY_PATH = "material.size";
const TREATMENT_PROPERTY_PATH = "material.treatment";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function emitLineItem(
  item: FramingMaterialLineItem,
): FramingMaterialLineItem | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  return framingMaterialLineItemSchema.parse(item);
}

function buildSizeUnresolvedRecord(segment: FoundationSillSegment): UnresolvedRecord {
  return {
    id: `UNRES-foundation-sill-size-${segment.id}`,
    physicalId: segment.physicalId ?? segment.id,
    propertyPath: SIZE_PROPERTY_PATH,
    reasonCode: HONESTY_RULE_IDS.foundationSillSizeUnresolved,
    diagnosticFamily: "READ_GAP",
    explanation:
      "Sill plate size is not established. No size is assumed from minimum " +
      "prescriptive code or wall width. Spec §17: missing size → Unresolved.",
  };
}

export type FoundationInterfaceCalculationResult = {
  materials: FramingMaterialLineItem[];
  unresolved: UnresolvedRecord[];
};

function calculateSillSegmentLF(
  segment: FoundationSillSegment,
): { material: FramingMaterialLineItem | null; unresolved: UnresolvedRecord | null } {
  if (
    !isQuantityInputResolved(
      segment.lengthFeet,
      segment.resolutionTraces,
      LENGTH_PROPERTY_PATH,
    )
  ) {
    return { material: null, unresolved: null };
  }

  if (
    !isQuantityInputResolved(
      segment.material.size,
      segment.resolutionTraces,
      SIZE_PROPERTY_PATH,
    )
  ) {
    return {
      material: null,
      unresolved: buildSizeUnresolvedRecord(segment),
    };
  }

  const size = segment.material.size!;
  const treatment = segment.material.treatment;
  const treatmentLabel = treatment === "pressure-treated" ? "PT " : "";
  const quantityKey = FOUNDATION_INTERFACE_QUANTITY_KEYS.sillLF;

  const provenance = collectLineItemProvenance(
    [segment],
    [LENGTH_PROPERTY_PATH, SIZE_PROPERTY_PATH, TREATMENT_PROPERTY_PATH],
  );

  const materialLine = emitLineItem({
    id: createMaterialLineItemId(quantityKey, segment.id),
    quantityKey,
    category: "lumber",
    description: `${treatmentLabel}${size} foundation sill plate`,
    material: `${treatmentLabel}${size} sill plate`,
    lengthOrType: `${size}${treatment === "pressure-treated" ? " PT" : ""}`,
    canonicalClassification: `foundation-sill-${normalizeToken(size)}${
      treatment === "pressure-treated" ? "-pt" : ""
    }`,
    quantity: segment.lengthFeet,
    unit: "linear-foot",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
  });

  return { material: materialLine, unresolved: null };
}

/**
 * Calculates Foundation Interface quantities from resolved sill segments.
 *
 * Per V1 Spec §17:
 * - PT sill: `required LF = sum(resolved applicable sill segments)` by material/spec
 * - Preserve individual segments before stock optimization
 * - Never replace known bearing geometry with generic building perimeter
 * - Do NOT mint sills from wall plateCount or building perimeter
 * - Treatment may be rule/assumption-resolved from decay-protection condition
 * - Plate size is NOT taken from minimum-code size when actual assembly is unresolved
 * - Missing size → Unresolved
 *
 * This slice does NOT include:
 * - LF/6 anchorage
 * - Hold-downs, straps, footings
 * - Sill gasket/rolls
 * - S5 purchase/BOM dedup
 */
export function calculateFoundationInterface(
  foundationInterface: FoundationInterfacePayload,
): FoundationInterfaceCalculationResult {
  const segments = [...foundationInterface.sillSegments].sort((left, right) =>
    compareIds(left.id, right.id),
  );

  const materials: FramingMaterialLineItem[] = [];
  const unresolved: UnresolvedRecord[] = [];

  for (const segment of segments) {
    const result = calculateSillSegmentLF(segment);
    if (result.material) {
      materials.push(result.material);
    }
    if (result.unresolved) {
      unresolved.push(result.unresolved);
    }
  }

  return { materials, unresolved };
}
