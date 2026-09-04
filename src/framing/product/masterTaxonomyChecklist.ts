/**
 * Minimal Master Taxonomy checklist for product accounting.
 * Vocabulary mirrors docs/product/RESIDENTIAL_FRAMING_MATERIALS_MASTER_TAXONOMY.pdf.
 * Used only by buildProductAccounting — calculators must not import this.
 */

export type MaterialMatchRule = {
  quantityKeyPrefixes?: string[];
  quantityKeys?: string[];
  canonicalClassificationPrefixes?: string[];
  categories?: string[];
  /** Match when description/material contains all of these (lowercase). */
  materialIncludes?: string[];
};

/**
 * How to detect that THIS house has established relevant construction.
 * Empty domainSignals ⇒ never fires ⇒ unmatched stays applicability_unestablished.
 */
export type DomainSignalRule =
  | { kind: "has_walls" }
  | { kind: "has_exterior_walls" }
  | { kind: "has_interior_walls" }
  | { kind: "has_openings" }
  | { kind: "has_floor_systems" }
  | { kind: "has_floor_joist_areas" }
  | { kind: "has_rim_board_signal" }
  | { kind: "has_roof_systems" }
  | { kind: "has_roof_stick" }
  | { kind: "has_roof_truss" }
  | { kind: "has_sheathing" }
  | { kind: "has_sheathing_application"; application: string }
  | {
      kind: "has_structural_category";
      categories: string[];
    }
  | {
      kind: "has_structural_material";
      materials: string[];
    };

/**
 * After domain presence: how to distinguish read_or_input_gap vs calculator_gap.
 * `no_emitter` = presence established but no wired calculator path for this signal.
 */
export type InputGapProbe =
  | "wall_studs"
  | "wall_plates"
  | "opening_framing"
  | "floor_joists"
  | "roof_common_rafters"
  | "sheathing"
  | "structural_members"
  | "no_emitter";

export type MasterTaxonomyChecklistItem = {
  sectionId: string;
  sectionTitle: string;
  itemId: string;
  label: string;
  materialMatch: MaterialMatchRule;
  domainSignals: DomainSignalRule[];
  inputGapProbe?: InputGapProbe;
};

export type MasterTaxonomyChecklist = {
  schemaVersion: 1;
  source: "docs/product/RESIDENTIAL_FRAMING_MATERIALS_MASTER_TAXONOMY.pdf";
  items: MasterTaxonomyChecklistItem[];
};

function item(
  sectionId: string,
  sectionTitle: string,
  itemId: string,
  label: string,
  materialMatch: MaterialMatchRule,
  domainSignals: DomainSignalRule[],
  inputGapProbe?: InputGapProbe,
): MasterTaxonomyChecklistItem {
  return {
    sectionId,
    sectionTitle,
    itemId,
    label,
    materialMatch,
    domainSignals,
    inputGapProbe,
  };
}

const FOUNDATION = "foundation-to-framing";
const FLOOR = "floor-system";
const EXT_WALLS = "exterior-walls";
const INT_WALLS = "interior-walls";
const TALL_WALLS = "tall-walls";
const STICK_ROOF = "stick-framed-roof";
const TRUSS_ROOF = "truss-roof";
const ROOF_SHEATHING = "roof-sheathing";
const BEAMS_POSTS = "beams-and-posts";
const STAIRS = "stairs";
const DECKS = "decks-porches";
const HARDWARE = "hardware-connectors";
const FASTENERS = "framing-fasteners";
const ADHESIVES = "adhesives-sealants";
const TEMP = "temporary-framing";

/**
 * Faithful checklist copy for accounting iteration.
 * Items without domainSignals never escalate beyond applicability_unestablished.
 */
