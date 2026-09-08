import { isQuantityInputResolved } from "../calculate/isQuantityInputResolved.js";
import {
  isNonWoodFloorTakeoffAreaFromTraces,
  layoutTextIndicatesExplicitConcreteSlab,
} from "../resolve/floorAreaMaterialCompatibility.js";
import type { FloorFramingArea } from "../schemas/floor-framing.schema.js";
import type { FramingConstruction } from "../schemas/framingConstruction.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import type { BuildingWall } from "../schemas/wall.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import {
  productAccountingSchema,
  type ProductAccounting,
  type ProductAccountingEntry,
  type ProductAccountingGapClass,
} from "../schemas/productAccounting.schema.js";
import {
  MASTER_TAXONOMY_CHECKLIST,
  type DomainSignalRule,
  type HeaderOpeningRole,
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

function framingTypeNamesStickOrRafter(token: string): boolean {
  return (
    token.includes("stick") ||
    token.includes("rafter") ||
    token.includes("conventional") ||
    token.includes("dimensional")
  );
}

function isStickFramingType(framingType: string | null): boolean {
  if (!framingType) return false;
  const token = normalizeToken(framingType);
  if (token.includes("truss")) return false;
  return framingTypeNamesStickOrRafter(token);
}

/**
 * Exclusive truss classification. Mixed notes such as "truss and rafter
 * framing" do not identify a truss package.
 */
function isExclusiveTrussFramingType(framingType: string | null): boolean {
  if (!framingType) return false;
  const token = normalizeToken(framingType);
  if (!token.includes("truss")) return false;
  return !framingTypeNamesStickOrRafter(token);
}

function requiredWallLocationFromSignals(
  signals: readonly DomainSignalRule[],
): "exterior" | "interior" | null {
  const wantsExterior = signals.some(
    (signal) => signal.kind === "has_exterior_walls",
  );
  const wantsInterior = signals.some(
    (signal) => signal.kind === "has_interior_walls",
  );
  if (wantsExterior && !wantsInterior) return "exterior";
  if (wantsInterior && !wantsExterior) return "interior";
  return null;
}

function wallMatchesLocationRequirement(
  location: string | null,
  required: "exterior" | "interior",
): boolean {
  return required === "exterior"
    ? wallLocationIsExterior(location)
    : wallLocationIsInterior(location);
}

function membersSourcedByLine(
  line: FramingMaterialLineItem,
  construction: FramingConstruction,
): StructuralMember[] {
  const membersById = new Map(
    construction.structuralMembers.structuralMembers.map((member) => [
      member.id,
      member,
    ]),
  );
  const found = new Map<string, StructuralMember>();
  for (const id of line.sourceObjectIds) {
    const member = membersById.get(id);
    if (member) {
      found.set(member.id, member);
    }
  }
  return [...found.values()];
}

function openingsServedByMember(
  member: StructuralMember,
  construction: FramingConstruction,
): Opening[] {
  const found = new Map<string, Opening>();
  for (const opening of construction.openings.openings) {
    if (opening.headerMemberId === member.id) {
      found.set(opening.id, opening);
    }
  }
  const openingsById = new Map(
    construction.openings.openings.map((opening) => [opening.id, opening]),
  );
  for (const id of member.supportedObjectIds) {
    const opening = openingsById.get(id);
    if (opening) {
      found.set(opening.id, opening);
    }
  }
  return [...found.values()];
}

function wallForOpening(
  opening: Opening,
  construction: FramingConstruction,
): BuildingWall | null {
  if (!opening.parentWallId) {
    return null;
  }
  return (
    construction.walls.walls.find((wall) => wall.id === opening.parentWallId) ??
    null
  );
}

/**
 * Header construction role from linked openings. Unknown-location doors
 * match neither side — wall location is never invented.
 */
function memberServesHeaderOpeningRole(
  member: StructuralMember,
  construction: FramingConstruction,
  role: HeaderOpeningRole,
): boolean {
  if (member.category !== "header") {
    return false;
  }
  for (const opening of openingsServedByMember(member, construction)) {
    if (role === "interior-door") {
      if (opening.category !== "door") {
        continue;
      }
      const wall = wallForOpening(opening, construction);
      if (wall && wallLocationIsInterior(wall.location)) {
        return true;
      }
      continue;
    }
    if (opening.category === "garage-door" || opening.category === "window") {
      return true;
    }
    if (opening.category === "door") {
      const wall = wallForOpening(opening, construction);
      if (wall && wallLocationIsExterior(wall.location)) {
        return true;
      }
    }
  }
  return false;
}

function memberMatchesCompoundStructuralSignal(
  member: StructuralMember,
  signal: Extract<DomainSignalRule, { kind: "has_structural_member" }>,
): boolean {
  if (!signal.categories.includes(member.category)) {
    return false;
  }
  if (!signal.materials?.length) {
    return true;
  }
  const material = normalizeToken(member.materialType ?? "");
  return signal.materials.some(
    (candidate) => material === normalizeToken(candidate),
  );
}

function lineMatchesDomainConstructionRole(
  line: FramingMaterialLineItem,
  construction: FramingConstruction,
  signals: readonly DomainSignalRule[],
): boolean {
  const headerRoles = signals.filter(
    (
      signal,
    ): signal is Extract<DomainSignalRule, { kind: "has_header_opening_role" }> =>
      signal.kind === "has_header_opening_role",
  );
  const memberSignals = signals.filter(
    (
      signal,
    ): signal is Extract<DomainSignalRule, { kind: "has_structural_member" }> =>
      signal.kind === "has_structural_member",
  );
  if (headerRoles.length === 0 && memberSignals.length === 0) {
    return true;
  }
  const members = membersSourcedByLine(line, construction);
  if (headerRoles.length > 0) {
    const servesRole = members.some((member) =>
      headerRoles.some((signal) =>
        memberServesHeaderOpeningRole(member, construction, signal.role),
      ),
    );
    if (!servesRole) {
      return false;
    }
  }
  if (memberSignals.length > 0) {
    const matchesMember = members.some((member) =>
      memberSignals.some((signal) =>
        memberMatchesCompoundStructuralSignal(member, signal),
      ),
    );
    if (!matchesMember) {
      return false;
    }
  }
  return true;
}

function wallsSourcedByLine(
  line: FramingMaterialLineItem,
  construction: FramingConstruction,
): BuildingWall[] {
  const wallsById = new Map(
    construction.walls.walls.map((wall) => [wall.id, wall]),
  );
  const segmentsById = new Map(
    construction.walls.segments.map((segment) => [segment.id, segment]),
  );
  const found = new Map<string, BuildingWall>();
  for (const id of line.sourceObjectIds) {
    const wall = wallsById.get(id);
    if (wall) {
      found.set(wall.id, wall);
    }
    const segment = segmentsById.get(id);
    if (segment) {
      const parent = wallsById.get(segment.parentWallId);
      if (parent) {
        found.set(parent.id, parent);
      }
    }
  }
  return [...found.values()];
}

function lineMatchesRequiredWallLocation(
  line: FramingMaterialLineItem,
  construction: FramingConstruction,
  required: "exterior" | "interior",
): boolean {
  return wallsSourcedByLine(line, construction).some((wall) =>
    wallMatchesLocationRequirement(wall.location, required),
  );
}

function isFloorJoistTakeoffArea(
  area: FloorFramingArea,
  construction: FramingConstruction,
): boolean {
  if (isNonWoodFloorTakeoffAreaFromTraces(area)) {
    return false;
  }
  if (layoutTextIndicatesExplicitConcreteSlab(area.layout ?? "")) {
    return false;
  }
  if (area.joistLayoutLengthFeet != null || area.joistMemberLengthFeet != null) {
    return true;
  }
  const layoutToken = normalizeToken(area.layout ?? "");
  if (
    layoutToken.includes("joist") ||
    layoutToken.includes("crawl") ||
    layoutToken.includes("tji") ||
    layoutToken.includes("visqueen")
  ) {
    return true;
  }
  return construction.floorFraming.systems.some(
    (system) => system.id === area.parentSystemId,
  );
}

function memberMatchesStructuralSignals(
  member: StructuralMember,
  signals: readonly DomainSignalRule[],
  construction: FramingConstruction,
): boolean {
  const structuralSignals = signals.filter(
    (
      signal,
    ): signal is Extract<
      DomainSignalRule,
      | { kind: "has_structural_category" }
      | { kind: "has_structural_material" }
      | { kind: "has_structural_member" }
      | { kind: "has_header_opening_role" }
    > =>
      signal.kind === "has_structural_category" ||
      signal.kind === "has_structural_material" ||
      signal.kind === "has_structural_member" ||
      signal.kind === "has_header_opening_role",
  );
  if (structuralSignals.length === 0) {
    return true;
  }
  return structuralSignals.some((signal) => {
    if (signal.kind === "has_structural_category") {
      return signal.categories.includes(member.category);
    }
    if (signal.kind === "has_structural_member") {
      return memberMatchesCompoundStructuralSignal(member, signal);
    }
    if (signal.kind === "has_header_opening_role") {
      return memberServesHeaderOpeningRole(member, construction, signal.role);
    }
    const material = normalizeToken(member.materialType ?? "");
    return signal.materials.some(
      (candidate) => material === normalizeToken(candidate),
    );
  });
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
      return construction.floorFraming.areas.some((area) =>
        isFloorJoistTakeoffArea(area, construction),
      );
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
        isExclusiveTrussFramingType(system.assembly.framingType),
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
    case "has_structural_member":
      return construction.structuralMembers.structuralMembers.some((member) =>
        memberMatchesCompoundStructuralSignal(member, signal),
      );
    case "has_header_opening_role":
      return construction.structuralMembers.structuralMembers.some((member) =>
        memberServesHeaderOpeningRole(member, construction, signal.role),
      );
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

function wallsForLocationProbe(
  construction: FramingConstruction,
  signals: readonly DomainSignalRule[],
): BuildingWall[] {
  const required = requiredWallLocationFromSignals(signals);
  if (!required) {
    return construction.walls.walls;
  }
  return construction.walls.walls.filter((wall) =>
    wallMatchesLocationRequirement(wall.location, required),
  );
}

function wallStudsHaveUnresolvedInputs(
  construction: FramingConstruction,
  signals: readonly DomainSignalRule[],
): boolean {
  for (const wall of wallsForLocationProbe(construction, signals)) {
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
  signals: readonly DomainSignalRule[],
): boolean {
  for (const wall of wallsForLocationProbe(construction, signals)) {
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
    if (!isFloorJoistTakeoffArea(area, construction)) {
      continue;
    }
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
  signals: readonly DomainSignalRule[],
): boolean {
  for (const member of construction.structuralMembers.structuralMembers) {
    if (!memberMatchesStructuralSignals(member, signals, construction)) {
      continue;
    }
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
  signals: readonly DomainSignalRule[] = [],
): ProductAccountingGapClass {
  if (!probe || probe === "no_emitter") {
    return "calculator_gap";
  }

  let unresolved = false;
  switch (probe) {
    case "wall_studs":
      unresolved = wallStudsHaveUnresolvedInputs(construction, signals);
      break;
    case "wall_plates":
      unresolved = wallPlatesHaveUnresolvedInputs(construction, signals);
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
      unresolved = structuralMembersHaveUnresolvedInputs(construction, signals);
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

  const requiredWallLocation = requiredWallLocationFromSignals(
    checklistItem.domainSignals,
  );
  materials.forEach((line, index) => {
    if (!materialMatchesRule(line, checklistItem.materialMatch)) {
      return;
    }
    if (
      requiredWallLocation &&
      !lineMatchesRequiredWallLocation(
        line,
        construction,
        requiredWallLocation,
      )
    ) {
      return;
    }
    if (
      !lineMatchesDomainConstructionRole(
        line,
        construction,
        checklistItem.domainSignals,
      )
    ) {
      return;
    }
    matchedIndexes.push(index);
    if (line.quantityKey) {
      matchedKeys.add(line.quantityKey);
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

  const gapClass = diagnoseInputGap(
    construction,
    checklistItem.inputGapProbe,
    checklistItem.domainSignals,
  );
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
