import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import type { ClassifiedPlanPage } from "../../src/pdf/pageClassification.js";

export const BECKSTEAD_CRAWL_PAGE = 3;

export function becksteadCrawlPageClassification(): ClassifiedPlanPage[] {
  return [
    {
      pageNumber: BECKSTEAD_CRAWL_PAGE,
      pageKind: "framing-plan",
      titleOrLabel: "CRAWL SPACE/FOUNDATION PLAN",
      contentRoles: ["plan-layout"],
      sheetId: null,
      confidence: 1,
      rationale: "test fixture",
    },
  ];
}

function baseSource(pageNumber: number, tileId: string | null = null) {
  return {
    page: {
      documentId: null,
      pageNumber,
      sheetId: null,
      sheetTitle: "CRAWL SPACE/FOUNDATION PLAN",
      pageLabel: null,
      revision: null,
    },
    region: tileId
      ? { x: 0.1, y: 0.1, width: 0.2, height: 0.15 }
      : null,
    tileId,
    elementLabel: null,
    detailNumber: null,
    sectionNumber: null,
    scheduleName: null,
    noteReference: null,
  };
}

export function becksteadCrawlSpaceEvidence(): Evidence[] {
  const page = BECKSTEAD_CRAWL_PAGE;
  const tile = "t-r1-c1";

  return [
    {
      id: "E-CRAWLAREA-LABEL",
      type: "callout",
      relationship: "supports",
      description: "Crawl space region label",
      source: {
        ...baseSource(page, tile),
        elementLabel: "CRAWL SPACE",
      },
      originalText: "CRAWL SPACE",
      references: [],
      subjectKind: "floor-framing-area",
      subjectKey: "FLOOR AREA CRAWL SPACE",
      propertyPath: "layout",
      candidateValue: "crawl",
    },
    {
      id: "E-FLOORJOIST-SIZE",
      type: "callout",
      relationship: "supports",
      description: "TJI size",
      source: baseSource(page, tile),
      originalText: "FLOOR JOISTS TJI 210",
      references: [],
      subjectKind: "floor-framing-system",
      subjectKey: "FLOOR SYSTEM CRAWL SPACE",
      propertyPath: "assembly.joistSize",
      candidateValue: "210",
    },
    {
      id: "E-FLOORJOIST-SPACING",
      type: "callout",
      relationship: "supports",
      description: "Joist spacing",
      source: baseSource(page, tile),
      originalText: '16" O.C.',
      references: [],
      subjectKind: "floor-framing-system",
      subjectKey: "FLOOR SYSTEM CRAWL SPACE",
      propertyPath: "assembly.joistSpacingInches",
      candidateValue: 16,
    },
    {
      id: "E-FLOORJOIST-MAXSPAN",
      type: "callout",
      relationship: "supports",
      description: "Max span",
      source: baseSource(page, tile),
      originalText: "MAX. SPAN = 17'-0\"",
      references: [],
      subjectKind: "floor-framing-area",
      subjectKey: "FLOOR AREA CRAWL SPACE",
      propertyPath: "joistMemberLengthFeet",
      candidateValue: 17,
    },
    {
      id: "E-TJI210-WEAKER-SYSTEM",
      type: "callout",
      relationship: "supports",
      description: "Generic TJI system without crawl scope binding",
      source: baseSource(page, "t-r2-c2"),
      originalText: "FLOOR JOISTS TJI 210",
      references: [],
      subjectKind: "floor-framing-system",
      subjectKey: "TJI 210 FLOOR SYSTEM",
      propertyPath: "assembly.joistSize",
      candidateValue: "210",
    },
    {
      id: "E-TJI210-WEAKER-SPACING",
      type: "callout",
      relationship: "supports",
      description: "Generic TJI spacing",
      source: baseSource(page, "t-r2-c2"),
      originalText: '16" O.C.',
      references: [],
      subjectKind: "floor-framing-system",
      subjectKey: "TJI 210 FLOOR SYSTEM",
      propertyPath: "assembly.joistSpacingInches",
      candidateValue: 16,
    },
  ] as Evidence[];
}

export function becksteadDualRegionEvidence(): Evidence[] {
  const base = becksteadCrawlSpaceEvidence();
  const page = BECKSTEAD_CRAWL_PAGE;
  return [
    ...base,
    {
      id: "E-PATIO-AREA-LABEL",
      type: "callout",
      relationship: "supports",
      description: "Patio region",
      source: {
        ...baseSource(page, "t-r3-c1"),
        elementLabel: "PATIO",
      },
      originalText: "PATIO",
      references: [],
      subjectKind: "floor-framing-area",
      subjectKey: "FLOOR AREA PATIO",
      propertyPath: "layout",
      candidateValue: "patio",
    },
    {
      id: "E-PATIO-SYSTEM",
      type: "callout",
      relationship: "supports",
      description: "Patio floor system",
      source: baseSource(page, "t-r3-c1"),
      originalText: "FLOOR JOISTS TJI 210",
      references: [],
      subjectKind: "floor-framing-system",
      subjectKey: "FLOOR SYSTEM PATIO",
      propertyPath: "assembly.joistSize",
      candidateValue: "210",
    },
    {
      id: "E-PATIO-SPACING",
      type: "callout",
      relationship: "supports",
      description: "Patio spacing",
      source: baseSource(page, "t-r3-c1"),
      originalText: '16" O.C.',
      references: [],
      subjectKind: "floor-framing-system",
      subjectKey: "FLOOR SYSTEM PATIO",
      propertyPath: "assembly.joistSpacingInches",
      candidateValue: 16,
    },
  ] as Evidence[];
}
