/**
 * B2.2M.2 diagnostic: material dependency graph + counterfactual unlock potential.
 * Does NOT inject fake values into production — only dependency_satisfied simulation.
 */

export type AssemblyPropertyStatus =
  | "RESOLVED"
  | "PARTIALLY_RESOLVED"
  | "UNRESOLVED"
  | "NO_PRODUCER"
  | "PRODUCER_EXISTS_BUT_NOT_WIRED"
  | "NOT_CURRENTLY_REQUIRED_BY_CALCULATOR";

export type MaterialDependencyNode = {
  materialOutput: string;
  calculator: string;
  quantityKeys: string[];
  requiredInputs: Array<{
    propertyPath: string;
    status: AssemblyPropertyStatus;
    notes: string;
  }>;
  becksteadUnlockableAlone: boolean;
};

export type CounterfactualScenario = {
  id: string;
  label: string;
  assumptions: Record<string, "dependency_satisfied" | number | string>;
  segmentsCalculableStuds: number;
  segmentsCalculablePlates: number;
  materialCategoriesUnlocked: string[];
  calculatorsExecutable: string[];
  aloneProducesCustomerQuantity: boolean;
  remainingBlockers: string[];
  notes: string;
};

export type BecksteadBaselineSnapshot = {
  segmentsWithLength: number;
  segmentsCalculableStuds: number;
  segmentsCalculablePlates: number;
  wallCount: number;
  openingCount: number;
  wallsWithShearClass: number;
  wallsWithSemanticTypeKey: number;
  materialLineItems: number;
  definitionEvidenceCount: number;
  dictionaryBindingEvidenceCount: number;
};

export const BECKSTEAD_M1_BASELINE: BecksteadBaselineSnapshot = {
  segmentsWithLength: 5,
  segmentsCalculableStuds: 0,
  segmentsCalculablePlates: 0,
  wallCount: 7,
  openingCount: 0,
  wallsWithShearClass: 1,
  wallsWithSemanticTypeKey: 0,
  materialLineItems: 0,
  definitionEvidenceCount: 4,
  dictionaryBindingEvidenceCount: 2,
};

export function buildMaterialDependencyGraph(
  baseline: BecksteadBaselineSnapshot = BECKSTEAD_M1_BASELINE,
): MaterialDependencyNode[] {
  const lengthStatus: AssemblyPropertyStatus =
    baseline.segmentsWithLength > 0 ? "RESOLVED" : "UNRESOLVED";

  return [
    {
      materialOutput: "wall.studs",
      calculator: "calculateSegmentStuds",
      quantityKeys: ["wall.studs"],
      requiredInputs: [
        {
          propertyPath: "segment.lengthFeet",
          status: lengthStatus,
          notes: `${baseline.segmentsWithLength} segments with length`,
        },
        {
          propertyPath: "wall.assembly.studSize",
          status: "NO_PRODUCER",
          notes: "No deterministic Evidence producer in mode A; Claude extraction exists but unwired in A",
        },
        {
          propertyPath: "wall.assembly.studSpacingInches",
          status: "NO_PRODUCER",
          notes: "Same as studSize",
        },
      ],
      becksteadUnlockableAlone: false,
    },
    {
      materialOutput: "wall.plates",
      calculator: "calculateSegmentPlates",
      quantityKeys: ["wall.plates"],
      requiredInputs: [
        {
          propertyPath: "segment.lengthFeet",
          status: lengthStatus,
          notes: `${baseline.segmentsWithLength} segments with length`,
        },
        {
          propertyPath: "wall.assembly.plateCount",
          status: "NO_PRODUCER",
          notes: "Brain forbids guessing plateCount without allowed assumption path",
        },
      ],
      becksteadUnlockableAlone: false,
    },
    {
      materialOutput: "opening.king-studs / jack-studs / cripples / rough-sill",
      calculator: "calculateOpeningFraming",
      quantityKeys: [
        "opening.king-studs",
        "opening.jack-studs",
        "opening.cripples-above",
        "opening.cripples-below",
        "opening.rough-sill",
      ],
      requiredInputs: [
        {
          propertyPath: "opening subjects",
          status: "NO_PRODUCER",
          notes: "Compiler opening detection missing; Claude only",
        },
        {
          propertyPath: "wall.assembly.studSize",
          status: "NO_PRODUCER",
          notes: "Prerequisite for opening framing",
        },
        {
          propertyPath: "wall.assembly.heightFeet",
          status: "NO_PRODUCER",
          notes: "Required by isOpeningEligibleForWallFraming",
        },
        {
          propertyPath: "wall wood-stud eligibility",
          status: "PARTIALLY_RESOLVED",
          notes: "O4 wallType=shear-wall fails isWoodStudWallType without assembly.material",
        },
      ],
      becksteadUnlockableAlone: false,
    },
    {
      materialOutput: "member.material (headers)",
      calculator: "calculateStructuralMembers",
      quantityKeys: ["member.material", "member.length"],
      requiredInputs: [
        {
          propertyPath: "structural-member subjects",
          status: "NO_PRODUCER",
          notes: "0 structural members on Beckstead mode A",
        },
      ],
      becksteadUnlockableAlone: false,
    },
    {
      materialOutput: "sheathing.area / sheathing.material",
      calculator: "calculateSheathing",
      quantityKeys: ["sheathing.area", "sheathing.material"],
      requiredInputs: [
        {
          propertyPath: "sheathing-system / sheathing-area",
          status: "PRODUCER_EXISTS_BUT_NOT_WIRED",
          notes: "SW4 schedule emits assembly.sheathingType on definition cluster; not sheathing-system objects",
        },
      ],
      becksteadUnlockableAlone: false,
    },
    {
      materialOutput: "floor.joists",
      calculator: "calculateFloorFraming",
      quantityKeys: ["floor.joists", "floor.joist-linear-feet"],
      requiredInputs: [
        {
          propertyPath: "floor-framing-system",
          status: "NO_PRODUCER",
          notes: "No floor evidence",
        },
      ],
      becksteadUnlockableAlone: false,
    },
    {
      materialOutput: "roof.common-rafters",
      calculator: "calculateRoofFraming",
      quantityKeys: ["roof.common-rafters"],
      requiredInputs: [
        {
          propertyPath: "roof-framing-system",
          status: "NO_PRODUCER",
          notes: "No roof evidence",
        },
      ],
      becksteadUnlockableAlone: false,
    },
  ];
}

