import {
  evidenceSchema,
  type Evidence,
} from "../../src/core/schemas/evidence.schema.js";

function page3Source(elementLabel: string) {
  return {
    page: {
      documentId: null,
      pageNumber: 3,
      sheetId: "S2.2",
      sheetTitle: "CRAWL SPACE/FOUNDATION PLAN",
      pageLabel: null,
      revision: null,
    },
    region: null,
    elementLabel,
    detailNumber: null,
    sectionNumber: null,
    scheduleName: null,
    noteReference: null,
  };
}

function floorSystemEvidence(
  subjectKey: string,
  id: string,
  propertyPath: string,
  candidateValue: string | number,
  originalText: string,
  description: string,
): Evidence {
  return evidenceSchema.parse({
    id,
    type: "note",
    relationship: "supports",
    description,
    source: page3Source(subjectKey),
    originalText,
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
  propertyPath: string,
  candidateValue: string | number,
  originalText: string,
  description: string,
): Evidence {
  return evidenceSchema.parse({
    id,
    type: propertyPath === "joistLayoutLengthFeet" ? "dimension" : "note",
    relationship: "supports",
    description,
    source: page3Source(subjectKey),
    originalText,
    references: [],
    subjectKind: "floor-framing-area",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

const JOIST_CALLOUT =
  '11.7/8" TJI 210 FLOOR JOISTS AT 16" O.C. OVER (MAX. SPAN = 17\'-0")';

/**
 * Beckstead M.4 crawl-space floor evidence with M.5 governance corrections
 * applied at resolution time (mis-assigned span, inferred parent, spacing-axis).
 */
export function buildBecksteadM5CrawlSpaceFloorEvidence(): Evidence[] {
  return [
    floorSystemEvidence(
      "FLOOR-SYS-CRAWL-SPACE",
      "E-FFS-CRAWL-NAME",
      "name",
      "FLOOR SYS CRAWL SPACE",
      "FLOOR SYS CRAWL SPACE",
      "Floor system name.",
    ),
    floorSystemEvidence(
      "FLOOR-SYS-CRAWL-SPACE",
      "E-FFS-CRAWL-JOISTTYPE",
      "assembly.joistType",
      "TJI 210 I-joist",
      JOIST_CALLOUT,
      "Explicit joist type from crawl space callout.",
    ),
    floorSystemEvidence(
      "FLOOR-SYS-CRAWL-SPACE",
      "E-FFS-CRAWL-JOISTSIZE",
      "assembly.joistSize",
      '11 7/8" TJI 210',
      JOIST_CALLOUT,
      "Explicit joist size from crawl space callout.",
    ),
    floorSystemEvidence(
      "FLOOR-SYS-CRAWL-SPACE",
      "E-FFS-CRAWL-SPACING",
      "assembly.joistSpacingInches",
      16,
      JOIST_CALLOUT,
      "Explicit joist spacing from crawl space callout.",
    ),
    floorSystemEvidence(
      "FLOOR-SYS-CRAWL",
      "E-FFS-NOTE16-TYPE",
      "assembly.joistType",
      '11 7/8" TJI 210',
      JOIST_CALLOUT,
      "Performance note joist type (ambiguous second system on page 3).",
    ),
    floorSystemEvidence(
      "FLOOR-SYS-CRAWL",
      "E-FFS-NOTE16-SPACING",
      "assembly.joistSpacingInches",
      16,
      JOIST_CALLOUT,
      "Performance note joist spacing.",
    ),
    floorAreaEvidence(
      "FLOOR-AREA-CRAWL-SPACE",
      "E-FFA-CRAWL-LAYOUTLENGTH-40",
      "joistLayoutLengthFeet",
      40,
      "40'-0\"",
      "Explicit crawl space bay dimension along joist spacing axis.",
    ),
    floorAreaEvidence(
      "FLOOR-AREA-CRAWL-SPACE",
      "E-FFA-BAY1-MAXSPAN",
      "spanDirection",
      "(MAX. SPAN = 17'-0\")",
      "(MAX. SPAN = 17'-0\")",
      "Mis-assigned max span callout from M.4 extraction.",
    ),
  ];
}

export const BECKSTEAD_M5_CRAWL_JOIST_COUNT = 31;

export const BECKSTEAD_M5_CRAWL_JOIST_LF = 31 * 17;
