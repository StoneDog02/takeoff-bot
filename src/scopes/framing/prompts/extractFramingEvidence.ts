import { runClaudeJson } from "../../../ai/anthropic/runClaudeJson.js";
import {
  formatKnowledgeForPrompt,
  loadKnowledgeFiles,
} from "../../../core/knowledge/loadKnowledge.js";
import type { PlanIndex, PlanPage } from "../../../plans/PlanIndex.js";
import {
  extractedFramingEvidencePayloadSchema,
  type ExtractedFramingEvidencePayload,
  type PageClassificationPayload,
  type PlanReadingOrderPayload,
} from "../schemas/framing-artifacts.schema.js";

const EXTRACTION_KNOWLEDGE_PATHS = [
  "framing/01-scope-definition.md",
  "framing/05-wall-identification.md",
  "universal/page-reference-rules.md",
];

export interface ExtractFramingEvidenceInput {
  planIndex: PlanIndex;
  pageClassification: PageClassificationPayload;
  planReadingOrder: PlanReadingOrderPayload;
  buildingAssemblies: {
    assemblyNames: string[];
    notes: string[];
  };
}

function selectPagesForExtraction(
  planIndex: PlanIndex,
  pageClassification: PageClassificationPayload,
  planReadingOrder: PlanReadingOrderPayload,
): PlanPage[] {
  const relevantPageNumbers = new Set(
    pageClassification.pages
      .filter((page) => page.relevantToFraming)
      .map((page) => page.pageNumber),
  );

  const ordered = planReadingOrder.orderedPageNumbers.filter((pageNumber) =>
    relevantPageNumbers.has(pageNumber),
  );

  const remaining = [...relevantPageNumbers]
    .filter((pageNumber) => !ordered.includes(pageNumber))
    .sort((a, b) => a - b);

  const pageNumbers = [...ordered, ...remaining];
  const pagesByNumber = new Map(
    planIndex.pages.map((page) => [page.pageNumber, page]),
  );

  return pageNumbers
    .map((pageNumber) => pagesByNumber.get(pageNumber))
    .filter((page): page is PlanPage => page !== undefined);
}

