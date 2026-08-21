import type {
  SheathingPayload,
  ValidationPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialCategory,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type {
  SheathingArea,
  SheathingSystem,
} from "../schemas/sheathing.schema.js";
import { SHEATHING_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityBlocked } from "./isQuantityBlocked.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const AREA_PROPERTY_PATH = "areaSquareFeet";
const APPLICATION_PROPERTY_PATH = "application";
const PANEL_TYPE_PROPERTY_PATH = "panelSpecification.panelType";
const THICKNESS_PROPERTY_PATH = "panelSpecification.thickness";
const GRADE_PROPERTY_PATH = "panelSpecification.grade";
const SPAN_RATING_PROPERTY_PATH = "panelSpecification.spanRating";
const EXPOSURE_RATING_PROPERTY_PATH = "panelSpecification.exposureRating";
const EDGE_TREATMENT_PROPERTY_PATH = "panelSpecification.edgeTreatment";

const STRUCTURAL_PANEL_TYPES = new Set([
  "osb",
  "plywood",
  "structural-composite",
  "structural-composite-panel",
]);

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function framingMaterialCategoryForPanel(
  panelType: string,
): FramingMaterialCategory {
  if (STRUCTURAL_PANEL_TYPES.has(normalizeToken(panelType))) {
    return "structural-panel";
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

function optionalSpecSegment(
  system: SheathingSystem,
  propertyPath: string,
  value: string | null,
): string | null {
  if (
    !isQuantityInputResolved(value, system.resolutionTraces, propertyPath)
  ) {
    return null;
  }

  return value;
}

function calculateAreaCoverage(
  area: SheathingArea,
  system: SheathingSystem,
  validation: ValidationPayload | undefined,
): FramingMaterialLineItem | null {
  const contributingIds = [system.id, area.id];

  if (
    isQuantityBlocked(validation, contributingIds, SHEATHING_QUANTITY_KEYS.area) ||
    isQuantityBlocked(
      validation,
      contributingIds,
      SHEATHING_QUANTITY_KEYS.material,
    )
  ) {
    return null;
  }

  if (
    system.application === "unknown" ||
    !isQuantityInputResolved(
      system.application,
      system.resolutionTraces,
      APPLICATION_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      system.panelSpecification.panelType,
      system.resolutionTraces,
      PANEL_TYPE_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      system.panelSpecification.thickness,
      system.resolutionTraces,
      THICKNESS_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      area.areaSquareFeet,
      area.resolutionTraces,
      AREA_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  const usedPropertyPaths = [
    APPLICATION_PROPERTY_PATH,
    PANEL_TYPE_PROPERTY_PATH,
    THICKNESS_PROPERTY_PATH,
    AREA_PROPERTY_PATH,
  ];

  const grade = optionalSpecSegment(
    system,
    GRADE_PROPERTY_PATH,
    system.panelSpecification.grade,
  );
  const spanRating = optionalSpecSegment(
    system,
    SPAN_RATING_PROPERTY_PATH,
    system.panelSpecification.spanRating,
  );
  const exposureRating = optionalSpecSegment(
    system,
    EXPOSURE_RATING_PROPERTY_PATH,
    system.panelSpecification.exposureRating,
  );
  const edgeTreatment = optionalSpecSegment(
    system,
    EDGE_TREATMENT_PROPERTY_PATH,
    system.panelSpecification.edgeTreatment,
  );

  if (grade) {
    usedPropertyPaths.push(GRADE_PROPERTY_PATH);
  }
  if (spanRating) {
    usedPropertyPaths.push(SPAN_RATING_PROPERTY_PATH);
  }
  if (exposureRating) {
    usedPropertyPaths.push(EXPOSURE_RATING_PROPERTY_PATH);
  }
  if (edgeTreatment) {
    usedPropertyPaths.push(EDGE_TREATMENT_PROPERTY_PATH);
  }

  const optionalLabel = [grade, spanRating, exposureRating, edgeTreatment]
    .filter((segment) => segment !== null)
    .join(" ");
  const panelType = system.panelSpecification.panelType;
  const thickness = system.panelSpecification.thickness;
  const provenance = collectLineItemProvenance(
    [system, area],
    usedPropertyPaths,
  );

  return emitLineItem({
    id: createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, area.id),
    category: framingMaterialCategoryForPanel(panelType),
    description: `${thickness} ${panelType} ${system.application} sheathing${
      optionalLabel.length > 0 ? ` ${optionalLabel}` : ""
    }`,
    canonicalClassification: `${system.application}-${panelType}-${thickness}`,
    quantity: area.areaSquareFeet,
    unit: "square-foot",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
    reviewItemIds: provenance.reviewItemIds,
  });
}

/**
 * Emits sheathing **material lines** (SF) for areas that have both:
 * - Coverage quantity: resolved `areaSquareFeet` (`coverageSquareFeet = areaSquareFeet`)
 * - Material identity: resolved application + panel type + thickness
 *
 * Per `knowledge/framing/04-building-assemblies.md` (Net Sheathing Coverage):
 * - Application classifies material; it does not change SF arithmetic.
 * - Coverage is not blocked solely by unresolved application.
 * - Material lines must not emit when required identity is unresolved.
 *
 * This function only emits material lines. Resolved `SheathingArea.areaSquareFeet`
 * remains on the object when identity is incomplete (partial objects survive).
 * Blocking either `sheathing.area` or `sheathing.material` suppresses emission
 * because a material line requires both coverage and identity.
 *
 * Does not deduct openings, convert to sheets, apply waste, or merge areas.
 */
export function calculateSheathing(
  sheathing: SheathingPayload,
  validation?: ValidationPayload,
): FramingMaterialLineItem[] {
  const systemsById = new Map(
    sheathing.systems.map((system) => [system.id, system]),
  );
  const areas = [...sheathing.areas].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const materials: FramingMaterialLineItem[] = [];

  for (const area of areas) {
    const system = systemsById.get(area.parentSystemId);
    if (!system) {
      continue;
    }

    const lineItem = calculateAreaCoverage(area, system, validation);
    if (lineItem) {
      materials.push(lineItem);
    }
  }

  return materials;
}
