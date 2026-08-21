/**
 * Realistic synthetic multi-page residential framing plan (Style A —
 * schedule / note-heavy). Uses construction notation rather than engine
 * property-name coaching.
 *
 * Intentional omissions (review / Run-2):
 * - Wall sheathing coverage SF not stated
 * - Door D04 has no explicit jack/trimmer count
 *
 * Cross-page association:
 * - Plan (p1) places HEADER H2 over WINDOW W3
 * - Opening schedule (p2) links W3 → H2 / W1
 * - Header schedule (p3) defines H2 material/size/length
 */

export type ExtractionFactClass =
  | "CORRECT"
  | "MISSING"
  | "CONFLICTED"
  | "UNEXPECTED"
  | "MISATTRIBUTED";

export interface ExpectedSemanticFact {
  /** Stable label for reports; not an Evidence id. */
  id: string;
  domain:
    | "wall"
    | "opening"
    | "structural-member"
    | "floor"
    | "roof"
    | "sheathing";
  /** Preferred plan subjectKey (exact mark). Alternate keys listed when Claude may normalize. */
  subjectKey: string;
  alternateSubjectKeys?: readonly string[];
  subjectKind?: string;
  propertyPath: string;
  expectedValue: string | number | boolean;
  /** How the fact appears in source (for documentation / grounding checks). */
  sourceHint: string;
}

export interface ForbiddenInvention {
  id: string;
  description: string;
  /** Returns true when Evidence invents this forbidden fact. */
  matches: (args: {
    subjectKey: string;
    propertyPath: string;
    candidateValue: string | number | boolean | null;
  }) => boolean;
}

/** Page 1 — Floor / wall framing plan */
export function realisticPlanPage1FloorWall(): readonly string[] {
  return [
    "SHEET A2.01  FLOOR FRAMING PLAN  LEVEL 2",
    'SCALE: 1/4" = 1\'-0"',
    "",
    "WALL SCHEDULE NOTES",
    "W1  EXT BEARING WALL  WOOD STUD",
    'W1  2x6 SPF STUDS @ 16" O.C.  HT 9\'-0"  DBL TOP PLATE + SILL  3 PLATES',
    "W1  LENGTH 24'-0\"",
    "",
    "OPENING CALLOUTS",
    "WINDOW W3 IN WALL W1  HEADER H2",
    "DOOR D04 IN WALL W1  HEADER H3",
    "",
    "FLOOR FRAMING",
    "FLOOR SYS A  LEVEL 2  NEW",
    '11-7/8" I-JOISTS @ 16" O.C.',
    "SPAN N-S",
    "BAY A  REF FLOOR SYS A",
    "BAY A = 20'-0\" E-W",
    "JOISTS 12'-0\" LONG",
  ];
}

/** Page 2 — Opening schedule */
export function realisticPlanPage2OpeningSchedule(): readonly string[] {
  return [
    "SHEET A3.01  WINDOW / DOOR SCHEDULE",
    "",
    "MARK  TYPE    NOMINAL           ROUGH OPENING     QTY  WALL  HEADER  NOTES",
    "W3    WINDOW  3'-6\" x 5'-0\"     4'-0\" x 5'-0\"      1    W1    H2      2 JACK STUDS",
    "D04   DOOR    2'-8\" x 6'-8\"     3'-0\" x 7'-0\"      1    W1    H3      -",
  ];
}

/** Page 3 — Structural / framing notes + sheathing (SF omitted) */
export function realisticPlanPage3StructuralNotes(): readonly string[] {
  return [
    "SHEET S1.01  FRAMING NOTES / MEMBER SCHEDULES",
    "",
    "HEADER SCHEDULE",
    "MARK  SIZE / MATERIAL           LENGTH  QTY  LOCATION",
    "H2    1-3/4 x 11-7/8 LVL         6'-0\"   1    WINDOW W3",
    "H3    (2) 2x6 DF                 4'-0\"   1    DOOR D04",
    "",
    "BEAM SCHEDULE",
    "MARK  SIZE   LENGTH   QTY  NOTES",
    "B1    W8x18  16'-0\"   1    LEVEL 2 BEARING BEAM",
    "",
    "WALL SHEATHING",
    '7/16" OSB WALL SHEATHING',
    "WALL SH SYS  EXTERIOR WALLS  LEVEL 2",
    "WALL SH A  REF WALL SH SYS  COVER W1",
  ];
}

