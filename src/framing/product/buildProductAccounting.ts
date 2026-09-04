import { isQuantityInputResolved } from "../calculate/isQuantityInputResolved.js";
import type { FramingConstruction } from "../schemas/framingConstruction.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import {
  productAccountingSchema,
  type ProductAccounting,
  type ProductAccountingEntry,
  type ProductAccountingGapClass,
} from "../schemas/productAccounting.schema.js";
import {
  MASTER_TAXONOMY_CHECKLIST,
  type DomainSignalRule,
  type InputGapProbe,
  type MasterTaxonomyChecklistItem,
  type MaterialMatchRule,
} from "./masterTaxonomyChecklist.js";

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function wallLocationIsExterior(location: string | null): boolean {
  if (!location) return false;
  const token = normalizeToken(location);
  return token.includes("exterior") || token === "ext";
}

function wallLocationIsInterior(location: string | null): boolean {
  if (!location) return false;
  const token = normalizeToken(location);
  return token.includes("interior") || token === "int";
}

function isStickFramingType(framingType: string | null): boolean {
  if (!framingType) return false;
  const token = normalizeToken(framingType);
  if (token.includes("truss")) return false;
  return (
    token.includes("stick") ||
    token.includes("rafter") ||
    token.includes("conventional") ||
    token.includes("dimensional")
  );
}

function isTrussFramingType(framingType: string | null): boolean {
  if (!framingType) return false;
  return normalizeToken(framingType).includes("truss");
}

export function evaluateDomainSignal(
  construction: FramingConstruction,
  signal: DomainSignalRule,
): boolean {
  switch (signal.kind) {
    case "has_walls":
      return construction.walls.walls.length > 0;
    case "has_exterior_walls":
      return construction.walls.walls.some((wall) =>
        wallLocationIsExterior(wall.location),
      );
    case "has_interior_walls":
      return construction.walls.walls.some((wall) =>
        wallLocationIsInterior(wall.location),
      );
    case "has_openings":
      return construction.openings.openings.length > 0;
    case "has_floor_systems":
      return construction.floorFraming.systems.length > 0;
    case "has_floor_joist_areas":
      return construction.floorFraming.areas.length > 0;
    case "has_rim_board_signal": {
      const rimNote = construction.floorFraming.systems.some(
        (system) =>
          typeof system.assembly.rimBoard === "string" &&
          system.assembly.rimBoard.trim().length > 0,
      );
      const rimMember = construction.structuralMembers.structuralMembers.some(
        (member) => member.category === "rim-board",
      );
      return rimNote || rimMember;
    }
    case "has_roof_systems":
      return construction.roofFraming.systems.length > 0;
    case "has_roof_stick":
      return construction.roofFraming.systems.some((system) =>
        isStickFramingType(system.assembly.framingType),
      );
    case "has_roof_truss": {
      const systemTruss = construction.roofFraming.systems.some((system) =>
        isTrussFramingType(system.assembly.framingType),
      );
      const memberTruss = construction.structuralMembers.structuralMembers.some(
        (member) => member.category === "truss",
      );
      return systemTruss || memberTruss;
    }
    case "has_sheathing":
      return (
        construction.sheathing.systems.length > 0 ||
        construction.sheathing.areas.length > 0
      );
    case "has_sheathing_application":
      return construction.sheathing.systems.some(
        (system) =>
          normalizeToken(system.application ?? "") ===
          normalizeToken(signal.application),
      );
    case "has_structural_category":
      return construction.structuralMembers.structuralMembers.some((member) =>
        signal.categories.includes(member.category),
      );
    case "has_structural_material":
      return construction.structuralMembers.structuralMembers.some((member) => {
        const material = normalizeToken(member.materialType ?? "");
        return signal.materials.some(
          (candidate) => material === normalizeToken(candidate),
        );
      });
    default:
      return false;
  }
}

export function domainSignalsFire(
  construction: FramingConstruction,
  signals: readonly DomainSignalRule[],
): { fires: boolean; summary: string | undefined } {
  if (signals.length === 0) {
    return { fires: false, summary: undefined };
  }
  const fired: string[] = [];
  for (const signal of signals) {
    if (evaluateDomainSignal(construction, signal)) {
      fired.push(JSON.stringify(signal));
    }
  }
  if (fired.length === 0) {
    return { fires: false, summary: undefined };
  }
  return { fires: true, summary: fired.join("; ") };
}