function buildSystemPrompt(knowledgeBlock: string): string {
  return `You extract framing evidence from construction plan page text for a deterministic takeoff engine.

Evidence is extracted candidate state, not resolved construction truth.
Do not assign final ObjectIds, create ResolutionTraces, apply assumptions,
choose a winner among conflicting candidates, or calculate quantities.

Rules:
- Extract only what is supported by the provided page text.
- Do not invent walls, dimensions, assemblies, openings, or quantities.
- Do not copy sheet IDs, titles, originalText, or candidate values from the
  example JSON unless they appear in the provided page text.
- Prior-stage assembly names are context only, not plan evidence.
- Emit one Evidence record per subjectKind + subjectKey + propertyPath + candidateValue.
- Do not hide multiple construction properties inside one description.
- Never calculate material quantities.
- If a property is not evidenced, omit the record. Do not guess.
- Use candidateValue null only when the source mentions the property but
  does not provide an extractable value.
- Leave source.region null unless coordinates are explicitly provided.
- Use evidence IDs matching this pattern: E-<SUBJECT>-<ASPECT>
  (example: E-W001-SPACING). Make IDs unique when the same property has
  more than one candidate (example: E-W001-SPACING-NOTE).
- IDs may only use letters, numbers, and . _ : -
- originalText must quote or closely paraphrase the supporting plan text.
- source.page.pageNumber and sheetId must match the provided page catalog.
- relationship should be "supports" for the candidate this record extracts.
  Use "conflicts" only when the same source text is explicitly contradicting
  another stated value. Use "context" for supporting context that is not
  itself a candidate value. Never drop a competing candidate.

subjectKind:
- Emit the extraction domain for every record.
- For wall extraction, use "wall".
- For explicitly identified structural members in this stage, use
  "structural-member".
- For explicitly identified openings in this stage, use "opening".
- For explicitly identified sheathing systems, use "sheathing-system".
- For explicitly identified sheathing areas, use "sheathing-area".
- For explicitly identified floor framing systems, use "floor-framing-system".
- For explicitly identified floor framing areas, use "floor-framing-area".
- For explicitly identified roof framing systems, use "roof-framing-system".
- For explicitly identified roof planes, use "roof-plane".
- First controlled structural-member scope: single-piece headers only.
- First controlled opening scope: scalar opening facts only.
- subjectKind + subjectKey identify the extraction cluster; propertyPath identifies
  the candidate within that cluster.
- Do not mint ObjectIds or resolved object types here.
- The same Stage 5 Evidence artifact may contain "wall", "structural-member",
  "opening", "sheathing-system", "sheathing-area", "floor-framing-system",
  "floor-framing-area", "roof-framing-system", and "roof-plane" records
  simultaneously.

subjectKey:
- Use the most stable plan-derived identifier for the future object/cluster.
- Prefer a wall tag, schedule key, callout, or other extraction-stable label.
- When a bare wall tag line is present (example: W-001, W-002), use that exact
  string as subjectKey.
- When a bare structural member tag line is present (example: HDR-001), use that
  exact string as subjectKey for every property belonging to that member.
- When a bare opening tag line is present (example: O-001), use that exact
  string as subjectKey for every property belonging to that opening.
- When a bare sheathing system tag line is present (example: SHS-001), use that
  exact string as subjectKey for every property belonging to that system.
- When a bare sheathing area tag line is present (example: SHA-001), use that
  exact string as subjectKey for every property belonging to that area.
- When a bare floor framing system tag line is present (example: FFS-001), use
  that exact string as subjectKey for every property belonging to that system.
- When a bare floor framing area tag line is present (example: FFA-001), use that
  exact string as subjectKey for every property belonging to that area.
- When a bare roof framing system tag line is present (example: RFS-001), use
  that exact string as subjectKey for every property belonging to that system.
- When a bare roof plane tag line is present (example: RFP-001), use that exact
  string as subjectKey for every property belonging to that plane.
- When multiple labeled wall tags appear, emit separate Evidence clusters for
  each tag. Reuse the same subjectKey for every property belonging to that wall.
- Never merge facts from one labeled wall into another wall's subjectKey.
- Never merge facts from one labeled structural member into another member's
  subjectKey.
- Never merge facts from one labeled opening into another opening's subjectKey.
- Conflicting values stay separate Evidence records within the appropriate
  subjectKey only.
- This is an extraction cluster key, not a resolved ObjectId.
- Evidence from multiple pages/sheets that concerns the same tagged object
  must reuse the same subjectKey.
- Wall-level properties and segment length may share the same subjectKey.
- If no tag or schedule key exists, use the exact source label/callout text.
  Do not mint an ObjectId.

propertyPath:
- Use an object-relative path compatible with later ResolutionTraces.
- Examples for walls/segments: wallType, location, bearingStatus,
  isShearOrBraced, fireRating, constructionPhase, assembly.studSize,
  assembly.studSpacingInches, assembly.heightFeet, assembly.plateCount,
  assembly.material, assembly.sheathing, lengthFeet.
- Examples for structural members (headers in this stage): category,
  materialType, size, lengthFeet, quantity, location.
- Examples for openings (scalar facts in this stage): category,
  dimensions.nominalWidthFeet, dimensions.nominalHeightFeet,
  dimensions.roughWidthFeet, dimensions.roughHeightFeet, quantity,
  kingStudCount, jackStudCount, scheduleReference, detailReference, fireRating.
- Examples for openings (explicit wall association in this stage):
  parentWallTag with the exact plan wall tag such as W-001.
- Examples for openings (explicit header association in this stage):
  headerMemberTag with the exact plan header tag such as HDR-001.
- Examples for sheathing systems: name, level, application, constructionPhase,
  panelSpecification.panelType, panelSpecification.thickness,
  panelSpecification.grade, panelSpecification.spanRating,
  panelSpecification.exposureRating, panelSpecification.edgeTreatment,
  panelSpecification.specificationReference.
- Examples for sheathing areas: areaSquareFeet, layout.
- Examples for sheathing areas (relationships in this stage):
  parentSystemTag with the exact plan sheathing system tag such as SHS-001;
  coveredWallTag with the exact plan wall tag such as W-001;
  openingTag with the exact plan opening tag such as O-001.
- Examples for floor framing systems: name, level, constructionPhase,
  assembly.joistType, assembly.joistSize, assembly.joistSpacingInches,
  assembly.rimBoard.
- Examples for floor framing areas: layout, framingDirection, spanDirection,
  joistLayoutLengthFeet, joistMemberLengthFeet, areaSquareFeet.
- Examples for floor framing areas (relationships in this stage):
  parentSystemTag with the exact plan floor system tag such as FFS-001;
  boundingWallTag with the exact plan wall tag such as W-001;
  openingTag with the exact plan opening tag such as O-001;
  structuralMemberTag with the exact plan member tag such as HDR-001.
- Examples for roof framing systems: name, level, constructionPhase,
  assembly.framingType, assembly.memberSize, assembly.memberSpacingInches.
- Examples for roof planes: layout, framingDirection, spanDirection,
  rafterLayoutLengthFeet, pitch, areaSquareFeet.
- Examples for roof planes (relationships in this stage):
  parentSystemTag with the exact plan roof system tag such as RFS-001;
  boundingWallTag with the exact plan wall tag such as W-001;
  openingTag with the exact plan opening tag such as O-001;
  structuralMemberTag with the exact plan member tag such as HDR-001.
- These are examples, not an exhaustive enum. Do not invent resolved
  nested objects.

structural-member extraction rules (headers only in this stage):
- Emit one Evidence record per atomic property candidate.
- Do not infer missing quantity as 1.
- Do not infer category from ambiguous wording.
- Do not infer materialType from size.
- Do not infer location if not explicitly evidenced.
- Do not calculate linear footage.
- Do not infer built-up plyCount.
- Do not infer relationships to walls, openings, or other objects.
- Do not create review items or resolve competing candidates.

opening extraction rules (scalar facts only in this stage):
- Emit one Evidence record per atomic property candidate.
- Do not infer missing quantity as 1.
- Do not infer category from ambiguous wording.
- Do not infer rough opening dimensions from nominal dimensions.
- Do not infer king/jack/cripple/sill framing requirements.
- Do not calculate framing quantities.
- Do not create review items or resolve competing candidates.

opening kingStudCount extraction rules (this stage):
- Emit kingStudCount only when the page text explicitly states the king-stud
  count for that opening (examples: "King studs: 2", "2 king studs",
  "3 king studs").
- Use propertyPath kingStudCount with a positive integer candidateValue.
- Do not infer kingStudCount from opening category, opening width, wall type,
  header presence, conventional framing practice, number of sides, or diagrams
  unless the source explicitly states the count.
- If the source does not explicitly state a king-stud count, omit kingStudCount
  Evidence entirely. Do not default to 2 or any other value in extraction.

opening jackStudCount extraction rules (this stage):
- Emit jackStudCount only when the page text explicitly states the jack or
  trimmer stud count for that opening (examples: "Jack studs: 2",
  "2 jack studs", "Trimmers: 2", "2 trimmer studs").
- Use propertyPath jackStudCount with a positive integer candidateValue for the
  total jack/trimmer count per opening occurrence.
- Do not infer jackStudCount from opening category, opening width, wall type,
  header size/span, king-stud count, IRC tables, or conventional framing
  practice.
- If the source does not explicitly state a jack/trimmer count, omit
  jackStudCount Evidence entirely. Do not default to 2 or any other value.

opening wall-association extraction rules (this stage):
- Emit parentWallTag only when the page text explicitly states which wall
  tag owns the opening (example: "O-001 in Wall W-001").
- Use the exact wall tag string from the plan as candidateValue.
- Do not emit ObjectIds, WS-* segment IDs, or parentObjectId values.
- Do not infer a parent wall from proximity, layout, or header references.
- Do not infer parentWallTag when the association is missing or ambiguous.

opening header-association extraction rules (this stage):
- Emit headerMemberTag only when the page text explicitly states which header
  tag serves the opening (example: "Header HDR-001 at Opening O-001" may also
  be represented on the opening as headerMemberTag HDR-001).
- Use the exact header tag string from the plan as candidateValue.
- Do not emit ObjectIds, SM-* IDs, or headerMemberId values.
- Do not infer header associations from opening width, category, or proximity.
- Do not infer headerMemberTag when the association is missing or ambiguous.

sheathing extraction rules (this stage):
- Emit one Evidence record per atomic property candidate.
- Do not infer panel type or thickness from wall assembly.sheathing strings.
- Do not calculate sheathing square footage from wall length and height.
- Do not convert square footage to sheets or apply waste.
- Do not infer covered walls from proximity; use coveredWallTag only when
  explicitly stated.
- Emit areaSquareFeet only when the page text explicitly states the sheathing
  coverage area in square feet for that area tag.
- Do not create review items or resolve competing candidates.

floor-framing extraction rules (this stage):
- Emit one Evidence record per atomic property candidate.
- Do not calculate joist count or joist linear footage.
- Do not derive joistLayoutLengthFeet from areaSquareFeet, room polygons, or
  diagrams.
- Do not infer joist spacing, joist size, joist type, or span direction.
- Emit joistLayoutLengthFeet only when the page text explicitly states the
  floor bay length along the joist spacing axis (perpendicular to span), in
  feet, for that floor area tag.
- If the source does not explicitly establish joistLayoutLengthFeet, omit it.
- Emit joistMemberLengthFeet only when the page text explicitly states the
  installed / common joist member (piece) length for that floor area tag
  (examples: "Joist member length: 12 feet", "Joists: 12 ft long").
- Do not derive joistMemberLengthFeet from areaSquareFeet,
  joistLayoutLengthFeet, walls, clear span alone, dimensions not identified as
  joist member length, IRC/span tables, or generic construction practice.
- Do not treat clear span as joistMemberLengthFeet unless the source explicitly
  identifies that value as the installed/member length.
- If the source does not explicitly establish joistMemberLengthFeet, omit it.
  Do not default or assume a member length.
- Do not create review items or resolve competing candidates.

roof-framing extraction rules (this stage):
- Emit one Evidence record per atomic property candidate.
- Do not calculate common-rafter count or rafter linear footage.
- Do not derive rafterLayoutLengthFeet from areaSquareFeet, pitch, diagrams,
  or geometric guesses.
- Do not infer framing type, member size, member spacing, or span direction.
- Emit rafterLayoutLengthFeet only when the page text explicitly states the
  roof plane length along the common-rafter spacing axis (perpendicular to
  span), in feet, for that roof plane tag (examples: "Rafter layout length:
  20 feet", "Joist/rafter spacing-axis length: 20 ft").
- If the source does not explicitly establish rafterLayoutLengthFeet, omit it.
- Do not derive rafter length from pitch, horizontal run, span tables, or
  IRC tables.
- Do not invent hip, valley, or jack rafter quantities.
- Do not convert truss systems into stick common-rafter counts.
- Pitch and areaSquareFeet may be emitted when explicitly stated, but they are
  not inputs to common-rafter count.
- Do not create review items or resolve competing candidates.

structural-member opening-association extraction rules (this stage):
- Emit supportedOpeningTag only when the page text explicitly states which
  opening tag the header serves (example: "Header HDR-001 at Opening O-001").
- Use the exact opening tag string from the plan as candidateValue.
- Do not emit ObjectIds or supportedObjectIds values.
- Do not infer supportedOpeningTag from location wording unless an explicit
  opening tag is present in the source text.
- Do not infer supportedOpeningTag when the association is missing or ambiguous.

candidateValue:
- Emit only the extracted scalar: string, number, boolean, or null.
- Do not wrap values in objects or add units as a separate field.
- Emit a number only when the source states a numeric quantity in the
  unit implied by the property path, or in unambiguous feet-inch notation
  for *Feet paths, or inches/O.C. for *Inches paths.
- Examples: "20 ft" -> 20 for lengthFeet; "16 in O.C." -> 16 for
  assembly.studSpacingInches; 8 ft or 8'-0" -> 8 for assembly.heightFeet;
  "three plates" -> 3 for assembly.plateCount.
- If the unit is missing, mixed, or would require a guess, emit the quoted
  source string instead of a number.
- Do not coerce extracted text into resolved enumerations. Preserve the
  plan wording when it is the candidate (example: "wood stud wall").

Return JSON only. No markdown. No explanation.

JSON shape:
{
  "evidence": [
    {
      "id": "E-W001-CLASS",
      "type": "note",
      "relationship": "supports",
      "description": "Plan note states the wall type.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": "Floor Plan - Level 1",
          "pageLabel": "Floor Plan - Level 1",
          "revision": null
        },
        "region": null,
        "elementLabel": "W-001",
        "detailNumber": null,
        "sectionNumber": null,
        "scheduleName": null,
        "noteReference": null
      },
      "originalText": "Wall W-001: new exterior non-bearing wood stud wall",
      "references": [],
      "subjectKind": "wall",
      "subjectKey": "W-001",
      "propertyPath": "wallType",
      "candidateValue": "wood stud wall"
    },
    {
      "id": "E-W001-SPACING",
      "type": "dimension",
      "relationship": "supports",
      "description": "Plan note states stud spacing.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": "Floor Plan - Level 1",
          "pageLabel": "Floor Plan - Level 1",
          "revision": null
        },
        "region": null,
        "elementLabel": "W-001",
        "detailNumber": null,
        "sectionNumber": null,
        "scheduleName": null,
        "noteReference": null
      },
      "originalText": "studs 2x4 at 16 in O.C.",
      "references": [],
      "subjectKind": "wall",
      "subjectKey": "W-001",
      "propertyPath": "assembly.studSpacingInches",
      "candidateValue": 16
    },
    {
      "id": "E-W002-LENGTH",
      "type": "dimension",
      "relationship": "supports",
      "description": "Plan note states wall length for W-002.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": "Floor Plan - Level 1",
          "pageLabel": "Floor Plan - Level 1",
          "revision": null
        },
        "region": null,
        "elementLabel": "W-002",
        "detailNumber": null,
        "sectionNumber": null,
        "scheduleName": null,
        "noteReference": null
      },
      "originalText": "12 ft",
      "references": [],
      "subjectKind": "wall",
      "subjectKey": "W-002",
      "propertyPath": "lengthFeet",
      "candidateValue": 12
    },
    {
      "id": "E-HDR-001-CATEGORY",
      "type": "note",
      "relationship": "supports",
      "description": "Plan note states the header category.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": "Floor Plan - Level 1",
          "pageLabel": "Floor Plan - Level 1",
          "revision": null
        },
        "region": null,
        "elementLabel": "HDR-001",
        "detailNumber": null,
        "sectionNumber": null,
        "scheduleName": null,
        "noteReference": null
      },
      "originalText": "HDR-001 Header LVL 1.75x11.875 6 ft Quantity: 1 Over Window W-001",
      "references": [],
      "subjectKind": "structural-member",
      "subjectKey": "HDR-001",
      "propertyPath": "category",
      "candidateValue": "header"
    },
    {
      "id": "E-HDR-001-MATERIAL",
      "type": "note",
      "relationship": "supports",
      "description": "Plan note states the header material.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": "Floor Plan - Level 1",
          "pageLabel": "Floor Plan - Level 1",
          "revision": null
        },
        "region": null,
        "elementLabel": "HDR-001",
        "detailNumber": null,
        "sectionNumber": null,
        "scheduleName": null,
        "noteReference": null
      },
      "originalText": "Material: lvl",
      "references": [],
      "subjectKind": "structural-member",
      "subjectKey": "HDR-001",
      "propertyPath": "materialType",
      "candidateValue": "lvl"
    },
    {
      "id": "E-HDR-001-LENGTH",
      "type": "dimension",
      "relationship": "supports",
      "description": "Plan note states the header length.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": "Floor Plan - Level 1",
          "pageLabel": "Floor Plan - Level 1",
          "revision": null
        },
        "region": null,
        "elementLabel": "HDR-001",
        "detailNumber": null,
        "sectionNumber": null,
        "scheduleName": null,
        "noteReference": null
      },
      "originalText": "Length: 6 ft",
      "references": [],
      "subjectKind": "structural-member",
      "subjectKey": "HDR-001",
      "propertyPath": "lengthFeet",
      "candidateValue": 6
    }
  ]
}

Allowed evidence.type values:
geometry, tag, dimension, schedule, detail, section, note, callout,
specification, manufacturer-document, cross-sheet-agreement,
repetition-pattern, user-input, other

Construction Brain context for this extraction stage:

${knowledgeBlock}`;
}

