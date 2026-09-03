import type { Assumption } from "../../../core/schemas/assumption.schema.js";
import type {
  ObjectId,
  ReviewItemId,
  UserDecisionId,
} from "../../../core/schemas/identity.schema.js";
import { applyAssumptionUserDecisionLifecycle } from "../claims/applyAssumptionLifecycle.js";
import { consultAssumptionRegistry } from "../claims/assumptionRegistry.js";
import { deriveMaterialClaimStatus } from "../claims/deriveClaimStatus.js";
import type {
  OpeningsPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { PendingMaterialClaim } from "../schemas/claim-outcome.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type { BuildingWall, WallSegment } from "../schemas/wall.schema.js";
import type { Opening, OpeningCategory } from "../schemas/opening.schema.js";
import { isWoodStudWallType } from "../resolvers/wallFramingPropertyPaths.js";
import { createObjectTarget, createReviewItemId } from "../validators/ids.js";
import {
  OPENING_QUANTITY_KEYS,
  OPENINGS_RULE_IDS,
} from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createOpeningCrippleLayoutAssumption } from "./createOpeningCrippleLayoutAssumption.js";
import {
  createOpeningKingStudCountAssumption,
} from "./createOpeningKingStudCountAssumption.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityBlocked } from "./isQuantityBlocked.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const ELIGIBLE_CATEGORIES = new Set<OpeningCategory>([
  "door",
  "window",
  "cased",
]);

const QUANTITY_PROPERTY_PATH = "quantity";
const KING_STUD_COUNT_PROPERTY_PATH = "kingStudCount";
const JACK_STUD_COUNT_PROPERTY_PATH = "jackStudCount";
const ROUGH_WIDTH_PROPERTY_PATH = "dimensions.roughWidthFeet";
const ROUGH_HEIGHT_PROPERTY_PATH = "dimensions.roughHeightFeet";
const STUD_SIZE_PROPERTY_PATH = "assembly.studSize";
const STUD_SPACING_PROPERTY_PATH = "assembly.studSpacingInches";

