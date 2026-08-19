import { evidenceSchema, type Evidence } from "../../src/core/schemas/evidence.schema.js";

const wallSource = {
  page: {
    documentId: null,
    pageNumber: 1,
    sheetId: null,
    sheetTitle: null,
    pageLabel: null,
    revision: null,
  },
  region: null,
  elementLabel: "W-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

const memberSource = {
  ...wallSource,
  elementLabel: "HDR-001",
};

function wallEvidence(
  id: string,
  type: "note" | "dimension",
  description: string,
  propertyPath: string,
  candidateValue: string | number | boolean | null,
): Evidence {
  return evidenceSchema.parse({
    id,
    type,
    relationship: "supports",
    description,
    source: wallSource,
    originalText: "W-001 fixture line",
    references: [],
    subjectKind: "wall",
    subjectKey: "W-001",
    propertyPath,
    candidateValue,
  });
}

function memberEvidence(
  id: string,
  type: "note" | "dimension",
  description: string,
  propertyPath: string,
  candidateValue: string | number | boolean | null,
): Evidence {
  return evidenceSchema.parse({
    id,
    type,
    relationship: "supports",
    description,
    source: memberSource,
    originalText: "HDR-001 fixture line",
    references: [],
    subjectKind: "structural-member",
    subjectKey: "HDR-001",
    propertyPath,
    candidateValue,
  });
}

export function buildMixedDomainWallEvidence(): Evidence[] {
  return [
    wallEvidence(
      "E-W001-CLASS",
      "note",
      "Explicit wall type classification.",
      "wallType",
      "wood stud wall",
    ),
    wallEvidence(
      "E-W001-LOCATION",
      "note",
      "Explicit wall location.",
      "location",
      "exterior",
    ),
    wallEvidence(
      "E-W001-BEARING",
      "note",
      "Explicit wall bearing classification.",
      "bearingStatus",
      "non-bearing",
    ),
    wallEvidence(
      "E-W001-GEOMETRY",
      "dimension",
      "Explicit wall segment length.",
      "lengthFeet",
      20,
    ),
    wallEvidence(
      "E-W001-HEIGHT",
      "dimension",
      "Explicit wall height.",
      "assembly.heightFeet",
      8,
    ),
    wallEvidence(
      "E-W001-FRAMING",
      "note",
      "Explicit stud size.",
      "assembly.studSize",
      "2x4",
    ),
    wallEvidence(
      "E-W001-SPACING",
      "dimension",
      "Explicit stud spacing.",
      "assembly.studSpacingInches",
      16,
    ),
    wallEvidence(
      "E-W001-PLATES",
      "note",
      "Explicit plate count.",
      "assembly.plateCount",
      3,
    ),
  ];
}

export function buildMixedDomainHeaderEvidence(options?: {
  includeQuantity?: boolean;
  includeOpeningRelationship?: boolean;
}): Evidence[] {
  const includeQuantity = options?.includeQuantity ?? true;
  const includeOpeningRelationship = options?.includeOpeningRelationship ?? false;
  const records: Evidence[] = [
    memberEvidence(
      "E-HDR-001-CATEGORY",
      "note",
      "Explicit header category.",
      "category",
      "header",
    ),
    memberEvidence(
      "E-HDR-001-MATERIAL",
      "note",
      "Explicit header material.",
      "materialType",
      "lvl",
    ),
    memberEvidence(
      "E-HDR-001-SIZE",
      "note",
      "Explicit header size.",
      "size",
      "1.75x11.875",
    ),
    memberEvidence(
      "E-HDR-001-LENGTH",
      "dimension",
      "Explicit header length.",
      "lengthFeet",
      6,
    ),
    memberEvidence(
      "E-HDR-001-LOCATION",
      "note",
      "Explicit header location.",
      "location",
      "over Window W-001 at Wall W-001",
    ),
  ];

  if (includeOpeningRelationship) {
    records.push(
      memberEvidence(
        "E-HDR-001-OPENING",
        "note",
        "Explicit supported opening association.",
        "supportedOpeningTag",
        "O-001",
      ),
    );
  }

  if (includeQuantity) {
    records.push(
      memberEvidence(
        "E-HDR-001-QTY",
        "dimension",
        "Explicit header quantity.",
        "quantity",
        1,
      ),
    );
  }

  return records;
}

export function buildCompleteMixedDomainEvidence(options?: {
  includeQuantity?: boolean;
  includeOpeningRelationship?: boolean;
}): Evidence[] {
  return [
    ...buildMixedDomainWallEvidence(),
    ...buildMixedDomainHeaderEvidence(options),
  ];
}

export { memberEvidence };