/** Page 4 — Roof framing plan */
export function realisticPlanPage4Roof(): readonly string[] {
  return [
    "SHEET A2.02  ROOF FRAMING PLAN",
    "",
    "ROOF SYS A  STICK FRAMED  NEW",
    '2x8 DF RAFTERS @ 16" O.C.',
    "RAFTERS SPAN N-S",
    "GABLE A  REF ROOF SYS A",
    "GABLE LENGTH 20'-0\"",
  ];
}

export function realisticResidentialFramingPlanPages(): readonly (readonly string[])[] {
  return [
    realisticPlanPage1FloorWall(),
    realisticPlanPage2OpeningSchedule(),
    realisticPlanPage3StructuralNotes(),
    realisticPlanPage4Roof(),
  ];
}

export const REALISTIC_RESIDENTIAL_FRAMING_PLAN_TEXT =
  realisticResidentialFramingPlanPages()
    .map((page) => page.join("\n"))
    .join("\n\n");

/**
 * Style B — compact framing-plan callout wording for the same underlying facts.
 * Same omissions (no sheathing SF; no D04 jack count). Not required for the
 * primary live suite; available for wording-survival checks.
 */
export function realisticPlanStyleBCompactPages(): readonly (readonly string[])[] {
  return [
    [
      "A2.01 FRAMING PLAN",
      "W1 EXT BRG 2x6@16 O.C. HT9' 3PLT L=24'",
      "W3 WIN @W1 /H2   D04 DR @W1 /H3",
      "FLR SYS A  11-7/8 IJ @16 O.C. SPAN N-S",
      "BAY A->SYS A  BAY A 20' E-W  JSTS 12' LG",
    ],
    [
      "A3.01 OPENING SCH",
      "W3 WIN NOM 3'-6\"x5' RO 4'x5' Q1 W1 H2 2J",
      "D04 DR NOM 2'-8\"x6'-8\" RO 3'x7' Q1 W1 H3",
    ],
    [
      "S1.01 MEMBERS",
      "H2 1-3/4x11-7/8 LVL 6' Q1 @W3",
      "H3 (2)2x6 DF 4' Q1 @D04",
      "B1 W8x18 16' Q1 L2 BRG BM",
      'WALL SH 7/16" OSB  SYS->WALL SH SYS  AREA WALL SH A /W1',
    ],
    [
      "A2.02 ROOF",
      "ROOF SYS A STICK  2x8@16 O.C. SPAN N-S",
      "GABLE A->SYS A  GABLE LEN 20'",
    ],
  ];
}

