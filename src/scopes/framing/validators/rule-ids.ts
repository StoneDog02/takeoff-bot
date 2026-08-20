/**
 * Stable validation rule identifiers for the framing scope.
 *
 * Rule text and construction behavior live in the Construction Brain.
 * These constants are the deterministic keys used by results and issues.
 */
export const WALL_FRAMING_RULE_IDS = {
  segmentParentResolved: "wall.segment.parent.resolved",
  segmentsConsistent: "wall.segments.consistent",
  typeResolved: "wall.type.resolved",
  heightResolved: "wall.height.resolved",
  geometryLengthResolved: "wall.geometry.length.resolved",
  locationResolved: "wall.location.resolved",
  bearingResolved: "wall.bearing.resolved",
} as const;

export type WallFramingRuleId =
  (typeof WALL_FRAMING_RULE_IDS)[keyof typeof WALL_FRAMING_RULE_IDS];

/**
 * Minimum quantity keys referenced by wall framing validation rules.
 */
export const WALL_QUANTITY_KEYS = {
  studs: "wall.studs",
  plates: "wall.plates",
  sheathing: "wall.sheathing",
} as const;

export const OPENINGS_RULE_IDS = {
  parentResolved: "opening.parent.resolved",
  parentWallResolved: "opening.parentWall.resolved",
  categoryResolved: "opening.category.resolved",
  nominalDimensionsResolved: "opening.dimensions.nominal.resolved",
  roughDimensionsResolved: "opening.dimensions.rough.resolved",
  headerReferenceResolved: "opening.header.reference.resolved",
  quantityResolved: "opening.quantity.resolved",
  kingStudCountDefault: "opening.kingStudCount.default",
  jackStudCountResolved: "opening.jackStudCount.resolved",
  roughSillSizeDefault: "opening.roughSillSize.default",
  crippleLayoutDefault: "opening.crippleLayout.default",
} as const;

export type OpeningsRuleId =
  (typeof OPENINGS_RULE_IDS)[keyof typeof OPENINGS_RULE_IDS];

export const OPENING_QUANTITY_KEYS = {
  framing: "opening.framing",
  header: "opening.header",
  kingStuds: "opening.king-studs",
  jackStuds: "opening.jack-studs",
  roughSill: "opening.rough-sill",
  cripplesAbove: "opening.cripples-above",
  cripplesBelow: "opening.cripples-below",
} as const;

export const STRUCTURAL_MEMBER_RULE_IDS = {
  categoryResolved: "member.category.resolved",
  materialResolved: "member.material.resolved",
  sizeResolved: "member.size.resolved",
  lengthResolved: "member.length.resolved",
  quantityResolved: "member.quantity.resolved",
  plyCountResolved: "member.plyCount.resolved",
  associatedObjectsResolved: "member.associatedObjects.resolved",
  supportedObjectsResolved: "member.supportedObjects.resolved",
  supportingObjectsResolved: "member.supportingObjects.resolved",
  connectorReferencesResolved: "member.connectors.resolved",
} as const;

export type StructuralMemberRuleId =
  (typeof STRUCTURAL_MEMBER_RULE_IDS)[keyof typeof STRUCTURAL_MEMBER_RULE_IDS];

export const STRUCTURAL_MEMBER_QUANTITY_KEYS = {
  material: "member.material",
  length: "member.length",
} as const;

export const FLOOR_FRAMING_RULE_IDS = {
  areaParentSystemResolved: "floor.area.parentSystem.resolved",
  systemAreasConsistent: "floor.system.areas.consistent",
  joistTypeResolved: "floor.system.assembly.joistType.resolved",
  joistSizeResolved: "floor.system.assembly.joistSize.resolved",
  joistSpacingResolved: "floor.system.assembly.joistSpacing.resolved",
  spanDirectionResolved: "floor.area.spanDirection.resolved",
  joistLayoutLengthResolved: "floor.area.joistLayoutLength.resolved",
  joistMemberLengthResolved: "floor.area.joistMemberLength.resolved",
  joistLinearFeetTypeSupported: "floor.area.joistLinearFeet.type.supported",
  areaSquareFeetResolved: "floor.area.areaSquareFeet.resolved",
  boundingWallsResolved: "floor.area.boundingWalls.resolved",
  openingReferencesResolved: "floor.area.openings.resolved",
  structuralMemberReferencesResolved: "floor.area.structuralMembers.resolved",
} as const;

export type FloorFramingRuleId =
  (typeof FLOOR_FRAMING_RULE_IDS)[keyof typeof FLOOR_FRAMING_RULE_IDS];

export const FLOOR_QUANTITY_KEYS = {
  joists: "floor.joists",
  joistLinearFeet: "floor.joist-linear-feet",
} as const;