function materialHaystack(line: FramingMaterialLineItem): string {
  return normalizeToken(
    `${line.material} ${line.description} ${line.canonicalClassification} ${line.category}`,
  );
}

export function materialMatchesRule(
  line: FramingMaterialLineItem,
  rule: MaterialMatchRule,
): boolean {
  const hasAnyCriterion =
    (rule.quantityKeys?.length ?? 0) > 0 ||
    (rule.quantityKeyPrefixes?.length ?? 0) > 0 ||
    (rule.canonicalClassificationPrefixes?.length ?? 0) > 0 ||
    (rule.categories?.length ?? 0) > 0 ||
    (rule.materialIncludes?.length ?? 0) > 0;

  if (!hasAnyCriterion) {
    return false;
  }

  if (rule.quantityKeys?.length) {
    if (!line.quantityKey || !rule.quantityKeys.includes(line.quantityKey)) {
      return false;
    }
  }

  if (rule.quantityKeyPrefixes?.length) {
    if (
      !line.quantityKey ||
      !rule.quantityKeyPrefixes.some((prefix) =>
        line.quantityKey!.startsWith(prefix),
      )
    ) {
      return false;
    }
  }

  if (rule.canonicalClassificationPrefixes?.length) {
    if (
      !rule.canonicalClassificationPrefixes.some((prefix) =>
        line.canonicalClassification.startsWith(prefix),
      )
    ) {
      return false;
    }
  }

  if (rule.categories?.length) {
    if (!rule.categories.includes(line.category)) {
      return false;
    }
  }

  if (rule.materialIncludes?.length) {
    const haystack = materialHaystack(line);
    if (
      !rule.materialIncludes.every((token) =>
        haystack.includes(normalizeToken(token)),
      )
    ) {
      return false;
    }
  }

  return true;
}

function wallStudsHaveUnresolvedInputs(
  construction: FramingConstruction,
): boolean {
  for (const wall of construction.walls.walls) {
    for (const segment of construction.walls.segments.filter(
      (entry) => entry.parentWallId === wall.id,
    )) {
      const lengthOk = isQuantityInputResolved(
        segment.lengthFeet,
        segment.resolutionTraces,
        "lengthFeet",
      );
      const spacingOk = isQuantityInputResolved(
        wall.assembly.studSpacingInches,
        wall.resolutionTraces,
        "assembly.studSpacingInches",
      );
      const sizeOk = isQuantityInputResolved(
        wall.assembly.studSize,
        wall.resolutionTraces,
        "assembly.studSize",
      );
      if (!lengthOk || !spacingOk || !sizeOk) {
        return true;
      }
    }
  }
  return false;
}

function wallPlatesHaveUnresolvedInputs(
  construction: FramingConstruction,
): boolean {
  for (const wall of construction.walls.walls) {
    for (const segment of construction.walls.segments.filter(
      (entry) => entry.parentWallId === wall.id,
    )) {
      const lengthOk = isQuantityInputResolved(
        segment.lengthFeet,
        segment.resolutionTraces,
        "lengthFeet",
      );
      const plateOk = isQuantityInputResolved(
        wall.assembly.plateCount,
        wall.resolutionTraces,
        "assembly.plateCount",
      );
      if (!lengthOk || !plateOk) {
        return true;
      }
    }
  }
  return false;
}

function openingsHaveUnresolvedInputs(
  construction: FramingConstruction,
): boolean {
  for (const opening of construction.openings.openings) {
    const category = opening.category;
    if (
      category !== "door" &&
      category !== "window" &&
      category !== "cased"
    ) {
      continue;
    }
    const widthOk = isQuantityInputResolved(
      opening.dimensions.roughWidthFeet,
      opening.resolutionTraces,
      "dimensions.roughWidthFeet",
    );
    const qtyOk = isQuantityInputResolved(
      opening.quantity,
      opening.resolutionTraces,
      "quantity",
    );
    const jackOk = isQuantityInputResolved(
      opening.jackStudCount,
      opening.resolutionTraces,
      "jackStudCount",
    );
    if (!widthOk || !qtyOk || !jackOk) {
      return true;
    }
  }
  return false;
}