/** Expected semantic facts Claude should extract from Style A. */
export const REALISTIC_PLAN_EXPECTED_FACTS: readonly ExpectedSemanticFact[] = [
  {
    id: "wall-w1-type",
    domain: "wall",
    subjectKey: "W1",
    propertyPath: "wallType",
    expectedValue: "wood stud",
    sourceHint: "WOOD STUD / EXT BEARING WALL",
  },
  {
    id: "wall-w1-bearing",
    domain: "wall",
    subjectKey: "W1",
    propertyPath: "bearingStatus",
    expectedValue: "bearing",
    sourceHint: "EXT BEARING",
  },
  {
    id: "wall-w1-stud-size",
    domain: "wall",
    subjectKey: "W1",
    propertyPath: "assembly.studSize",
    expectedValue: "2x6",
    sourceHint: '2x6 SPF STUDS @ 16" O.C.',
  },
  {
    id: "wall-w1-spacing",
    domain: "wall",
    subjectKey: "W1",
    propertyPath: "assembly.studSpacingInches",
    expectedValue: 16,
    sourceHint: '16" O.C.',
  },
  {
    id: "wall-w1-height",
    domain: "wall",
    subjectKey: "W1",
    propertyPath: "assembly.heightFeet",
    expectedValue: 9,
    sourceHint: "HT 9'-0\"",
  },
  {
    id: "wall-w1-plates",
    domain: "wall",
    subjectKey: "W1",
    propertyPath: "assembly.plateCount",
    expectedValue: 3,
    sourceHint: "3 PLATES",
  },
  {
    id: "wall-w1-length",
    domain: "wall",
    subjectKey: "W1",
    propertyPath: "lengthFeet",
    expectedValue: 24,
    sourceHint: "LENGTH 24'-0\"",
  },
  {
    id: "opening-w3-category",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "category",
    expectedValue: "window",
    sourceHint: "WINDOW W3",
  },
  {
    id: "opening-w3-rough-w",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "dimensions.roughWidthFeet",
    expectedValue: 4,
    sourceHint: "ROUGH 4'-0\" x 5'-0\"",
  },
  {
    id: "opening-w3-rough-h",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "dimensions.roughHeightFeet",
    expectedValue: 5,
    sourceHint: "ROUGH 4'-0\" x 5'-0\"",
  },
  {
    id: "opening-w3-nominal-w",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "dimensions.nominalWidthFeet",
    expectedValue: 3.5,
    sourceHint: "NOMINAL 3'-6\" x 5'-0\"",
  },
  {
    id: "opening-w3-nominal-h",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "dimensions.nominalHeightFeet",
    expectedValue: 5,
    sourceHint: "NOMINAL 3'-6\" x 5'-0\"",
  },
  {
    id: "opening-w3-qty",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "quantity",
    expectedValue: 1,
    sourceHint: "QTY 1",
  },
  {
    id: "opening-w3-wall",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "parentWallTag",
    expectedValue: "W1",
    sourceHint: "IN WALL W1 / schedule WALL W1",
  },
  {
    id: "opening-w3-header",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "headerMemberTag",
    expectedValue: "H2",
    sourceHint: "HEADER H2",
  },
  {
    id: "opening-w3-jacks",
    domain: "opening",
    subjectKey: "W3",
    propertyPath: "jackStudCount",
    expectedValue: 2,
    sourceHint: "2 JACK STUDS",
  },
  {
    id: "opening-d04-category",
    domain: "opening",
    subjectKey: "D04",
    propertyPath: "category",
    expectedValue: "door",
    sourceHint: "DOOR D04",
  },
  {
    id: "opening-d04-rough-w",
    domain: "opening",
    subjectKey: "D04",
    propertyPath: "dimensions.roughWidthFeet",
    expectedValue: 3,
    sourceHint: "3'-0\" x 7'-0\"",
  },
  {
    id: "opening-d04-rough-h",
    domain: "opening",
    subjectKey: "D04",
    propertyPath: "dimensions.roughHeightFeet",
    expectedValue: 7,
    sourceHint: "3'-0\" x 7'-0\"",
  },
  {
    id: "opening-d04-wall",
    domain: "opening",
    subjectKey: "D04",
    propertyPath: "parentWallTag",
    expectedValue: "W1",
    sourceHint: "WALL W1",
  },
  {
    id: "opening-d04-header",
    domain: "opening",
    subjectKey: "D04",
    propertyPath: "headerMemberTag",
    expectedValue: "H3",
    sourceHint: "HEADER H3",
  },
  {
    id: "sm-h2-category",
    domain: "structural-member",
    subjectKey: "H2",
    propertyPath: "category",
    expectedValue: "header",
    sourceHint: "HEADER SCHEDULE H2",
  },
  {
    id: "sm-h2-material",
    domain: "structural-member",
    subjectKey: "H2",
    propertyPath: "materialType",
    expectedValue: "lvl",
    sourceHint: "LVL",
  },
  {
    id: "sm-h2-size",
    domain: "structural-member",
    subjectKey: "H2",
    propertyPath: "size",
    expectedValue: "1-3/4 x 11-7/8",
    sourceHint: "1-3/4 x 11-7/8 LVL",
  },
  {
    id: "sm-h2-length",
    domain: "structural-member",
    subjectKey: "H2",
    propertyPath: "lengthFeet",
    expectedValue: 6,
    sourceHint: "6'-0\"",
  },
  {
    id: "sm-h2-qty",
    domain: "structural-member",
    subjectKey: "H2",
    propertyPath: "quantity",
    expectedValue: 1,
    sourceHint: "QTY 1",
  },
  {
    id: "sm-h2-opening",
    domain: "structural-member",
    subjectKey: "H2",
    propertyPath: "supportedOpeningTag",
    expectedValue: "W3",
    sourceHint: "WINDOW W3 / LOCATION WINDOW W3",
  },
  {
    id: "sm-b1-category",
    domain: "structural-member",
    subjectKey: "B1",
    propertyPath: "category",
    expectedValue: "beam",
    sourceHint: "BEAM SCHEDULE B1",
  },
  {
    id: "sm-b1-length",
    domain: "structural-member",
    subjectKey: "B1",
    propertyPath: "lengthFeet",
    expectedValue: 16,
    sourceHint: "16'-0\"",
  },
  {
    id: "floor-sys-joist-type",
    domain: "floor",
    subjectKey: "FLOOR SYS A",
    alternateSubjectKeys: ["FLOOR-SYS-A", "Floor Sys A"],
    propertyPath: "assembly.joistType",
    expectedValue: "i-joist",
    sourceHint: "I-JOISTS",
  },
  {
    id: "floor-sys-size",
    domain: "floor",
    subjectKey: "FLOOR SYS A",
    alternateSubjectKeys: ["FLOOR-SYS-A"],
    propertyPath: "assembly.joistSize",
    expectedValue: '11-7/8"',
    sourceHint: '11-7/8" I-JOISTS',
  },
  {
    id: "floor-sys-spacing",
    domain: "floor",
    subjectKey: "FLOOR SYS A",
    alternateSubjectKeys: ["FLOOR-SYS-A"],
    propertyPath: "assembly.joistSpacingInches",
    expectedValue: 16,
    sourceHint: '16" O.C.',
  },
  {
    id: "floor-bay-parent",
    domain: "floor",
    subjectKey: "BAY A",
    alternateSubjectKeys: ["BAY-A"],
    propertyPath: "parentSystemTag",
    expectedValue: "FLOOR SYS A",
    sourceHint: "REF FLOOR SYS A",
  },
  {
    id: "floor-bay-span",
    domain: "floor",
    subjectKey: "BAY A",
    alternateSubjectKeys: ["BAY-A"],
    propertyPath: "spanDirection",
    expectedValue: "north-south",
    sourceHint: "SPAN N-S",
  },
  {
    id: "floor-bay-layout",
    domain: "floor",
    subjectKey: "BAY A",
    alternateSubjectKeys: ["BAY-A"],
    propertyPath: "joistLayoutLengthFeet",
    expectedValue: 20,
    sourceHint: "BAY A = 20'-0\" E-W with SPAN N-S",
  },
  {
    id: "floor-bay-member",
    domain: "floor",
    subjectKey: "BAY A",
    alternateSubjectKeys: ["BAY-A"],
    propertyPath: "joistMemberLengthFeet",
    expectedValue: 12,
    sourceHint: "JOISTS 12'-0\" LONG",
  },
  {
    id: "roof-sys-type",
    domain: "roof",
    subjectKey: "ROOF SYS A",
    alternateSubjectKeys: ["ROOF-SYS-A"],
    propertyPath: "assembly.framingType",
    expectedValue: "stick",
    sourceHint: "STICK FRAMED",
  },
  {
    id: "roof-sys-size",
    domain: "roof",
    subjectKey: "ROOF SYS A",
    alternateSubjectKeys: ["ROOF-SYS-A"],
    propertyPath: "assembly.memberSize",
    expectedValue: "2x8",
    sourceHint: "2x8 DF RAFTERS",
  },
  {
    id: "roof-sys-spacing",
    domain: "roof",
    subjectKey: "ROOF SYS A",
    alternateSubjectKeys: ["ROOF-SYS-A"],
    propertyPath: "assembly.memberSpacingInches",
    expectedValue: 16,
    sourceHint: '16" O.C.',
  },
  {
    id: "roof-gable-parent",
    domain: "roof",
    subjectKey: "GABLE A",
    alternateSubjectKeys: ["GABLE-A"],
    propertyPath: "parentSystemTag",
    expectedValue: "ROOF SYS A",
    sourceHint: "REF ROOF SYS A",
  },
  {
    id: "roof-gable-span",
    domain: "roof",
    subjectKey: "GABLE A",
    alternateSubjectKeys: ["GABLE-A"],
    propertyPath: "spanDirection",
    expectedValue: "north-south",
    sourceHint: "RAFTERS SPAN N-S",
  },
  {
    id: "roof-gable-layout",
    domain: "roof",
    subjectKey: "GABLE A",
    alternateSubjectKeys: ["GABLE-A"],
    propertyPath: "rafterLayoutLengthFeet",
    expectedValue: 20,
    sourceHint: "GABLE LENGTH 20'-0\" with RAFTERS SPAN N-S",
  },
  {
    id: "sheathing-sys-application",
    domain: "sheathing",
    subjectKey: "WALL SH SYS",
    alternateSubjectKeys: ["WALL-SH-SYS"],
    propertyPath: "application",
    expectedValue: "wall",
    sourceHint: "WALL SHEATHING / EXTERIOR WALLS",
  },
  {
    id: "sheathing-sys-panel",
    domain: "sheathing",
    subjectKey: "WALL SH SYS",
    alternateSubjectKeys: ["WALL-SH-SYS"],
    propertyPath: "panelSpecification.panelType",
    expectedValue: "osb",
    sourceHint: "OSB WALL SHEATHING",
  },
  {
    id: "sheathing-sys-thick",
    domain: "sheathing",
    subjectKey: "WALL SH SYS",
    alternateSubjectKeys: ["WALL-SH-SYS"],
    propertyPath: "panelSpecification.thickness",
    expectedValue: '7/16"',
    sourceHint: '7/16" OSB',
  },
  {
    id: "sheathing-area-parent",
    domain: "sheathing",
    subjectKey: "WALL SH A",
    alternateSubjectKeys: ["WALL-SH-A"],
    propertyPath: "parentSystemTag",
    expectedValue: "WALL SH SYS",
    sourceHint: "REF WALL SH SYS",
  },
  {
    id: "sheathing-area-wall",
    domain: "sheathing",
    subjectKey: "WALL SH A",
    alternateSubjectKeys: ["WALL-SH-A"],
    propertyPath: "coveredWallTag",
    expectedValue: "W1",
    sourceHint: "COVER W1",
  },
];