export const ROOF_FRAMING_RULE_IDS = {
  planeParentSystemResolved: "roof.plane.parentSystem.resolved",
  systemPlanesConsistent: "roof.system.planes.consistent",
  framingTypeResolved: "roof.system.assembly.framingType.resolved",
  framingTypeCommonRafterEligible:
    "roof.system.assembly.framingType.commonRafterEligible",
  memberSizeResolved: "roof.system.assembly.memberSize.resolved",
  memberSpacingResolved: "roof.system.assembly.memberSpacing.resolved",
  spanDirectionResolved: "roof.plane.spanDirection.resolved",
  rafterLayoutLengthResolved: "roof.plane.rafterLayoutLength.resolved",
  pitchResolved: "roof.plane.pitch.resolved",
  areaSquareFeetResolved: "roof.plane.areaSquareFeet.resolved",
  boundingWallsResolved: "roof.plane.boundingWalls.resolved",
  openingReferencesResolved: "roof.plane.openings.resolved",
  structuralMemberReferencesResolved: "roof.plane.structuralMembers.resolved",
} as const;

export type RoofFramingRuleId =
  (typeof ROOF_FRAMING_RULE_IDS)[keyof typeof ROOF_FRAMING_RULE_IDS];

export const ROOF_QUANTITY_KEYS = {
  commonRafters: "roof.common-rafters",
} as const;

export const SHEATHING_RULE_IDS = {
  areaParentSystemResolved: "sheathing.area.parentSystem.resolved",
  systemAreasConsistent: "sheathing.system.areas.consistent",
  applicationResolved: "sheathing.system.application.resolved",
  panelTypeResolved: "sheathing.system.panelType.resolved",
  thicknessResolved: "sheathing.system.thickness.resolved",
  areaSquareFeetResolved: "sheathing.area.areaSquareFeet.resolved",
  coveredObjectsResolved: "sheathing.area.coveredObjects.resolved",
  openingReferencesResolved: "sheathing.area.openings.resolved",
} as const;

export type SheathingRuleId =
  (typeof SHEATHING_RULE_IDS)[keyof typeof SHEATHING_RULE_IDS];

export const SHEATHING_QUANTITY_KEYS = {
  area: "sheathing.area",
  material: "sheathing.material",
} as const;

export const BLOCKING_RULE_IDS = {
  typeResolved: "blocking.type.resolved",
  structuralRoleResolved: "blocking.structuralRole.resolved",
  materialResolved: "blocking.material.resolved",
  sizeResolved: "blocking.size.resolved",
  locationResolved: "blocking.location.resolved",
  associatedObjectsResolved: "blocking.associatedObjects.resolved",
} as const;

export type BlockingRuleId =
  (typeof BLOCKING_RULE_IDS)[keyof typeof BLOCKING_RULE_IDS];

export const BLOCKING_QUANTITY_KEYS = {
  quantity: "blocking.quantity",
  material: "blocking.material",
} as const;

export const CONNECTORS_HARDWARE_RULE_IDS = {
  connectorTypeResolved: "connector.type.resolved",
  connectorAssociatedObjectsResolved: "connector.associatedObjects.resolved",
  connectorHardwareResolved: "connector.hardware.resolved",
  connectorFastenersResolved: "connector.fasteners.resolved",
  hardwareTypeResolved: "hardware.type.resolved",
  hardwareAssociatedObjectsResolved: "hardware.associatedObjects.resolved",
  fastenerTypeResolved: "fastener.type.resolved",
  fastenerAssociatedObjectsResolved: "fastener.associatedObjects.resolved",
} as const;

export type ConnectorsHardwareRuleId =
  (typeof CONNECTORS_HARDWARE_RULE_IDS)[keyof typeof CONNECTORS_HARDWARE_RULE_IDS];

export const CONNECTORS_HARDWARE_QUANTITY_KEYS = {
  connectorMaterial: "connector.material",
  hardwareMaterial: "hardware.material",
  fastenerMaterial: "fastener.material",
} as const;

export const ASSUMPTION_RULE_IDS = {
  policyForbidden: "assumption.policy.forbidden",
  reviewRequired: "assumption.review.required",
  approvalRequired: "assumption.approval.required",
  sourceConsistent: "assumption.source.consistent",
  materialImpactResolved: "assumption.materialImpact.resolved",
  reviewTraceable: "assumption.review.traceable",
  targetConflict: "assumption.target.conflict",
} as const;

export type AssumptionRuleId =
  (typeof ASSUMPTION_RULE_IDS)[keyof typeof ASSUMPTION_RULE_IDS];

/**
 * Snapshot-integrity rules for the Framing Scope coordinator container.
 *
 * These rules check ID resolution and artifact-slot coherence. They do not
 * evaluate construction completeness or confidence scores.
 */
export const FRAMING_SCOPE_RULE_IDS = {
  validationIssuesResolved: "framingScope.validationIssues.resolved",
  validationResultsResolved: "framingScope.validationResults.resolved",
  reviewItemsResolved: "framingScope.reviewItems.resolved",
  validationArtifactReferenced: "framingScope.validation.artifact.referenced",
  confidenceEvaluationsResolved: "framingScope.confidenceEvaluations.resolved",
  confidenceArtifactReferenced: "framingScope.confidence.artifact.referenced",
} as const;

export type FramingScopeRuleId =
  (typeof FRAMING_SCOPE_RULE_IDS)[keyof typeof FRAMING_SCOPE_RULE_IDS];