function floorJoistsHaveUnresolvedInputs(
  construction: FramingConstruction,
): boolean {
  for (const area of construction.floorFraming.areas) {
    const system = construction.floorFraming.systems.find(
      (entry) => entry.id === area.parentSystemId,
    );
    if (!system) {
      return true;
    }
    const layoutOk = isQuantityInputResolved(
      area.joistLayoutLengthFeet,
      area.resolutionTraces,
      "joistLayoutLengthFeet",
    );
    const spacingOk = isQuantityInputResolved(
      system.assembly.joistSpacingInches,
      system.resolutionTraces,
      "assembly.joistSpacingInches",
    );
    const sizeOk = isQuantityInputResolved(
      system.assembly.joistSize,
      system.resolutionTraces,
      "assembly.joistSize",
    );
    const typeOk = isQuantityInputResolved(
      system.assembly.joistType,
      system.resolutionTraces,
      "assembly.joistType",
    );
    if (!layoutOk || !spacingOk || !sizeOk || !typeOk) {
      return true;
    }
  }
  return false;
}

function roofRaftersHaveUnresolvedInputs(
  construction: FramingConstruction,
): boolean {
  for (const plane of construction.roofFraming.planes) {
    const system = construction.roofFraming.systems.find(
      (entry) => entry.id === plane.parentSystemId,
    );
    if (!system) {
      return true;
    }
    if (!isStickFramingType(system.assembly.framingType)) {
      continue;
    }
    const layoutOk = isQuantityInputResolved(
      plane.rafterLayoutLengthFeet,
      plane.resolutionTraces,
      "rafterLayoutLengthFeet",
    );
    const spacingOk = isQuantityInputResolved(
      system.assembly.memberSpacingInches,
      system.resolutionTraces,
      "assembly.memberSpacingInches",
    );
    const sizeOk = isQuantityInputResolved(
      system.assembly.memberSize,
      system.resolutionTraces,
      "assembly.memberSize",
    );
    if (!layoutOk || !spacingOk || !sizeOk) {
      return true;
    }
  }
  return false;
}

function sheathingHasUnresolvedInputs(
  construction: FramingConstruction,
): boolean {
  for (const area of construction.sheathing.areas) {
    const system = construction.sheathing.systems.find(
      (entry) => entry.id === area.parentSystemId,
    );
    if (!system) {
      return true;
    }
    const app = system.application;
    if (app === "unknown" || app == null) {
      return true;
    }
    const areaOk = isQuantityInputResolved(
      area.areaSquareFeet,
      area.resolutionTraces,
      "areaSquareFeet",
    );
    const typeOk = isQuantityInputResolved(
      system.panelSpecification.panelType,
      system.resolutionTraces,
      "panelSpecification.panelType",
    );
    const thicknessOk = isQuantityInputResolved(
      system.panelSpecification.thickness,
      system.resolutionTraces,
      "panelSpecification.thickness",
    );
    if (!areaOk || !typeOk || !thicknessOk) {
      return true;
    }
  }
  return false;
}

