import {
  evidenceSchema,
  type Evidence,
} from "../../../core/schemas/evidence.schema.js";

function floorSource(subjectKey: string) {
  return {
    page: {
      documentId: null,
      pageNumber: 1,
      sheetId: null,
      sheetTitle: null,
      pageLabel: null,
      revision: null,
    },
    region: null,
    elementLabel: subjectKey,
    detailNumber: null,
    sectionNumber: null,
    scheduleName: null,
    noteReference: null,
  };
}

function floorSystemEvidence(
  subjectKey: string,
  id: string,
  type: "note" | "dimension" | "schedule",
  description: string,
  propertyPath: string,
  candidateValue: string | number | boolean | null,
): Evidence {
  return evidenceSchema.parse({
    id,
    type,
    relationship: "supports",
    description,
    source: floorSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "floor-framing-system",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

function floorAreaEvidence(
  subjectKey: string,
  id: string,
  type: "note" | "dimension" | "schedule",
  description: string,
  propertyPath: string,
  candidateValue: string | number | boolean | null,
): Evidence {
  return evidenceSchema.parse({
    id,
    type,
    relationship: "supports",
    description,
    source: floorSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "floor-framing-area",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

function buildSystemEvidence(
  systemKey: string,
  prefix: string,
  assembly: {
    joistType: string;
    joistSize: string;
    joistSpacingInches: number;
  },
): Evidence[] {
  return [
    floorSystemEvidence(
      systemKey,
      `${prefix}-NAME`,
      "note",
      "Explicit floor framing system name.",
      "name",
      "Level 2 floor framing",
    ),
    floorSystemEvidence(
      systemKey,
      `${prefix}-LEVEL`,
      "note",
      "Explicit floor framing level.",
      "level",
      "Level 2",
    ),
    floorSystemEvidence(
      systemKey,
      `${prefix}-PHASE`,
      "note",
      "Explicit construction phase.",
      "constructionPhase",
      "new",
    ),
    floorSystemEvidence(
      systemKey,
      `${prefix}-TYPE`,
      "schedule",
      "Explicit joist type.",
      "assembly.joistType",
      assembly.joistType,
    ),
    floorSystemEvidence(
      systemKey,
      `${prefix}-SIZE`,
      "schedule",
      "Explicit joist size.",
      "assembly.joistSize",
      assembly.joistSize,
    ),
    floorSystemEvidence(
      systemKey,
      `${prefix}-SPACING`,
      "schedule",
      "Explicit joist spacing.",
      "assembly.joistSpacingInches",
      assembly.joistSpacingInches,
    ),
  ];
}

/**
 * Two independent Floor Framing Areas for the E2 joist count + LF slice:
 * - FFA-001: complete (20 ft @ 16" → 16 each; member 12 ft → 192 LF)
 * - FFA-002: count inputs complete; joistMemberLengthFeet missing (count yes / LF no)
 */
export function buildFloorFramingJoistCountEvidence(): Evidence[] {
  return [
    ...buildSystemEvidence("FFS-001", "E-FFS-001", {
      joistType: "i-joist",
      joistSize: "11-7/8",
      joistSpacingInches: 16,
    }),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-001-PARENT",
      "note",
      "Explicit parent floor system.",
      "parentSystemTag",
      "FFS-001",
    ),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-001-SPAN",
      "note",
      "Explicit span direction.",
      "spanDirection",
      "north-south",
    ),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-001-LAYOUT",
      "dimension",
      "Explicit joist layout length along spacing axis.",
      "joistLayoutLengthFeet",
      20,
    ),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-001-MEMBER",
      "dimension",
      "Explicit installed joist member length.",
      "joistMemberLengthFeet",
      12,
    ),
    ...buildSystemEvidence("FFS-002", "E-FFS-002", {
      joistType: "dimensional-lumber",
      joistSize: "2x10",
      joistSpacingInches: 16,
    }),
    floorAreaEvidence(
      "FFA-002",
      "E-FFA-002-PARENT",
      "note",
      "Explicit parent floor system.",
      "parentSystemTag",
      "FFS-002",
    ),
    floorAreaEvidence(
      "FFA-002",
      "E-FFA-002-SPAN",
      "note",
      "Explicit span direction.",
      "spanDirection",
      "east-west",
    ),
    floorAreaEvidence(
      "FFA-002",
      "E-FFA-002-LAYOUT",
      "dimension",
      "Explicit joist layout length along spacing axis.",
      "joistLayoutLengthFeet",
      20,
    ),
  ];
}

/** Complete single-area evidence for live Claude PDF (20 ft @ 16" → 16 each; 12 ft → 192 LF). */
export function buildFloorFramingLiveProofEvidence(): Evidence[] {
  return [
    ...buildSystemEvidence("FFS-001", "E-FFS-LIVE", {
      joistType: "i-joist",
      joistSize: "11-7/8",
      joistSpacingInches: 16,
    }),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-LIVE-PARENT",
      "note",
      "Explicit parent floor system.",
      "parentSystemTag",
      "FFS-001",
    ),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-LIVE-SPAN",
      "note",
      "Explicit span direction.",
      "spanDirection",
      "north-south",
    ),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-LIVE-LAYOUT",
      "dimension",
      "Explicit joist layout length along spacing axis.",
      "joistLayoutLengthFeet",
      20,
    ),
    floorAreaEvidence(
      "FFA-001",
      "E-FFA-LIVE-MEMBER",
      "dimension",
      "Explicit installed joist member length.",
      "joistMemberLengthFeet",
      12,
    ),
  ];
}

export const FLOOR_JOIST_COUNT_EXPECTED = {
  "FFA-001": 16,
  "FFA-002": 16,
} as const;

export const FLOOR_JOIST_LINEAR_FEET_EXPECTED = {
  "FFA-001": 192,
  "FFA-002": null,
} as const;