export const MASTER_TAXONOMY_CHECKLIST: MasterTaxonomyChecklist = {
  schemaVersion: 1,
  source: "docs/product/RESIDENTIAL_FRAMING_MATERIALS_MASTER_TAXONOMY.pdf",
  items: [
    // Foundation-to-Framing — typically no domain bag yet
    item(FOUNDATION, "Foundation-to-Framing Connection", "pt-sill-plates", "Pressure-treated sill plates", {}, []),
    item(FOUNDATION, "Foundation-to-Framing Connection", "sill-sealer", "Sill sealer / gasket", {}, []),
    item(FOUNDATION, "Foundation-to-Framing Connection", "anchor-bolts", "Anchor bolts, nuts and washers or approved foundation anchors", {}, []),
    item(FOUNDATION, "Foundation-to-Framing Connection", "hold-downs-foundation", "Hold-downs", {}, []),
    item(FOUNDATION, "Foundation-to-Framing Connection", "straps-foundation", "Straps", {}, []),

    // Floor System
    item(
      FLOOR,
      "Floor System",
      "floor-joists",
      "Dimensional floor joists or I-joists",
      {
        quantityKeys: ["floor.joists", "floor.joist-linear-feet"],
        canonicalClassificationPrefixes: ["floor-joist-"],
      },
      [{ kind: "has_floor_joist_areas" }],
      "floor_joists",
    ),
    item(
      FLOOR,
      "Floor System",
      "lvl-beams-floor",
      "LVL beams",
      {
        categories: ["engineered-wood"],
        materialIncludes: ["lvl"],
        canonicalClassificationPrefixes: ["beam-lvl", "girder-lvl", "header-lvl"],
      },
      [{ kind: "has_structural_material", materials: ["lvl"] }],
      "structural_members",
    ),
    item(
      FLOOR,
      "Floor System",
      "glulam-beams-floor",
      "Glulam beams",
      {
        categories: ["engineered-wood"],
        materialIncludes: ["glulam"],
      },
      [{ kind: "has_structural_material", materials: ["glulam"] }],
      "structural_members",
    ),
    item(
      FLOOR,
      "Floor System",
      "psl-lsl-beams",
      "PSL / LSL beams where engineered",
      {
        categories: ["engineered-wood"],
        materialIncludes: ["psl"],
      },
      [{ kind: "has_structural_material", materials: ["psl", "lsl"] }],
      "structural_members",
    ),
    item(
      FLOOR,
      "Floor System",
      "bearing-posts",
      "Bearing posts / columns",
      {
        canonicalClassificationPrefixes: ["post-", "column-"],
      },
      [{ kind: "has_structural_category", categories: ["post", "column"] }],
      "structural_members",
    ),
    item(
      FLOOR,
      "Floor System",
      "rim-board",
      "Rim board / rim joists",
      {
        canonicalClassificationPrefixes: ["rim-board-"],
        materialIncludes: ["rim"],
      },
      [{ kind: "has_rim_board_signal" }],
      "no_emitter",
    ),
    item(FLOOR, "Floor System", "squash-blocks", "Squash blocks", {}, []),
    item(FLOOR, "Floor System", "web-stiffeners", "Web stiffeners", {}, []),
    item(FLOOR, "Floor System", "joist-blocking", "Joist blocking", {}, []),
    item(FLOOR, "Floor System", "joist-hangers", "Joist hangers", {}, []),
    item(
      FLOOR,
      "Floor System",
      "subfloor",
      "23/32 in. or 3/4 in. tongue-and-groove subfloor",
      {
        quantityKeys: ["sheathing.area"],
        canonicalClassificationPrefixes: ["floor-", "subfloor-"],
      },
      [{ kind: "has_sheathing_application", application: "floor" }],
      "sheathing",
    ),

    // Exterior Walls
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-bottom-plates",
      "Bottom plates",
      { quantityKeys: ["wall.plates"] },
      [{ kind: "has_exterior_walls" }],
      "wall_plates",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-standard-studs",
      "Standard studs",
      { quantityKeys: ["wall.studs"], canonicalClassificationPrefixes: ["stud-"] },
      [{ kind: "has_exterior_walls" }],
      "wall_studs",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-king-studs",
      "King studs",
      { quantityKeys: ["opening.king-studs"] },
      [{ kind: "has_openings" }],
      "opening_framing",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-jack-studs",
      "Jack / trimmer studs",
      { quantityKeys: ["opening.jack-studs"] },
      [{ kind: "has_openings" }],
      "opening_framing",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-cripple-studs",
      "Cripple studs",
      {
        quantityKeys: ["opening.cripples-above", "opening.cripples-below"],
      },
      [{ kind: "has_openings" }],
      "opening_framing",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-double-top-plates",
      "Double top plates",
      { quantityKeys: ["wall.plates"] },
      [{ kind: "has_exterior_walls" }],
      "wall_plates",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-window-sill",
      "Window sill material",
      { quantityKeys: ["opening.rough-sill"] },
      [{ kind: "has_openings" }],
      "opening_framing",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-headers",
      "Window and door headers",
      {
        canonicalClassificationPrefixes: ["header-"],
      },
      [{ kind: "has_structural_category", categories: ["header"] }],
      "structural_members",
    ),
    item(
      EXT_WALLS,
      "Exterior Walls",
      "ext-wall-sheathing",
      "Exterior wall sheathing - OSB, plywood or specified structural panels",
      {
        quantityKeys: ["sheathing.area"],
        canonicalClassificationPrefixes: ["wall-"],
      },
      [{ kind: "has_sheathing_application", application: "wall" }],
      "sheathing",
    ),
    item(EXT_WALLS, "Exterior Walls", "ext-corner-studs", "Corner studs / backing", {}, []),
    item(EXT_WALLS, "Exterior Walls", "ext-wall-blocking", "Wall blocking", {}, []),
    item(EXT_WALLS, "Exterior Walls", "ext-sheathing-nails", "Sheathing nails", {}, []),

    // Interior Walls
    item(
      INT_WALLS,
      "Interior Walls",
      "int-bottom-plates",
      "Bottom plates",
      { quantityKeys: ["wall.plates"] },
      [{ kind: "has_interior_walls" }],
      "wall_plates",
    ),
    item(
      INT_WALLS,
      "Interior Walls",
      "int-studs",
      "Studs",
      { quantityKeys: ["wall.studs"] },
      [{ kind: "has_interior_walls" }],
      "wall_studs",
    ),
    item(
      INT_WALLS,
      "Interior Walls",
      "int-double-top-plates",
      "Double top plates",
      { quantityKeys: ["wall.plates"] },
      [{ kind: "has_interior_walls" }],
      "wall_plates",
    ),
    item(
      INT_WALLS,
      "Interior Walls",
      "int-door-headers",
      "Door headers",
      { canonicalClassificationPrefixes: ["header-"] },
      [{ kind: "has_structural_category", categories: ["header"] }],
      "structural_members",
    ),
    item(
      INT_WALLS,
      "Interior Walls",
      "int-cripples",
      "Cripples",
      {
        quantityKeys: ["opening.cripples-above", "opening.cripples-below"],
      },
      [{ kind: "has_openings" }],
      "opening_framing",
    ),
    item(INT_WALLS, "Interior Walls", "int-backing", "Wall intersections / backing", {}, []),
    item(INT_WALLS, "Interior Walls", "int-fire-blocking", "Fire blocking", {}, []),

    // Tall Walls
    item(TALL_WALLS, "Tall Walls / Great Rooms", "tall-wall-studs", "Engineered or dimensional tall-wall studs", {}, []),
    item(TALL_WALLS, "Tall Walls / Great Rooms", "tall-wall-headers", "Large headers", {}, []),

    // Stick-Framed Roof
    item(
      STICK_ROOF,
      "Stick-Framed Roof",
      "rafters",
      "Rafters",
      {
        quantityKeys: ["roof.common-rafters"],
        canonicalClassificationPrefixes: ["common-rafter-", "rafter-"],
      },
      [{ kind: "has_roof_stick" }],
      "roof_common_rafters",
    ),
    item(STICK_ROOF, "Stick-Framed Roof", "ridge-boards", "Ridge boards", {}, []),
    item(STICK_ROOF, "Stick-Framed Roof", "ceiling-joists", "Ceiling joists", {}, []),
    item(STICK_ROOF, "Stick-Framed Roof", "hip-rafters", "Hip rafters", {}, []),
    item(STICK_ROOF, "Stick-Framed Roof", "valley-rafters", "Valley rafters", {}, []),
    item(STICK_ROOF, "Stick-Framed Roof", "jack-rafters", "Jack rafters", {}, []),
    item(STICK_ROOF, "Stick-Framed Roof", "subfascia", "Subfascia", {}, []),

    // Truss Roof
    item(
      TRUSS_ROOF,
      "Truss Roof",
      "common-trusses",
      "Common trusses",
      { categories: ["truss"], canonicalClassificationPrefixes: ["truss-"] },
      [{ kind: "has_roof_truss" }],
      "no_emitter",
    ),
    item(
      TRUSS_ROOF,
      "Truss Roof",
      "girder-trusses",
      "Girder trusses",
      { categories: ["truss"] },
      [{ kind: "has_roof_truss" }],
      "no_emitter",
    ),
    item(
      TRUSS_ROOF,
      "Truss Roof",
      "gable-end-trusses",
      "Gable-end trusses",
      { categories: ["truss"] },
      [{ kind: "has_roof_truss" }],
      "no_emitter",
    ),
    item(TRUSS_ROOF, "Truss Roof", "truss-bracing", "Truss bracing lumber", {}, []),
    item(TRUSS_ROOF, "Truss Roof", "truss-clips", "Truss clips / ties", {}, []),

    // Roof Sheathing
    item(
      ROOF_SHEATHING,
      "Roof Sheathing",
      "roof-sheathing-panels",
      "7/16 in., 1/2 in., 5/8 in. or specified OSB / plywood",
      {
        quantityKeys: ["sheathing.area"],
        canonicalClassificationPrefixes: ["roof-"],
      },
      [{ kind: "has_sheathing_application", application: "roof" }],
      "sheathing",
    ),
    item(ROOF_SHEATHING, "Roof Sheathing", "h-clips", "H-clips if required", {}, []),
    item(ROOF_SHEATHING, "Roof Sheathing", "roof-sheathing-nails", "Roof sheathing nails", {}, []),

    // Beams and Posts
    item(
      BEAMS_POSTS,
      "Beams and Posts",
      "lvl",
      "LVL",
      {
        categories: ["engineered-wood"],
        materialIncludes: ["lvl"],
      },
      [{ kind: "has_structural_material", materials: ["lvl"] }],
      "structural_members",
    ),
    item(
      BEAMS_POSTS,
      "Beams and Posts",
      "glulam",
      "Glulam",
      {
        categories: ["engineered-wood"],
        materialIncludes: ["glulam"],
      },
      [{ kind: "has_structural_material", materials: ["glulam"] }],
      "structural_members",
    ),
    item(
      BEAMS_POSTS,
      "Beams and Posts",
      "psl",
      "PSL",
      { materialIncludes: ["psl"] },
      [{ kind: "has_structural_material", materials: ["psl"] }],
      "structural_members",
    ),
    item(
      BEAMS_POSTS,
      "Beams and Posts",
      "lsl",
      "LSL",
      { materialIncludes: ["lsl"] },
      [{ kind: "has_structural_material", materials: ["lsl"] }],
      "structural_members",
    ),
    item(
      BEAMS_POSTS,
      "Beams and Posts",
      "built-up-beams",
      "Built-up dimensional beams",
      { canonicalClassificationPrefixes: ["built-up-member-"] },
      [{ kind: "has_structural_category", categories: ["built-up-member"] }],
      "structural_members",
    ),
    item(
      BEAMS_POSTS,
      "Beams and Posts",
      "wood-posts",
      "Wood posts",
      { canonicalClassificationPrefixes: ["post-"] },
      [{ kind: "has_structural_category", categories: ["post", "column"] }],
      "structural_members",
    ),
    item(BEAMS_POSTS, "Beams and Posts", "steel-beams", "Steel beams", {}, []),
    item(BEAMS_POSTS, "Beams and Posts", "post-bases", "Post bases", {}, []),
    item(BEAMS_POSTS, "Beams and Posts", "post-caps", "Post caps", {}, []),

    // Stairs / Decks / Hardware / Fasteners / Adhesives / Temporary — no domain yet
    item(STAIRS, "Stairs", "stringers", "Stringer lumber", {}, []),
    item(STAIRS, "Stairs", "landing-joists", "Landing joists", {}, []),
    item(DECKS, "Decks, Porches and Exterior Framed Areas", "deck-joists", "Joists", {}, []),
    item(DECKS, "Decks, Porches and Exterior Framed Areas", "deck-ledger", "Pressure-treated ledger", {}, []),
    item(HARDWARE, "Hardware / Connectors", "joist-hangers-hw", "Joist hangers", {}, []),
    item(HARDWARE, "Hardware / Connectors", "hurricane-ties", "Hurricane ties", {}, []),
    item(HARDWARE, "Hardware / Connectors", "hold-downs-hw", "Hold-downs", {}, []),
    item(HARDWARE, "Hardware / Connectors", "framing-angles", "Framing angles", {}, []),
    item(FASTENERS, "Framing Fasteners", "16d-nails", "16d framing nails", {}, []),
    item(FASTENERS, "Framing Fasteners", "sheathing-nails-fast", "Sheathing nails", {}, []),
    item(ADHESIVES, "Adhesives / Sealants", "subfloor-adhesive", "Subfloor adhesive", {}, []),
    item(TEMP, "Temporary Framing Materials", "bracing-lumber", "Bracing lumber", {}, []),
  ],
};