function structuralMembersHaveUnresolvedInputs(
  construction: FramingConstruction,
): boolean {
  for (const member of construction.structuralMembers.structuralMembers) {
    if (member.category === "unknown") {
      return true;
    }
    const paths: Array<[unknown, string]> = [
      [member.materialType, "materialType"],
      [member.size, "size"],
      [member.lengthFeet, "lengthFeet"],
      [member.quantity, "quantity"],
    ];
    for (const [value, path] of paths) {
      if (!isQuantityInputResolved(value, member.resolutionTraces, path)) {
        return true;
      }
    }
    if (member.category === "built-up-member") {
      if (
        !isQuantityInputResolved(
          member.plyCount,
          member.resolutionTraces,
          "plyCount",
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function diagnoseInputGap(
  construction: FramingConstruction,
  probe: InputGapProbe | undefined,
): ProductAccountingGapClass {
  if (!probe || probe === "no_emitter") {
    return "calculator_gap";
  }

  let unresolved = false;
  switch (probe) {
    case "wall_studs":
      unresolved = wallStudsHaveUnresolvedInputs(construction);
      break;
    case "wall_plates":
      unresolved = wallPlatesHaveUnresolvedInputs(construction);
      break;
    case "opening_framing":
      unresolved = openingsHaveUnresolvedInputs(construction);
      break;
    case "floor_joists":
      unresolved = floorJoistsHaveUnresolvedInputs(construction);
      break;
    case "roof_common_rafters":
      unresolved = roofRaftersHaveUnresolvedInputs(construction);
      break;
    case "sheathing":
      unresolved = sheathingHasUnresolvedInputs(construction);
      break;
    case "structural_members":
      unresolved = structuralMembersHaveUnresolvedInputs(construction);
      break;
    default:
      unresolved = false;
  }

  return unresolved ? "read_or_input_gap" : "calculator_gap";
}

function accountForItem(
  construction: FramingConstruction,
  materials: readonly FramingMaterialLineItem[],
  checklistItem: MasterTaxonomyChecklistItem,
): ProductAccountingEntry {
  const matchedIndexes: number[] = [];
  const matchedKeys = new Set<string>();

  materials.forEach((line, index) => {
    if (materialMatchesRule(line, checklistItem.materialMatch)) {
      matchedIndexes.push(index);
      if (line.quantityKey) {
        matchedKeys.add(line.quantityKey);
      }
    }
  });

  if (matchedIndexes.length > 0) {
    return {
      taxonomySection: checklistItem.sectionId,
      taxonomySectionTitle: checklistItem.sectionTitle,
      taxonomyItemId: checklistItem.itemId,
      label: checklistItem.label,
      status: "calculated",
      matchedQuantityKeys:
        matchedKeys.size > 0 ? [...matchedKeys].sort() : undefined,
      matchedMaterialIndexes: matchedIndexes,
    };
  }

  const domain = domainSignalsFire(construction, checklistItem.domainSignals);
  if (!domain.fires) {
    return {
      taxonomySection: checklistItem.sectionId,
      taxonomySectionTitle: checklistItem.sectionTitle,
      taxonomyItemId: checklistItem.itemId,
      label: checklistItem.label,
      status: "unaccounted",
      gapClass: "applicability_unestablished",
      notes:
        "No trustworthy house/domain signal established this material for this run.",
    };
  }

  const gapClass = diagnoseInputGap(construction, checklistItem.inputGapProbe);
  return {
    taxonomySection: checklistItem.sectionId,
    taxonomySectionTitle: checklistItem.sectionTitle,
    taxonomyItemId: checklistItem.itemId,
    label: checklistItem.label,
    status: "unaccounted",
    gapClass,
    domainSignalSummary: domain.summary,
    notes:
      gapClass === "read_or_input_gap"
        ? "House/domain establishes need; required calculator inputs are unresolved."
        : "House/domain establishes need; no matching material output (calculator/emitter gap).",
  };
}

/**
 * House-first taxonomy accounting.
 * Taxonomy never decides what exists; empty bags do not become N/A.
 */
export function buildProductAccounting(input: {
  projectId: string;
  construction: FramingConstruction;
  materials: readonly FramingMaterialLineItem[];
  createdAt?: string;
}): ProductAccounting {
  const entries = MASTER_TAXONOMY_CHECKLIST.items.map((item) =>
    accountForItem(input.construction, input.materials, item),
  );

  const byGapClass = {
    applicability_unestablished: 0,
    read_or_input_gap: 0,
    calculator_gap: 0,
  };
  let calculatedCount = 0;
  let unaccountedCount = 0;
  for (const entry of entries) {
    if (entry.status === "calculated") {
      calculatedCount += 1;
    } else {
      unaccountedCount += 1;
      if (entry.gapClass) {
        byGapClass[entry.gapClass] += 1;
      }
    }
  }

  return productAccountingSchema.parse({
    schemaVersion: 1,
    projectId: input.projectId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    entries,
    summary: {
      checklistItemCount: entries.length,
      calculatedCount,
      unaccountedCount,
      byGapClass,
    },
  });
}