/** Facts that must remain absent (hallucination audit). */
export const REALISTIC_PLAN_FORBIDDEN_INVENTIONS: readonly ForbiddenInvention[] =
  [
    {
      id: "no-d04-jacks",
      description: "Door D04 must not invent jackStudCount",
      matches: ({ subjectKey, propertyPath }) =>
        subjectKey.replace(/\s+/g, "").toUpperCase().includes("D04") &&
        propertyPath === "jackStudCount",
    },
    {
      id: "no-sheathing-sf",
      description: "Sheathing area SF must not be invented",
      matches: ({ propertyPath, subjectKey }) => {
        const key = subjectKey.toUpperCase();
        return (
          propertyPath === "areaSquareFeet" &&
          (key.includes("SH") || key.includes("SHEATH") || key.includes("WALL SH"))
        );
      },
    },
    {
      id: "no-rafter-member-length",
      description: "No rafter member length property",
      matches: ({ propertyPath }) =>
        propertyPath === "rafterMemberLengthFeet" ||
        propertyPath === "memberLengthFeet",
    },
    {
      id: "no-king-invention",
      description: "No kingStudCount unless source states kings (source does not)",
      matches: ({ propertyPath }) => propertyPath === "kingStudCount",
    },
    {
      id: "no-hip-valley-jack-roof",
      description: "No hip/valley/jack rafter categories invented",
      matches: ({ propertyPath, candidateValue }) => {
        if (propertyPath !== "category") {
          return false;
        }
        const value = String(candidateValue ?? "").toLowerCase();
        return (
          value.includes("hip") ||
          value.includes("valley") ||
          value.includes("jack rafter")
        );
      },
    },
  ];
