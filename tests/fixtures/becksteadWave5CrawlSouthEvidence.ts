import {
  evidenceSchema,
  type Evidence,
} from "../../src/core/schemas/evidence.schema.js";

function page3Source(elementLabel: string) {
  return {
    page: {
      documentId: null,
      pageNumber: 3,
      sheetId: "22",
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
 * Beckstead Wave 5 crawl-south slice: linked S area, fragmented NORTH layout
 * evidence, sibling system assembly split across FRAMING vs SYSTEM subjects.
 */
export function buildBecksteadWave5CrawlSouthEvidence(): Evidence[] {
  return [
    floorSystemEvidence(
      "CRAWL SPACE FLOOR FRAMING",
      "E-CRAWLSPACE-JOISTTYPE",
      "assembly.joistType",
      "TJI 210",
      JOIST_CALLOUT,
      "Crawl space joist type on framing subject.",
    ),
    floorSystemEvidence(
      "CRAWL SPACE FLOOR FRAMING",
      "E-CRAWLSPACE-JOISTSIZE",
      "assembly.joistSize",
      '11 7/8"',
      JOIST_CALLOUT,
      "Crawl space joist size on framing subject.",
    ),
    floorSystemEvidence(
      "CRAWL SPACE FLOOR SYSTEM",
      "E-CRAWLSPACE-SYSTEM-TYPE",
      "assembly.joistType",
      "TJI 210",
      JOIST_CALLOUT,
      "Crawl space system joist type.",
    ),
    floorSystemEvidence(
      "CRAWL SPACE FLOOR SYSTEM",
      "E-CRAWLSPACE-SYSTEM-SPACING",
      "assembly.joistSpacingInches",
      16,
      JOIST_CALLOUT,
      "Crawl space system joist spacing.",
    ),
    floorAreaEvidence(
      "CRAWL SPACE FLOOR AREA---S",
      "E-CS-S-PARENT",
      "parentSystemTag",
      "CRAWL SPACE FLOOR SYSTEM",
      "CRAWL SPACE FLOOR SYSTEM",
      "Linked crawl south area parent.",
    ),
    floorAreaEvidence(
      "CRAWL SPACE FLOOR AREA---S",
      "E-CS-S-SPAN",
      "spanDirection",
      "(MAX. SPAN = 17'-0\")",
      "(MAX. SPAN = 17'-0\")",
      "Mis-assigned max span callout.",
    ),
    floorAreaEvidence(
      "CRAWL SPACE FLOOR AREA - NORTH",
      "E-CRAWLSPACE-FFA1-LAYOUTLENGTH",
      "joistLayoutLengthFeet",
      `40'-0" / 50'-8"`,
      `40'-0" / 50'-8"`,
      "Bay dimension along joist run (north bay).",
    ),
    floorAreaEvidence(
      "PATIO SLAB AREA",
      "E-PATIO-CS-PARENT",
      "parentSystemTag",
      "CRAWL SPACE FLOOR FRAMING",
      "CRAWL SPACE FLOOR FRAMING",
      "False-positive patio parent from wave5.",
    ),
  ];
}
