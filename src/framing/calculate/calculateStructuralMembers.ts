import type { StructuralMembersPayload } from "../schemas/framing-artifacts.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialCategory,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import { formatLengthFeetLabel } from "../product/formatPresentation.js";
import { STRUCTURAL_MEMBER_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const LENGTH_PROPERTY_PATH = "lengthFeet";
const QUANTITY_PROPERTY_PATH = "quantity";
const CATEGORY_PROPERTY_PATH = "category";
const MATERIAL_TYPE_PROPERTY_PATH = "materialType";
const SIZE_PROPERTY_PATH = "size";
const PLY_COUNT_PROPERTY_PATH = "plyCount";

const ENGINEERED_MATERIAL_TYPES = new Set([
  "engineered-wood",
  "glulam",
  "i-joist",
  "lsl",
  "lvl",
  "psl",
  "rim-board",
]);

const LUMBER_MATERIAL_TYPES = new Set([
  "dimensional-lumber",
  "lumber",
  "solid-sawn",
  "solid-sawn-lumber",
]);

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function isExplicitlyBuiltUp(member: StructuralMember): boolean {
  return member.category === "built-up-member";
}

function netMaterialLinearFeet(
  lengthFeet: number,
  quantity: number,
  plyCount: number | null,
): number {
  if (plyCount === null) {
    return lengthFeet * quantity;
  }

  return lengthFeet * quantity * plyCount;
}

function framingMaterialCategoryForMember(
  member: StructuralMember,
): FramingMaterialCategory {
  if (member.category === "truss") {
    return "truss";
  }

  if (member.category === "steel-member") {
    return "structural-steel";
  }

  const material = normalizeToken(member.materialType ?? "");
  if (material === "steel") {
    return "structural-steel";
  }

  if (ENGINEERED_MATERIAL_TYPES.has(material)) {
    return "engineered-wood";
  }

  if (LUMBER_MATERIAL_TYPES.has(material)) {
    return "lumber";
  }

  return "unknown";
}

function emitLineItem(
  item: FramingMaterialLineItem,
): FramingMaterialLineItem | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  return framingMaterialLineItemSchema.parse(item);
}

function calculateMemberMaterial(
  member: StructuralMember,
): FramingMaterialLineItem | null {
  const builtUp = isExplicitlyBuiltUp(member);
  if (
    member.category === "unknown" ||
    !isQuantityInputResolved(
      member.category,
      member.resolutionTraces,
      CATEGORY_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.materialType,
      member.resolutionTraces,
      MATERIAL_TYPE_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.size,
      member.resolutionTraces,
      SIZE_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.lengthFeet,
      member.resolutionTraces,
      LENGTH_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.quantity,
      member.resolutionTraces,
      QUANTITY_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  if (normalizeToken(member.materialType) === "unknown") {
    return null;
  }

  const usedPropertyPaths = [
    CATEGORY_PROPERTY_PATH,
    MATERIAL_TYPE_PROPERTY_PATH,
    SIZE_PROPERTY_PATH,
    LENGTH_PROPERTY_PATH,
    QUANTITY_PROPERTY_PATH,
  ];

  let plyCount: number | null = null;
  if (builtUp) {
    if (
      !isQuantityInputResolved(
        member.plyCount,
        member.resolutionTraces,
        PLY_COUNT_PROPERTY_PATH,
      )
    ) {
      return null;
    }

    plyCount = member.plyCount;
    usedPropertyPaths.push(PLY_COUNT_PROPERTY_PATH);
  }

  const quantity = netMaterialLinearFeet(
    member.lengthFeet,
    member.quantity,
    plyCount,
  );
  const provenance = collectLineItemProvenance([member], usedPropertyPaths);
  const plyLabel = plyCount === null ? "" : `${plyCount}-ply `;
  const lengthLabel = formatLengthFeetLabel(member.lengthFeet!);
  const lengthOrTypeParts = [
    plyCount === null ? null : `${plyCount}-ply`,
    member.category,
    lengthLabel,
  ].filter((part): part is string => part != null && part.length > 0);

  return emitLineItem({
    id: createMaterialLineItemId(
      STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      member.id,
    ),
    quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
    category: framingMaterialCategoryForMember(member),
    description: `${plyLabel}${member.size} ${member.materialType} ${member.category}`,
    material: `${member.size} ${member.materialType}`,
    lengthOrType: lengthOrTypeParts.join(" · "),
    canonicalClassification: `${member.category}-${member.materialType}-${member.size}`,
    quantity,
    unit: "linear-foot",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
  });
}

/**
 * Calculates net structural member material linear footage.
 *
 * Quantity semantics: `knowledge/framing/08-structural-members.md`.
 */
export function calculateStructuralMembers(
  structuralMembers: StructuralMembersPayload,
): FramingMaterialLineItem[] {
  const members = [...structuralMembers.structuralMembers].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const materials: FramingMaterialLineItem[] = [];

  for (const member of members) {
    const lineItem = calculateMemberMaterial(member);
    if (lineItem) {
      materials.push(lineItem);
    }
  }

  return materials;
}
