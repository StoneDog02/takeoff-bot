import {
  evidenceSchema,
  type Evidence,
} from "../../../core/schemas/evidence.schema.js";

function roofSource(subjectKey: string) {
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

function roofSystemEvidence(
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
    source: roofSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "roof-framing-system",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

function roofPlaneEvidence(
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
    source: roofSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "roof-plane",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

function buildSystemEvidence(
  systemKey: string,
  prefix: string,
  assembly: {
    framingType: string;
    memberSize: string;
    memberSpacingInches: number;
  },
): Evidence[] {
  return [
    roofSystemEvidence(
      systemKey,
      `${prefix}-NAME`,
      "note",
      "Explicit roof framing system name.",
      "name",
      "Main roof framing",
    ),
    roofSystemEvidence(
      systemKey,
      `${prefix}-LEVEL`,
      "note",
      "Explicit roof framing level.",
      "level",
      "Roof",
    ),
    roofSystemEvidence(
      systemKey,
      `${prefix}-PHASE`,
      "note",
      "Explicit construction phase.",
      "constructionPhase",
      "new",
    ),
    roofSystemEvidence(
      systemKey,
      `${prefix}-TYPE`,
      "schedule",
      "Explicit framing type.",
      "assembly.framingType",
      assembly.framingType,
    ),
    roofSystemEvidence(
      systemKey,
      `${prefix}-SIZE`,
      "schedule",
      "Explicit member size.",
      "assembly.memberSize",
      assembly.memberSize,
    ),
    roofSystemEvidence(
      systemKey,
      `${prefix}-SPACING`,
      "schedule",
      "Explicit member spacing.",
      "assembly.memberSpacingInches",
      assembly.memberSpacingInches,
    ),
  ];
}

/**
 * Two independent Roof Planes for the R2 common-rafter count slice:
 * - RFP-001: complete (20 ft @ 16" → 16 commons); pitch/SF absent
 * - RFP-002: missing rafterLayoutLengthFeet (count blocked)
 */
export function buildRoofFramingCommonRafterEvidence(): Evidence[] {
  return [
    ...buildSystemEvidence("RFS-001", "E-RFS-001", {
      framingType: "rafter",
      memberSize: "2x8",
      memberSpacingInches: 16,
    }),
    roofPlaneEvidence(
      "RFP-001",
      "E-RFP-001-PARENT",
      "note",
      "Explicit parent roof system.",
      "parentSystemTag",
      "RFS-001",
    ),
    roofPlaneEvidence(
      "RFP-001",
      "E-RFP-001-SPAN",
      "note",
      "Explicit span direction.",
      "spanDirection",
      "north-south",
    ),
    roofPlaneEvidence(
      "RFP-001",
      "E-RFP-001-FRAMING",
      "note",
      "Explicit framing direction.",
      "framingDirection",
      "north-south",
    ),
    roofPlaneEvidence(
      "RFP-001",
      "E-RFP-001-LAYOUT",
      "dimension",
      "Explicit rafter layout length along spacing axis.",
      "rafterLayoutLengthFeet",
      20,
    ),
    ...buildSystemEvidence("RFS-002", "E-RFS-002", {
      framingType: "rafter",
      memberSize: "2x8",
      memberSpacingInches: 16,
    }),
    roofPlaneEvidence(
      "RFP-002",
      "E-RFP-002-PARENT",
      "note",
      "Explicit parent roof system.",
      "parentSystemTag",
      "RFS-002",
    ),
    roofPlaneEvidence(
      "RFP-002",
      "E-RFP-002-SPAN",
      "note",
      "Explicit span direction.",
      "spanDirection",
      "east-west",
    ),
  ];
}

/** Truss-framed system — common-rafter count must not emit. */
export function buildRoofFramingTrussEvidence(): Evidence[] {
  return [
    ...buildSystemEvidence("RFS-TRUSS", "E-RFS-TRUSS", {
      framingType: "roof-truss",
      memberSize: "18",
      memberSpacingInches: 24,
    }),
    roofPlaneEvidence(
      "RFP-TRUSS",
      "E-RFP-TRUSS-PARENT",
      "note",
      "Explicit parent roof system.",
      "parentSystemTag",
      "RFS-TRUSS",
    ),
    roofPlaneEvidence(
      "RFP-TRUSS",
      "E-RFP-TRUSS-SPAN",
      "note",
      "Explicit span direction.",
      "spanDirection",
      "north-south",
    ),
    roofPlaneEvidence(
      "RFP-TRUSS",
      "E-RFP-TRUSS-LAYOUT",
      "dimension",
      "Explicit layout length (must not produce stick commons).",
      "rafterLayoutLengthFeet",
      20,
    ),
  ];
}

export const ROOF_COMMON_RAFTER_COUNT_EXPECTED = {
  "RFP-001": 16,
  "RFP-002": null,
} as const;
