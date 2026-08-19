import { evidenceSchema, type Evidence } from "../../src/core/schemas/evidence.schema.js";

const openingSource = {
  page: {
    documentId: null,
    pageNumber: 1,
    sheetId: null,
    sheetTitle: null,
    pageLabel: null,
    revision: null,
  },
  region: null,
  elementLabel: "O-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function openingEvidence(
  id: string,
  type: "note" | "dimension" | "schedule" | "detail",
  description: string,
  propertyPath: string,
  candidateValue: string | number | boolean | null,
  subjectKey = "O-001",
): Evidence {
  return evidenceSchema.parse({
    id,
    type,
    relationship: "supports",
    description,
    source: {
      ...openingSource,
      elementLabel: subjectKey,
    },
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "opening",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

export function buildCompleteOpeningEvidence(
  subjectKey = "O-001",
  prefix = "E-O001",
  options: {
    includeWallRelationship?: boolean;
    includeHeaderRelationship?: boolean;
  } = {},
): Evidence[] {
  const includeWallRelationship = options.includeWallRelationship ?? false;
  const includeHeaderRelationship = options.includeHeaderRelationship ?? false;

  return [
    openingEvidence(
      `${prefix}-CATEGORY`,
      "note",
      "Explicit opening category.",
      "category",
      "window",
      subjectKey,
    ),
    openingEvidence(
      `${prefix}-NOM-WIDTH`,
      "dimension",
      "Explicit nominal width.",
      "dimensions.nominalWidthFeet",
      3,
      subjectKey,
    ),
    openingEvidence(
      `${prefix}-NOM-HEIGHT`,
      "dimension",
      "Explicit nominal height.",
      "dimensions.nominalHeightFeet",
      4,
      subjectKey,
    ),
    openingEvidence(
      `${prefix}-ROUGH-WIDTH`,
      "dimension",
      "Explicit rough width.",
      "dimensions.roughWidthFeet",
      3.5,
      subjectKey,
    ),
    openingEvidence(
      `${prefix}-ROUGH-HEIGHT`,
      "dimension",
      "Explicit rough height.",
      "dimensions.roughHeightFeet",
      4.5,
      subjectKey,
    ),
    openingEvidence(
      `${prefix}-QTY`,
      "dimension",
      "Explicit opening quantity.",
      "quantity",
      1,
      subjectKey,
    ),
    ...(includeWallRelationship
      ? [
          openingEvidence(
            `${prefix}-WALL`,
            "note",
            "Explicit parent wall association.",
            "parentWallTag",
            "W-001",
            subjectKey,
          ),
        ]
      : []),
    ...(includeHeaderRelationship
      ? [
          openingEvidence(
            `${prefix}-HEADER`,
            "note",
            "Explicit header member association.",
            "headerMemberTag",
            "HDR-001",
            subjectKey,
          ),
        ]
      : []),
    openingEvidence(
      `${prefix}-SCHEDULE`,
      "schedule",
      "Explicit schedule reference.",
      "scheduleReference",
      "Window Schedule",
      subjectKey,
    ),
    openingEvidence(
      `${prefix}-DETAIL`,
      "detail",
      "Explicit detail reference.",
      "detailReference",
      "A-501",
      subjectKey,
    ),
    openingEvidence(
      `${prefix}-FIRE`,
      "note",
      "Explicit fire rating.",
      "fireRating",
      "20 min",
      subjectKey,
    ),
  ];
}

export { openingEvidence };