export function buildCounterfactualUnlocks(
  baseline: BecksteadBaselineSnapshot = BECKSTEAD_M1_BASELINE,
): CounterfactualScenario[] {
  const n = baseline.segmentsWithLength;

  return [
    {
      id: "openings_perfect",
      label: "If openings were magically perfect",
      assumptions: { openingCount: "dependency_satisfied" },
      segmentsCalculableStuds: 0,
      segmentsCalculablePlates: 0,
      materialCategoriesUnlocked: [],
      calculatorsExecutable: [],
      aloneProducesCustomerQuantity: false,
      remainingBlockers: [
        "assembly.studSize",
        "assembly.studSpacingInches",
        "assembly.plateCount",
        "assembly.heightFeet",
        "wood-stud eligibility for shear-class walls",
      ],
      notes:
        "Opening resolver subjects alone do not unlock calculateWallFraming or opening framing without wall assembly.",
    },
    {
      id: "wall_assembly_basics_perfect",
      label: "If stud size/spacing/plateCount were magically perfect",
      assumptions: {
        "assembly.studSize": "dependency_satisfied",
        "assembly.studSpacingInches": "dependency_satisfied",
        "assembly.plateCount": "dependency_satisfied",
      },
      segmentsCalculableStuds: n,
      segmentsCalculablePlates: n,
      materialCategoriesUnlocked: ["lumber"],
      calculatorsExecutable: ["calculateWallFraming"],
      aloneProducesCustomerQuantity: true,
      remainingBlockers: [
        "openings still 0",
        "headers still 0",
        "sheathing subsystem still 0",
        "heightFeet still blocks opening framing",
      ],
      notes:
        `calculateWallFraming can emit studs+plates on ${n} segments with length. No opening dependency. Shear-wall safety: real implementation must not invent values for isShearOrBraced walls.`,
    },
    {
      id: "subtype_sw4_on_o4",
      label: "If subtype SW4 bound to O4 run",
      assumptions: { semanticTypeKey: "SW4" },
      segmentsCalculableStuds: 0,
      segmentsCalculablePlates: 0,
      materialCategoriesUnlocked: [],
      calculatorsExecutable: [],
      aloneProducesCustomerQuantity: false,
      remainingBlockers: [
        "SW4 schedule has no studSize/spacing/plateCount/height",
        "assembly.sheathingType path mismatch vs resolver",
      ],
      notes:
        "Inheritance would only pull sheathingType/nailing/holdown — none feed calculateWallFraming.",
    },
    {
      id: "assembly_plus_openings",
      label: "If wall assembly AND openings were perfect",
      assumptions: {
        "assembly.studSize": "dependency_satisfied",
        "assembly.studSpacingInches": "dependency_satisfied",
        "assembly.plateCount": "dependency_satisfied",
        "assembly.heightFeet": "dependency_satisfied",
        openingCount: "dependency_satisfied",
        woodStudEligible: "dependency_satisfied",
      },
      segmentsCalculableStuds: n,
      segmentsCalculablePlates: n,
      materialCategoriesUnlocked: ["lumber"],
      calculatorsExecutable: ["calculateWallFraming", "calculateOpeningFraming"],
      aloneProducesCustomerQuantity: true,
      remainingBlockers: ["headers", "sheathing systems", "floor", "roof"],
      notes: "Shows openings are a secondary unlock after assembly — not the first bottleneck.",
    },
  ];
}