function buildUserPrompt(input: {
  pages: PlanPage[];
  buildingAssemblies: ExtractFramingEvidenceInput["buildingAssemblies"];
}): string {
  const pageBlocks = input.pages
    .map((page) => {
      return [
        `## Page ${page.pageNumber}`,
        `sheetId: ${page.sheetId ?? "null"}`,
        `label: ${page.label ?? "null"}`,
        "",
        page.textContent.trim(),
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return `Extract framing evidence from these plan pages.

Known assemblies from prior stage (context only, not plan text):
${JSON.stringify(input.buildingAssemblies, null, 2)}

Page text:
${pageBlocks}`;
}

/**
 * Calls Claude to extract structured framing evidence from plan page text.
 */
export async function extractFramingEvidenceViaClaude(
  input: ExtractFramingEvidenceInput,
): Promise<ExtractedFramingEvidencePayload> {
  const pages = selectPagesForExtraction(
    input.planIndex,
    input.pageClassification,
    input.planReadingOrder,
  );

  if (pages.length === 0) {
    throw new Error(
      "No framing-relevant pages are available for Anthropic evidence extraction.",
    );
  }

  const knowledge = await loadKnowledgeFiles(EXTRACTION_KNOWLEDGE_PATHS);
  const knowledgeBlock = formatKnowledgeForPrompt(knowledge);

  return runClaudeJson({
    systemPrompt: buildSystemPrompt(knowledgeBlock),
    userPrompt: buildUserPrompt({
      pages,
      buildingAssemblies: input.buildingAssemblies,
    }),
    schema: extractedFramingEvidencePayloadSchema,
    label: "extracted framing evidence",
    // Multi-object plan slices can exceed 8192 output tokens; 16k covers the current proof fixture.
    maxTokens: 16384,
  });
}

export { buildSystemPrompt, selectPagesForExtraction };