export type OpeningFramingCalculationResult = {
  materials: FramingMaterialLineItem[];
  assumptions: Assumption[];
  pendingClaims: PendingMaterialClaim[];
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function emitLineItem(
  item: FramingMaterialLineItem,
): FramingMaterialLineItem | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  return framingMaterialLineItemSchema.parse(item);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function isWoodStudWall(wall: BuildingWall): boolean {
  const material = normalizeToken(wall.assembly.material ?? "");
  if (material.includes("metal") || material.includes("gauge")) {
    return false;
  }

  if (
    material.includes("lumber") ||
    material.includes("wood") ||
    material === "dimensional-lumber"
  ) {
    return true;
  }

  return wall.wallType !== null && isWoodStudWallType(wall.wallType);
}

function resolveParentSegment(
  opening: Opening,
  segmentsById: ReadonlyMap<ObjectId, WallSegment>,
): WallSegment | null {
  if (opening.parentObjectId === null) {
    return null;
  }

  const segment = segmentsById.get(opening.parentObjectId);
  if (!segment || segment.objectType !== "wall-segment") {
    return null;
  }

  return segment;
}

function kingStudDefaultReviewItemId(opening: Opening): ReviewItemId {
  return createReviewItemId(
    OPENINGS_RULE_IDS.kingStudCountDefault,
    createObjectTarget(opening.id, opening.objectType),
  );
}

function roughSillSizeDefaultReviewItemId(opening: Opening): ReviewItemId {
  return createReviewItemId(
    OPENINGS_RULE_IDS.roughSillSizeDefault,
    createObjectTarget(opening.id, opening.objectType),
  );
}

function crippleLayoutDefaultReviewItemId(opening: Opening): ReviewItemId {
  return createReviewItemId(
    OPENINGS_RULE_IDS.crippleLayoutDefault,
    createObjectTarget(opening.id, opening.objectType),
  );
}

/**
 * Layout continuation between king studs per ch.13.
 */
function crippleCountPerOccurrence(
  roughWidthFeet: number,
  studSpacingInches: number,
): number {
  return Math.max(0, Math.ceil((roughWidthFeet * 12) / studSpacingInches) - 1);
}

function isRoughHeightResolved(opening: Opening): boolean {
  return isQuantityInputResolved(
    opening.dimensions.roughHeightFeet,
    opening.resolutionTraces,
    ROUGH_HEIGHT_PROPERTY_PATH,
  );
}

function isCrippleSpacingResolved(wall: BuildingWall): boolean {
  return isQuantityInputResolved(
    wall.assembly.studSpacingInches,
    wall.resolutionTraces,
    STUD_SPACING_PROPERTY_PATH,
  );
}

function isEligibleForCripplesAbove(opening: Opening): boolean {
  if (opening.category === "window") {
    return true;
  }

  if (
    opening.category === "cased" &&
    opening.headerMemberId !== null &&
    isRoughHeightResolved(opening)
  ) {
    return true;
  }

  return false;
}

function sharedCripplePreconditions(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
  quantityKey: string,
): {
  roughWidthFeet: number;
  studSpacingInches: number;
  studSize: string;
  occurrenceMultiplier: number;
} | null {
  const contributingObjects = [opening, wall, segment];

  if (
    isQuantityBlocked(
      validation,
      contributingObjects.map((object) => object.id),
      quantityKey,
    ) ||
    isQuantityBlocked(
      validation,
      [opening.id],
      OPENING_QUANTITY_KEYS.framing,
    )
  ) {
    return null;
  }

  if (!isOpeningEligibleForWallFraming(opening, wall, segment)) {
    return null;
  }

  if (!isCrippleSpacingResolved(wall)) {
    return null;
  }

  if (
    !isQuantityInputResolved(
      opening.quantity,
      opening.resolutionTraces,
      QUANTITY_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  if (
    !isQuantityInputResolved(
      opening.dimensions.roughWidthFeet,
      opening.resolutionTraces,
      ROUGH_WIDTH_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  const studSize = wall.assembly.studSize;
  const studSpacingInches = wall.assembly.studSpacingInches;
  if (studSize === null || studSpacingInches === null) {
    return null;
  }

  return {
    roughWidthFeet: opening.dimensions.roughWidthFeet,
    studSpacingInches,
    studSize,
    occurrenceMultiplier: opening.quantity,
  };
}

function buildCrippleLineItem(input: {
  opening: Opening;
  wall: BuildingWall;
  segment: WallSegment;
  quantityKey: string;
  quantity: number;
  description: string;
  canonicalClassification: string;
  usedPropertyPaths: string[];
  assumption: Assumption | null;
}): FramingMaterialLineItem | null {
  const provenance = collectLineItemProvenance(
    [input.opening, input.wall, input.segment],
    input.usedPropertyPaths,
  );
  const assumptionIds = [
    ...provenance.assumptionIds,
    ...(input.assumption ? [input.assumption.id] : []),
  ];
  const reviewItemIds = [
    ...provenance.reviewItemIds,
    ...(input.assumption ? input.assumption.reviewItemIds : []),
  ];

  return emitLineItem({
    id: createMaterialLineItemId(input.quantityKey, input.opening.id),
    quantityKey: input.quantityKey,
    claimStatus: "CALCULATED_WITH_ASSUMPTION",
    category: "lumber",
    description: input.description,
    canonicalClassification: input.canonicalClassification,
    quantity: input.quantity,
    unit: "each",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds,
    reviewItemIds,
  });
}

function calculateOpeningCripples(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
): OpeningFramingCalculationResult {
  const aboveEligible = isEligibleForCripplesAbove(opening);
  const belowEligible = opening.category === "window";

  if (!aboveEligible && !belowEligible) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const abovePreconditions = aboveEligible
    ? sharedCripplePreconditions(
        opening,
        wall,
        segment,
        validation,
        OPENING_QUANTITY_KEYS.cripplesAbove,
      )
    : null;
  const belowPreconditions = belowEligible
    ? sharedCripplePreconditions(
        opening,
        wall,
        segment,
        validation,
        OPENING_QUANTITY_KEYS.cripplesBelow,
      )
    : null;

  if (!abovePreconditions && !belowPreconditions) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const preconditions = abovePreconditions ?? belowPreconditions;
  if (!preconditions) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const perOccurrenceCount = crippleCountPerOccurrence(
    preconditions.roughWidthFeet,
    preconditions.studSpacingInches,
  );
  const totalCount = perOccurrenceCount * preconditions.occurrenceMultiplier;

  const affectedQuantityKeys: string[] = [];
  const materials: FramingMaterialLineItem[] = [];

  if (abovePreconditions) {
    affectedQuantityKeys.push(OPENING_QUANTITY_KEYS.cripplesAbove);
    const lineItem = buildCrippleLineItem({
      opening,
      wall,
      segment,
      quantityKey: OPENING_QUANTITY_KEYS.cripplesAbove,
      quantity: totalCount,
      description: `${preconditions.studSize} cripple studs above header`,
      canonicalClassification: `cripple-above-${preconditions.studSize}`,
      usedPropertyPaths: [
        QUANTITY_PROPERTY_PATH,
        ROUGH_WIDTH_PROPERTY_PATH,
        STUD_SIZE_PROPERTY_PATH,
        STUD_SPACING_PROPERTY_PATH,
        ...(opening.category === "cased" ? [ROUGH_HEIGHT_PROPERTY_PATH] : []),
      ],
      assumption: null,
    });
    if (lineItem) {
      materials.push(lineItem);
    }
  }

  if (belowPreconditions) {
    affectedQuantityKeys.push(OPENING_QUANTITY_KEYS.cripplesBelow);
    const lineItem = buildCrippleLineItem({
      opening,
      wall,
      segment,
      quantityKey: OPENING_QUANTITY_KEYS.cripplesBelow,
      quantity: totalCount,
      description: `${preconditions.studSize} cripple studs below sill`,
      canonicalClassification: `cripple-below-${preconditions.studSize}`,
      usedPropertyPaths: [
        QUANTITY_PROPERTY_PATH,
        ROUGH_WIDTH_PROPERTY_PATH,
        STUD_SIZE_PROPERTY_PATH,
        STUD_SPACING_PROPERTY_PATH,
      ],
      assumption: null,
    });
    if (lineItem) {
      materials.push(lineItem);
    }
  }

  if (materials.length === 0) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const quantityKeyForRegistry = affectedQuantityKeys[0]!;
  const registered = consultAssumptionRegistry({
    quantityKey: quantityKeyForRegistry,
    propertyPath: "crippleStudLayout",
    context: { objectId: opening.id },
    reviewItemId: crippleLayoutDefaultReviewItemId(opening),
  });
  if (registered.outcome !== "assumed") {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }
  // Single assumption covering all emitted cripple quantityKeys for this opening.
  const assumption = createOpeningCrippleLayoutAssumption(
    opening.id,
    crippleLayoutDefaultReviewItemId(opening),
    affectedQuantityKeys,
  );

  return {
    materials: materials.map((material) =>
      framingMaterialLineItemSchema.parse({
        ...material,
        quantityKey: material.quantityKey,
        claimStatus: deriveMaterialClaimStatus({
          assumptions: [assumption],
          assumptionIds: [assumption.id],
        }),
        assumptionIds: [assumption.id],
        reviewItemIds: [...assumption.reviewItemIds],
      }),
    ),
    assumptions: [assumption],
    pendingClaims: [],
  };
}

function isOpeningEligibleForWallFraming(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
): boolean {
  if (!ELIGIBLE_CATEGORIES.has(opening.category)) {
    return false;
  }

  if (opening.category === "garage-door") {
    return false;
  }

  if (segment.parentWallId !== wall.id) {
    return false;
  }

  if (!isWoodStudWall(wall)) {
    return false;
  }

  if (
    !isQuantityInputResolved(
      wall.assembly.studSize,
      wall.resolutionTraces,
      STUD_SIZE_PROPERTY_PATH,
    )
  ) {
    return false;
  }

  // Wall height is review-only for opening COUNT / sill LF / cripple COUNT
  // (claim-critical contracts). Do not gate these quantities on heightFeet.
  return true;
}

function isOpeningEligibleForKingStuds(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
): boolean {
  return isOpeningEligibleForWallFraming(opening, wall, segment);
}

function isOpeningEligibleForJackStuds(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
): boolean {
  return isOpeningEligibleForWallFraming(opening, wall, segment);
}

function resolveKingStudCountPerOccurrence(
  opening: Opening,
): { count: number; assumption: Assumption | null } | null {
  if (
    isQuantityInputResolved(
      opening.kingStudCount,
      opening.resolutionTraces,
      KING_STUD_COUNT_PROPERTY_PATH,
    )
  ) {
    const trace = opening.resolutionTraces.find(
      (entry) => entry.propertyPath === KING_STUD_COUNT_PROPERTY_PATH,
    );
    if (
      (trace?.method === "user-override" ||
        trace?.method === "approved-default") &&
      trace.userDecisionIds.length > 0 &&
      opening.kingStudCount !== null
    ) {
      const reviewItemId = kingStudDefaultReviewItemId(opening);
      const active = createOpeningKingStudCountAssumption(
        opening.id,
        reviewItemId,
      );
      return {
        count: opening.kingStudCount,
        assumption: applyAssumptionUserDecisionLifecycle(active, {
          status:
            trace.method === "approved-default" ? "confirmed" : "replaced",
          userDecisionId: trace.userDecisionIds[0] as UserDecisionId,
        }),
      };
    }
    return { count: opening.kingStudCount, assumption: null };
  }

  const reviewItemId = kingStudDefaultReviewItemId(opening);
  const consulted = consultAssumptionRegistry({
    quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
    propertyPath: KING_STUD_COUNT_PROPERTY_PATH,
    context: { objectId: opening.id },
    reviewItemId,
  });
  if (consulted.outcome !== "assumed") {
    return null;
  }
  if (typeof consulted.assumedValue !== "number") {
    return null;
  }
  return {
    count: consulted.assumedValue,
    assumption: consulted.assumption,
  };
}

function calculateOpeningJackStuds(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
): OpeningFramingCalculationResult {
  const quantityKey = OPENING_QUANTITY_KEYS.jackStuds;
  const contributingObjects = [opening, wall, segment];

  if (
    isQuantityBlocked(
      validation,
      contributingObjects.map((object) => object.id),
      quantityKey,
    ) ||
    isQuantityBlocked(
      validation,
      [opening.id],
      OPENING_QUANTITY_KEYS.framing,
    )
  ) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (!isOpeningEligibleForJackStuds(opening, wall, segment)) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (
    !isQuantityInputResolved(
      opening.quantity,
      opening.resolutionTraces,
      QUANTITY_PROPERTY_PATH,
    )
  ) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (
    !isQuantityInputResolved(
      opening.jackStudCount,
      opening.resolutionTraces,
      JACK_STUD_COUNT_PROPERTY_PATH,
    )
  ) {
    // D22: no PendingMaterialClaim — skip when required input is missing.
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const quantity = opening.jackStudCount * opening.quantity;
  const provenance = collectLineItemProvenance(contributingObjects, [
    QUANTITY_PROPERTY_PATH,
    JACK_STUD_COUNT_PROPERTY_PATH,
    STUD_SIZE_PROPERTY_PATH,
  ]);

  const lineItem = emitLineItem({
    id: createMaterialLineItemId(quantityKey, opening.id),
    quantityKey,
    claimStatus: "CONFIRMED",
    category: "lumber",
    description: `${wall.assembly.studSize} jack studs`,
    canonicalClassification: `jack-stud-${wall.assembly.studSize}`,
    quantity,
    unit: "each",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
    reviewItemIds: provenance.reviewItemIds,
  });

  if (!lineItem) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  return { materials: [lineItem], assumptions: [], pendingClaims: [] };
}

function calculateOpeningKingStuds(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
): OpeningFramingCalculationResult {
  const quantityKey = OPENING_QUANTITY_KEYS.kingStuds;
  const contributingObjects = [opening, wall, segment];

  if (
    isQuantityBlocked(
      validation,
      contributingObjects.map((object) => object.id),
      quantityKey,
    ) ||
    isQuantityBlocked(
      validation,
      [opening.id],
      OPENING_QUANTITY_KEYS.framing,
    )
  ) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (!isOpeningEligibleForKingStuds(opening, wall, segment)) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (
    !isQuantityInputResolved(
      opening.quantity,
      opening.resolutionTraces,
      QUANTITY_PROPERTY_PATH,
    )
  ) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const kingStudCount = resolveKingStudCountPerOccurrence(opening);
  if (!kingStudCount) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const quantity = kingStudCount.count * opening.quantity;
  const usedPropertyPaths = [
    QUANTITY_PROPERTY_PATH,
    STUD_SIZE_PROPERTY_PATH,
  ];

  if (kingStudCount.assumption === null) {
    usedPropertyPaths.push(KING_STUD_COUNT_PROPERTY_PATH);
  }

  const provenance = collectLineItemProvenance(contributingObjects, usedPropertyPaths);
  const assumptionIds = [
    ...provenance.assumptionIds,
    ...(kingStudCount.assumption ? [kingStudCount.assumption.id] : []),
  ];
  const reviewItemIds = [
    ...provenance.reviewItemIds,
    ...(kingStudCount.assumption
      ? kingStudCount.assumption.reviewItemIds
      : []),
  ];

  const assumptions = kingStudCount.assumption ? [kingStudCount.assumption] : [];
  const lineItem = emitLineItem({
    id: createMaterialLineItemId(quantityKey, opening.id),
    quantityKey,
    claimStatus: deriveMaterialClaimStatus({
      assumptions,
      assumptionIds,
    }),
    category: "lumber",
    description: `${wall.assembly.studSize} king studs`,
    canonicalClassification: `king-stud-${wall.assembly.studSize}`,
    quantity,
    unit: "each",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds,
    reviewItemIds,
  });

  if (!lineItem) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  // Replaced assumptions are retained for lifecycle provenance but are not "active".
  const emittedAssumptions =
    kingStudCount.assumption && kingStudCount.assumption.status === "active"
      ? [kingStudCount.assumption]
      : kingStudCount.assumption
        ? [kingStudCount.assumption]
        : [];

  return {
    materials: [lineItem],
    assumptions: emittedAssumptions,
    pendingClaims: [],
  };
}

function calculateOpeningRoughSill(
  opening: Opening,
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
): OpeningFramingCalculationResult {
  const quantityKey = OPENING_QUANTITY_KEYS.roughSill;
  const contributingObjects = [opening, wall, segment];

  if (
    isQuantityBlocked(
      validation,
      contributingObjects.map((object) => object.id),
      quantityKey,
    ) ||
    isQuantityBlocked(
      validation,
      [opening.id],
      OPENING_QUANTITY_KEYS.framing,
    )
  ) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (opening.category !== "window") {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (!isOpeningEligibleForWallFraming(opening, wall, segment)) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (
    !isQuantityInputResolved(
      opening.quantity,
      opening.resolutionTraces,
      QUANTITY_PROPERTY_PATH,
    )
  ) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  if (
    !isQuantityInputResolved(
      opening.dimensions.roughWidthFeet,
      opening.resolutionTraces,
      ROUGH_WIDTH_PROPERTY_PATH,
    )
  ) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const roughSillLinearFeet =
    opening.dimensions.roughWidthFeet * opening.quantity;
  const studSize = wall.assembly.studSize;
  if (studSize === null) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  const reviewItemId = roughSillSizeDefaultReviewItemId(opening);
  const consulted = consultAssumptionRegistry({
    quantityKey,
    propertyPath: "roughSillSize",
    context: {
      objectId: opening.id,
      derivationInputs: { wallStudSize: studSize },
    },
    reviewItemId,
  });
  if (consulted.outcome !== "assumed") {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }
  const sillSizeAssumption = consulted.assumption;

  const usedPropertyPaths = [
    QUANTITY_PROPERTY_PATH,
    ROUGH_WIDTH_PROPERTY_PATH,
    STUD_SIZE_PROPERTY_PATH,
  ];

  const provenance = collectLineItemProvenance(contributingObjects, usedPropertyPaths);
  const assumptionIds = [
    ...provenance.assumptionIds,
    sillSizeAssumption.id,
  ];
  const reviewItemIds = [
    ...provenance.reviewItemIds,
    ...sillSizeAssumption.reviewItemIds,
  ];

  const lineItem = emitLineItem({
    id: createMaterialLineItemId(quantityKey, opening.id),
    quantityKey,
    claimStatus: deriveMaterialClaimStatus({
      assumptions: [sillSizeAssumption],
      assumptionIds,
    }),
    category: "lumber",
    description: `${studSize} rough sill`,
    canonicalClassification: `rough-sill-${studSize}`,
    quantity: roughSillLinearFeet,
    unit: "linear-foot",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds,
    reviewItemIds,
  });

  if (!lineItem) {
    return { materials: [], assumptions: [], pendingClaims: [] };
  }

  return {
    materials: [lineItem],
    assumptions: [sillSizeAssumption],
    pendingClaims: [],
  };
}

/**
 * Calculates opening-derived wall framing quantities from resolved artifacts.
 *
 * King stud, jack stud, rough sill, and cripple stud slices:
 * `knowledge/framing/13-opening-wall-framing-calculations.md`.
 */
export function calculateOpeningFraming(
  openings: OpeningsPayload,
  wallFraming: WallFramingPayload,
  validation?: ValidationPayload,
): OpeningFramingCalculationResult {
  const wallsById = new Map(wallFraming.walls.map((wall) => [wall.id, wall]));
  const segmentsById = new Map(
    wallFraming.segments.map((segment) => [segment.id, segment]),
  );
  const sortedOpenings = [...openings.openings].sort((left, right) =>
    compareIds(left.id, right.id),
  );

  const materials: FramingMaterialLineItem[] = [];
  const assumptions: Assumption[] = [];
  const pendingClaims: PendingMaterialClaim[] = [];

  for (const opening of sortedOpenings) {
    const segment = resolveParentSegment(opening, segmentsById);
    if (!segment) {
      continue;
    }

    const wall = wallsById.get(segment.parentWallId);
    if (!wall) {
      continue;
    }

    const kingResult = calculateOpeningKingStuds(opening, wall, segment, validation);
    const jackResult = calculateOpeningJackStuds(opening, wall, segment, validation);
    const sillResult = calculateOpeningRoughSill(opening, wall, segment, validation);
    const crippleResult = calculateOpeningCripples(opening, wall, segment, validation);
    materials.push(
      ...kingResult.materials,
      ...jackResult.materials,
      ...sillResult.materials,
      ...crippleResult.materials,
    );
    assumptions.push(
      ...kingResult.assumptions,
      ...jackResult.assumptions,
      ...sillResult.assumptions,
      ...crippleResult.assumptions,
    );
    pendingClaims.push(
      ...kingResult.pendingClaims,
      ...jackResult.pendingClaims,
      ...sillResult.pendingClaims,
      ...crippleResult.pendingClaims,
    );
  }

  return { materials, assumptions, pendingClaims };
}