export type BlockerComparisonRow = {
  candidateId: string;
  label: string;
  aloneProducesCustomerQuantity: boolean;
  materialCategoriesUnlocked: number;
  segmentsCalculableStudsIfSolved: number;
  prerequisiteCentrality: "high" | "medium" | "low";
  governanceRisk: "high" | "medium" | "low";
  recommendation: "pursue" | "defer" | "reject";
  rationale: string;
};

export function buildBlockerComparison(
  counterfactuals: CounterfactualScenario[] = buildCounterfactualUnlocks(),
): BlockerComparisonRow[] {
  const byId = new Map(counterfactuals.map((c) => [c.id, c]));
  const assembly = byId.get("wall_assembly_basics_perfect")!;
  const openings = byId.get("openings_perfect")!;
  const subtype = byId.get("subtype_sw4_on_o4")!;

  return [
    {
      candidateId: "wall_assembly_basics",
      label: "Wall assembly basics (stud size, spacing, plate count)",
      aloneProducesCustomerQuantity: assembly.aloneProducesCustomerQuantity,
      materialCategoriesUnlocked: assembly.materialCategoriesUnlocked.length,
      segmentsCalculableStudsIfSolved: assembly.segmentsCalculableStuds,
      prerequisiteCentrality: "high",
      governanceRisk: "medium",
      recommendation: "pursue",
      rationale:
        "Only candidate that unlocks calculateWallFraming lumber with current Beckstead length evidence.",
    },
    {
      candidateId: "openings",
      label: "Opening locations / sizes",
      aloneProducesCustomerQuantity: openings.aloneProducesCustomerQuantity,
      materialCategoriesUnlocked: openings.materialCategoriesUnlocked.length,
      segmentsCalculableStudsIfSolved: openings.segmentsCalculableStuds,
      prerequisiteCentrality: "low",
      governanceRisk: "medium",
      recommendation: "defer",
      rationale:
        "Audit ranked #1 via static checklist order, not product impact. Alone yields 0 line items.",
    },
    {
      candidateId: "subtype_sw4_binding",
      label: "Semantic subtype binding SW4 → O4",
      aloneProducesCustomerQuantity: subtype.aloneProducesCustomerQuantity,
      materialCategoriesUnlocked: subtype.materialCategoriesUnlocked.length,
      segmentsCalculableStudsIfSolved: subtype.segmentsCalculableStuds,
      prerequisiteCentrality: "low",
      governanceRisk: "high",
      recommendation: "reject",
      rationale:
        "SW4 schedule lacks stud/spacing/plate props; class≠subtype governance intentional in M.1.",
    },
  ];
}

export function buildMaterialUnlockAnalysisPayload(
  baseline: BecksteadBaselineSnapshot = BECKSTEAD_M1_BASELINE,
) {
  const dependencyGraph = buildMaterialDependencyGraph(baseline);
  const counterfactuals = buildCounterfactualUnlocks(baseline);
  const blockerComparison = buildBlockerComparison(counterfactuals);
  const winner = blockerComparison.find((r) => r.recommendation === "pursue");

  return {
    generatedAt: new Date().toISOString(),
    baselineLabel: "B2.2M.1 Beckstead RUN A (max-pages=4)",
    baseline,
    dependencyGraph,
    counterfactuals,
    blockerComparison,
    recommendedWinner: winner?.candidateId ?? null,
    rankingNote:
      "Prior audit top blocker (openings) was first-match static order, not dependency-aware product impact.",
  };
}
