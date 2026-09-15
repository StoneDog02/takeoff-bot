import type { SheathingPayload } from "../schemas/framing-artifacts.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialCategory,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type { PhysicalPanelPiece } from "../schemas/panel-layout.schema.js";
import {
  sheathingAreaSchema,
  type SheathingArea,
  type SheathingSystem,
} from "../schemas/sheathing.schema.js";
import { SHEATHING_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";
import {
  layoutPanelPieces,
  generateSupportPositions,
  type PanelLayoutResult,
} from "./physicalPanelLayout.js";

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
): FramingMaterialLineItem | null {
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
    quantityKey: SHEATHING_QUANTITY_KEYS.area,
    category: framingMaterialCategoryForPanel(panelType),
    description: `${thickness} ${panelType} ${system.application} sheathing${
      optionalLabel.length > 0 ? ` ${optionalLabel}` : ""
    }`,
    material: `${system.application} sheathing`,
    lengthOrType: `${thickness} ${panelType}${
      optionalLabel.length > 0 ? ` ${optionalLabel}` : ""
    }`,
    canonicalClassification: `${system.application}-${panelType}-${thickness}`,
    quantity: area.areaSquareFeet,
    unit: "square-foot",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
  });
}

const SURFACE_WIDTH_PROPERTY_PATH = "surfaceWidthFeet";
const SURFACE_HEIGHT_PROPERTY_PATH = "surfaceHeightFeet";
const PANEL_WIDTH_PROPERTY_PATH = "panelSpecification.panelWidthInches";
const PANEL_HEIGHT_PROPERTY_PATH = "panelSpecification.panelHeightInches";

/**
 * Check if physical panel layout is eligible for this area/system.
 *
 * Per S4-PN-1:
 * - Requires established rectangular wall/floor surface (surfaceWidthFeet, surfaceHeightFeet)
 * - Requires explicit panel W×L (panelWidthInches, panelHeightInches)
 * - Do NOT invent 4×8 when dimensions are missing
 * - Only wall/floor applications (no 3D roof planes)
 */
function isPanelLayoutEligible(
  area: SheathingArea,
  system: SheathingSystem,
): boolean {
  if (system.application !== "wall" && system.application !== "floor") {
    return false;
  }

  const hasSurfaceDimensions =
    area.surfaceWidthFeet !== null &&
    area.surfaceHeightFeet !== null &&
    isQuantityInputResolved(
      area.surfaceWidthFeet,
      area.resolutionTraces,
      SURFACE_WIDTH_PROPERTY_PATH,
    ) &&
    isQuantityInputResolved(
      area.surfaceHeightFeet,
      area.resolutionTraces,
      SURFACE_HEIGHT_PROPERTY_PATH,
    );

  const hasPanelDimensions =
    system.panelSpecification.panelWidthInches !== null &&
    system.panelSpecification.panelHeightInches !== null &&
    isQuantityInputResolved(
      system.panelSpecification.panelWidthInches,
      system.resolutionTraces,
      PANEL_WIDTH_PROPERTY_PATH,
    ) &&
    isQuantityInputResolved(
      system.panelSpecification.panelHeightInches,
      system.resolutionTraces,
      PANEL_HEIGHT_PROPERTY_PATH,
    );

  return hasSurfaceDimensions && hasPanelDimensions;
}

/**
 * Execute panel layout for an eligible area.
 *
 * Per S4-PN-1:
 * - Call layout engine for established rectangular wall/floor
 * - Do NOT polygon-subtract openings (opening annotation out of scope)
 * - No SupportGraph expand; no minted blocking/H-clips
 */
function executePanelLayout(
  area: SheathingArea,
  system: SheathingSystem,
): PanelLayoutResult | null {
  if (!isPanelLayoutEligible(area, system)) {
    return null;
  }

  const surfaceWidthInches = area.surfaceWidthFeet! * 12;
  const surfaceHeightInches = area.surfaceHeightFeet! * 12;
  const panelWidthInches = system.panelSpecification.panelWidthInches!;
  const panelHeightInches = system.panelSpecification.panelHeightInches!;

  return layoutPanelPieces({
    areaId: area.id,
    surfaceWidthInches,
    surfaceHeightInches,
    panelWidthInches,
    panelHeightInches,
    supportPositions: null,
    openings: [],
  });
}

export type SheathingCalculationResult = {
  materials: FramingMaterialLineItem[];
  areasWithPieces: SheathingArea[];
};

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
 * Per S4-PN-1 follow-up:
 * - Calls Physical Panel Layout Engine when explicit panel W×L present
 * - Attaches materialized pieces to areas
 * - Still no sheet counts or wastePercent (SF coverage/sanity only)
 * - Does not polygon-subtract openings
 *
 * This function only emits material lines. Resolved `SheathingArea.areaSquareFeet`
 * remains on the object when identity is incomplete (partial objects survive).
 * A material line requires both coverage and identity.
 *
 * Does not deduct openings, convert to sheets, apply waste, or merge areas.
 */
export function calculateSheathing(
  sheathing: SheathingPayload,
): FramingMaterialLineItem[] {
  return calculateSheathingWithPieces(sheathing).materials;
}

/**
 * Full sheathing calculation including panel piece materialization.
 *
 * Returns both material lines (SF coverage) and areas with panel pieces attached.
 */
export function calculateSheathingWithPieces(
  sheathing: SheathingPayload,
): SheathingCalculationResult {
  const systemsById = new Map(
    sheathing.systems.map((system) => [system.id, system]),
  );
  const areas = [...sheathing.areas].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const materials: FramingMaterialLineItem[] = [];
  const areasWithPieces: SheathingArea[] = [];

  for (const area of areas) {
    const system = systemsById.get(area.parentSystemId);
    if (!system) {
      areasWithPieces.push(area);
      continue;
    }

    const lineItem = calculateAreaCoverage(area, system);
    if (lineItem) {
      materials.push(lineItem);
    }

    const layoutResult = executePanelLayout(area, system);
    if (layoutResult && layoutResult.pieces.length > 0) {
      const areaWithPieces = sheathingAreaSchema.parse({
        ...area,
        panelPieces: layoutResult.pieces,
      });
      areasWithPieces.push(areaWithPieces);
    } else {
      areasWithPieces.push(area);
    }
  }

  return { materials, areasWithPieces };
}
