import { evidenceSchema, type Evidence } from "../../core/schemas/evidence.schema.js";

type OpeningEvidenceOptions = {
  category: "window" | "door";
  nominalWidthFeet: number;
  nominalHeightFeet: number;
  roughWidthFeet?: number | null;
  roughHeightFeet?: number | null;
  quantity?: number;
  kingStudCount?: number | null;
  jackStudCount?: number | null;
  parentWallTag?: string;
  headerMemberTag?: string;
  includeRoughWidth?: boolean;
  includeRoughHeight?: boolean;
};

function wallSource(subjectKey: string) {
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

function wallEvidence(
  subjectKey: string,
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
    source: wallSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "wall",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

function openingEvidence(
  subjectKey: string,
  id: string,
  type: "note" | "dimension" | "schedule" | "detail",
  description: string,
  propertyPath: string,
  candidateValue: string | number | boolean | null,
): Evidence {
  return evidenceSchema.parse({
    id,
    type,
    relationship: "supports",
    description,
    source: wallSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "opening",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

function headerEvidence(
  subjectKey: string,
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
    source: wallSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "structural-member",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

export function buildWallEvidenceForSubject(
  subjectKey: "W-001" | "W-002",
  prefix: string,
): Evidence[] {
  const isW002 = subjectKey === "W-002";

  return [
    wallEvidence(
      subjectKey,
      `${prefix}-CLASS`,
      "note",
      "Explicit wall type classification.",
      "wallType",
      "wood stud wall",
    ),
    wallEvidence(
      subjectKey,
      `${prefix}-LOCATION`,
      "note",
      "Explicit wall location.",
      "location",
      isW002 ? "interior" : "exterior",
    ),
    wallEvidence(
      subjectKey,
      `${prefix}-BEARING`,
      "note",
      "Explicit wall bearing classification.",
      "bearingStatus",
      "non-bearing",
    ),
    wallEvidence(
      subjectKey,
      `${prefix}-GEOMETRY`,
      "dimension",
      "Explicit wall segment length.",
      "lengthFeet",
      isW002 ? 12 : 20,
    ),
    wallEvidence(
      subjectKey,
      `${prefix}-HEIGHT`,
      "dimension",
      "Explicit wall height.",
      "assembly.heightFeet",
      isW002 ? 9 : 8,
    ),
    wallEvidence(
      subjectKey,
      `${prefix}-FRAMING`,
      "note",
      "Explicit stud size.",
      "assembly.studSize",
      isW002 ? "2x6" : "2x4",
    ),
    wallEvidence(
      subjectKey,
      `${prefix}-SPACING`,
      "dimension",
      "Explicit stud spacing.",
      "assembly.studSpacingInches",
      isW002 ? 24 : 16,
    ),
    wallEvidence(
      subjectKey,
      `${prefix}-PLATES`,
      "note",
      "Explicit plate count.",
      "assembly.plateCount",
      isW002 ? 2 : 3,
    ),
  ];
}

export function buildOpeningEvidenceForSubject(
  subjectKey: string,
  prefix: string,
  options: OpeningEvidenceOptions,
): Evidence[] {
  const records: Evidence[] = [
    openingEvidence(
      subjectKey,
      `${prefix}-CATEGORY`,
      "note",
      "Explicit opening category.",
      "category",
      options.category,
    ),
    openingEvidence(
      subjectKey,
      `${prefix}-NOM-WIDTH`,
      "dimension",
      "Explicit nominal width.",
      "dimensions.nominalWidthFeet",
      options.nominalWidthFeet,
    ),
    openingEvidence(
      subjectKey,
      `${prefix}-NOM-HEIGHT`,
      "dimension",
      "Explicit nominal height.",
      "dimensions.nominalHeightFeet",
      options.nominalHeightFeet,
    ),
    openingEvidence(
      subjectKey,
      `${prefix}-QTY`,
      "dimension",
      "Explicit opening quantity.",
      "quantity",
      options.quantity ?? 1,
    ),
  ];

  if (options.includeRoughWidth ?? options.roughWidthFeet !== undefined) {
    records.push(
      openingEvidence(
        subjectKey,
        `${prefix}-ROUGH-WIDTH`,
        "dimension",
        "Explicit rough width.",
        "dimensions.roughWidthFeet",
        options.roughWidthFeet ?? null,
      ),
    );
  }

  if (options.includeRoughHeight ?? options.roughHeightFeet !== undefined) {
    records.push(
      openingEvidence(
        subjectKey,
        `${prefix}-ROUGH-HEIGHT`,
        "dimension",
        "Explicit rough height.",
        "dimensions.roughHeightFeet",
        options.roughHeightFeet ?? null,
      ),
    );
  }

  if (options.kingStudCount != null) {
    records.push(
      openingEvidence(
        subjectKey,
        `${prefix}-KING`,
        "dimension",
        "Explicit king stud count.",
        "kingStudCount",
        options.kingStudCount,
      ),
    );
  }

  if (options.jackStudCount != null) {
    records.push(
      openingEvidence(
        subjectKey,
        `${prefix}-JACK`,
        "dimension",
        "Explicit jack stud count.",
        "jackStudCount",
        options.jackStudCount,
      ),
    );
  }

  if (options.parentWallTag) {
    records.push(
      openingEvidence(
        subjectKey,
        `${prefix}-WALL`,
        "note",
        "Explicit parent wall association.",
        "parentWallTag",
        options.parentWallTag,
      ),
    );
  }

  if (options.headerMemberTag) {
    records.push(
      openingEvidence(
        subjectKey,
        `${prefix}-HEADER`,
        "note",
        "Explicit header member association.",
        "headerMemberTag",
        options.headerMemberTag,
      ),
    );
  }

  return records;
}

export function buildHeaderEvidenceForSubject(
  subjectKey: string,
  prefix: string,
  options: {
    lengthFeet: number;
    supportedOpeningTag?: string;
    materialType?: string;
    size?: string;
  },
): Evidence[] {
  const records: Evidence[] = [
    headerEvidence(
      subjectKey,
      `${prefix}-CATEGORY`,
      "note",
      "Explicit header category.",
      "category",
      "header",
    ),
    headerEvidence(
      subjectKey,
      `${prefix}-MATERIAL`,
      "note",
      "Explicit header material.",
      "materialType",
      options.materialType ?? "dimensional-lumber",
    ),
    headerEvidence(
      subjectKey,
      `${prefix}-SIZE`,
      "note",
      "Explicit header size.",
      "size",
      options.size ?? "2x10",
    ),
    headerEvidence(
      subjectKey,
      `${prefix}-LENGTH`,
      "dimension",
      "Explicit header length.",
      "lengthFeet",
      options.lengthFeet,
    ),
    headerEvidence(
      subjectKey,
      `${prefix}-QTY`,
      "dimension",
      "Explicit header quantity.",
      "quantity",
      1,
    ),
  ];

  if (options.supportedOpeningTag) {
    records.push(
      headerEvidence(
        subjectKey,
        `${prefix}-OPENING`,
        "note",
        "Explicit supported opening association.",
        "supportedOpeningTag",
        options.supportedOpeningTag,
      ),
    );
  }

  return records;
}

function sheathingSource(subjectKey: string) {
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

function sheathingSystemEvidence(
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
    source: sheathingSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "sheathing-system",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

function sheathingAreaEvidence(
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
    source: sheathingSource(subjectKey),
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "sheathing-area",
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

export function buildSheathingEvidenceForWall001(
  systemKey = "SHS-001",
  areaKey = "SHA-001",
  prefix = "E-SHS",
): Evidence[] {
  return [
    sheathingSystemEvidence(
      systemKey,
      `${prefix}-NAME`,
      "note",
      "Explicit sheathing system name.",
      "name",
      "Level 1 exterior wall sheathing",
    ),
    sheathingSystemEvidence(
      systemKey,
      `${prefix}-LEVEL`,
      "note",
      "Explicit sheathing level.",
      "level",
      "Level 1",
    ),
    sheathingSystemEvidence(
      systemKey,
      `${prefix}-APP`,
      "note",
      "Explicit sheathing application.",
      "application",
      "wall",
    ),
    sheathingSystemEvidence(
      systemKey,
      `${prefix}-PHASE`,
      "note",
      "Explicit construction phase.",
      "constructionPhase",
      "new",
    ),
    sheathingSystemEvidence(
      systemKey,
      `${prefix}-TYPE`,
      "note",
      "Explicit panel type.",
      "panelSpecification.panelType",
      "OSB",
    ),
    sheathingSystemEvidence(
      systemKey,
      `${prefix}-THICK`,
      "note",
      "Explicit panel thickness.",
      "panelSpecification.thickness",
      '7/16"',
    ),
    sheathingAreaEvidence(
      areaKey,
      `${prefix}-AREA-SF`,
      "dimension",
      "Explicit sheathing coverage area.",
      "areaSquareFeet",
      160,
    ),
    sheathingAreaEvidence(
      areaKey,
      `${prefix}-PARENT`,
      "note",
      "Explicit parent sheathing system.",
      "parentSystemTag",
      systemKey,
    ),
    sheathingAreaEvidence(
      areaKey,
      `${prefix}-WALL`,
      "note",
      "Explicit covered wall association.",
      "coveredWallTag",
      "W-001",
    ),
  ];
}

/**
 * Deterministic multi-object framing slice:
 *
 * W-001 (20 ft, 16 o.c., 2x4, 3 plates) → O-001, O-002
 * W-002 (12 ft, 24 o.c., 2x6, 2 plates) → O-003
 * SM-HDR-001 → O-001
 * SM-HDR-002 → O-003
 */
export function buildMultiObjectFramingEvidence(): Evidence[] {
  return [
    ...buildWallEvidenceForSubject("W-001", "E-W001"),
    ...buildWallEvidenceForSubject("W-002", "E-W002"),
    ...buildOpeningEvidenceForSubject("O-001", "E-O001", {
      category: "window",
      nominalWidthFeet: 3,
      nominalHeightFeet: 4,
      roughWidthFeet: 3.5,
      roughHeightFeet: 4.5,
      kingStudCount: 3,
      jackStudCount: 2,
      parentWallTag: "W-001",
      headerMemberTag: "HDR-001",
    }),
    ...buildOpeningEvidenceForSubject("O-002", "E-O002", {
      category: "window",
      nominalWidthFeet: 4,
      nominalHeightFeet: 5,
      roughHeightFeet: 5.5,
      includeRoughWidth: false,
      parentWallTag: "W-001",
    }),
    ...buildOpeningEvidenceForSubject("O-003", "E-O003", {
      category: "door",
      nominalWidthFeet: 3,
      nominalHeightFeet: 7,
      roughWidthFeet: 3.25,
      roughHeightFeet: 7.5,
      parentWallTag: "W-002",
      headerMemberTag: "HDR-002",
    }),
    ...buildHeaderEvidenceForSubject("HDR-001", "E-HDR-001", {
      lengthFeet: 6,
      supportedOpeningTag: "O-001",
      materialType: "lvl",
      size: "1.75x11.875",
    }),
    ...buildHeaderEvidenceForSubject("HDR-002", "E-HDR-002", {
      lengthFeet: 8,
      supportedOpeningTag: "O-003",
      materialType: "dimensional-lumber",
      size: "2x12",
    }),
    ...buildSheathingEvidenceForWall001(),
  ];
}

export const MULTI_OBJECT_EXPECTED_QUANTITIES = {
  walls: {
    "WS-001": { studs: 16, plates: 60 },
    "WS-002": { studs: 7, plates: 24 },
  },
  openings: {
    "O-001": {
      kingStuds: 3,
      jackStuds: 2,
      roughSill: 3.5,
      cripplesAbove: 2,
      cripplesBelow: 2,
    },
    "O-002": { kingStuds: 2, jackStuds: null, roughSill: null },
    "O-003": { kingStuds: 2, jackStuds: null, roughSill: null },
  },
  headers: {
    "SM-HDR-001": 6,
    "SM-HDR-002": 8,
  },
  sheathing: {
    "SHA-001": 160,
  },
  summary: {
    wallCount: 2,
    wallSegmentCount: 2,
    openingCount: 3,
    structuralMemberCount: 2,
    sheathingSystemCount: 1,
    sheathingAreaCount: 1,
    materialLineItemCount: 14,
    assumptionCount: 4,
    reviewItemCount: 6,
    validationIssueCount: 6,
  },
} as const;
