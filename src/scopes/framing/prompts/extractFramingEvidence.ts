import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages.js";

import { runClaudeJson } from "../../../ai/anthropic/runClaudeJson.js";
import {
  formatKnowledgeForPrompt,
  loadKnowledgeFiles,
} from "../../../core/knowledge/loadKnowledge.js";
import {
  buildPlanPagesUserContent,
  countVisualImageBlocks,
} from "../../../plans/buildPlanPagesUserContent.js";
import type { PlanIndex, PlanPage } from "../../../plans/PlanIndex.js";
import { pageNeedsVisual } from "../../../plans/pageNeedsVisual.js";
import type { PlanPageVisual, PlanVisualSet } from "../../../plans/PlanPageVisual.js";
import type {
  PlanPageTileSet,
  PlanPageVisualTile,
} from "../../../plans/PlanPageVisualTile.js";
import {
  DEFAULT_PAGE_TILE_GRID,
  DEFAULT_PAGE_TILE_SOURCE_SCALE,
} from "../../../plans/PlanPageVisualTile.js";
import { renderPlanPageVisuals } from "../../../plans/renderPlanPageVisuals.js";
import { tilePlanPageVisual } from "../../../plans/tilePlanPageVisual.js";
import type { ExtractionPageBundle } from "../../../plans/ExtractionPageBundle.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../../plans/visualImageBudget.js";
export { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST };

import {
  extractedFramingEvidencePayloadSchema,
  type ExtractedFramingEvidencePayload,
  type PageClassificationPayload,
  type PlanReadingOrderPayload,
} from "../schemas/framing-artifacts.schema.js";
import { resolveExtractionBrainPackPaths } from "../extraction/framingExtractionBrainPacks.js";

export interface ExtractFramingEvidenceInput {
  planIndex: PlanIndex;
  pageClassification: PageClassificationPayload;
  planReadingOrder: PlanReadingOrderPayload;
  buildingAssemblies: {
    assemblyNames: string[];
    notes: string[];
  };
  /**
   * Optional pre-rendered page visuals. When omitted, pages with empty text
   * layers are rendered on demand into `visualOutputDir` (or a temp directory).
   */
  pageVisuals?: PlanVisualSet | readonly PlanPageVisual[];
  /** Output directory for on-demand page renders. */
  visualOutputDir?: string;
  /** pdf.js render scale for on-demand full-page context visuals. Default 1. */
  visualScale?: number;
  /**
   * Optional pre-built tile sets. When omitted and page tiles are enabled,
   * tiles are generated from a higher-resolution page render.
   */
  pageTiles?: readonly PlanPageTileSet[] | ReadonlyMap<number, readonly PlanPageVisualTile[]>;
  /** Directory root for on-demand tile crops / tile-source renders. */
  tileOutputDir?: string;
  /** pdf.js scale for the tile crop source render. Default 2. */
  tileSourceScale?: number;
  /** Overlapping grid columns. Default 4. */
  tileColumns?: number;
  /** Overlapping grid rows. Default 3. */
  tileRows?: number;
  /** Tile overlap fraction in [0, 1). Default 0.2. */
  tileOverlapFraction?: number;
  /**
   * Visual mode for empty-text pages:
   * - full-page-and-tiles (default): whole-sheet context + overlapping tiles
   * - full-page: B1.1 behavior
   * - tiles: detail tiles only
   */
  pageVisualMode?: "full-page-and-tiles" | "full-page" | "tiles";
  /**
   * Optional routed page bundle. When present, Stage 5 only extracts from the
   * bundle's ordered pages and applies per-member visual detail levels.
   */
  extractionBundle?: ExtractionPageBundle;
  /** Invoked once per Anthropic messages API call (including schema repair). */
  onApiCall?: () => void;
  /** Invoked with token usage after each Anthropic messages API call. */
  onUsage?: (usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number | null;
    cacheReadInputTokens: number | null;
  }) => void;
}

function selectPagesForExtraction(
  planIndex: PlanIndex,
  pageClassification: PageClassificationPayload,
  planReadingOrder: PlanReadingOrderPayload,
  extractionBundle?: ExtractionPageBundle,
): PlanPage[] {
  const pagesByNumber = new Map(
    planIndex.pages.map((page) => [page.pageNumber, page]),
  );

  if (extractionBundle) {
    return extractionBundle.orderedPageNumbers
      .map((pageNumber) => pagesByNumber.get(pageNumber))
      .filter((page): page is PlanPage => page !== undefined);
  }

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

  return pageNumbers
    .map((pageNumber) => pagesByNumber.get(pageNumber))
    .filter((page): page is PlanPage => page !== undefined);
}

function buildSystemPrompt(knowledgeBlock: string): string {
  return `You extract framing evidence from construction plan page text and/or
attached page visuals for a deterministic takeoff engine.

Evidence is extracted candidate state, not resolved construction truth.
Do not assign final ObjectIds, create ResolutionTraces, apply assumptions,
choose a winner among conflicting candidates, or calculate quantities.

Rules:
- Extract only what is supported by the provided page text and/or attached
  page visuals for that pageNumber.
- Do not invent walls, dimensions, assemblies, openings, or quantities.
- Prefer exact plan wording in originalText when text is readable; when a fact
  is visible only in a diagram/image, summarize the visible label/callout
  faithfully in originalText without inventing unreadable characters.
- If a value is missing or ambiguous, omit that property rather than guessing.
- Emit one Evidence record per atomic property candidate.
- Conflicting candidates must remain separate Evidence records.
- Do not resolve, validate, or calculate takeoff quantities.
- Do not emit Assumed Facts, Review Items, or resolved construction objects.
- When a page has both text and visuals, prefer corroborating both; never invent
  from construction convention alone.
- Do not copy sheet IDs, titles, originalText, or candidate values from the
  example JSON unless they appear in the provided page text or page visual.
- Prior-stage assembly names are context only, not plan evidence.
- When a page visual is attached, treat it as source context for that
  pageNumber only. Prefer explicit printed marks over guesses.
- Emit one Evidence record per subjectKind + subjectKey + propertyPath + candidateValue.
- Do not hide multiple construction properties inside one description.
- Never calculate material quantities.
- If a property is not evidenced, omit the record. Do not guess.
- Use candidateValue null only when the source mentions the property but
  does not provide an extractable value.
- Leave source.region null unless coordinates are explicitly provided.
- Tile provenance: when a fact is read from an attached Tile image block, set
  source.tileId to that block's exact tileId (example: t-r0-c1). When a fact is
  read only from page text or only from the Full Sheet image, leave
  source.tileId null. If both full sheet and a tile show the same fact, set
  tileId to the tile only when you actually used that tile image to read the
  fact; otherwise leave null. Do not leave tileId null for every record merely
  because a full sheet was also attached. Do not invent tileIds or semantic
  region names. Do not guess a tileId by spatial post-processing after the fact.
- Optionally set source.region to the tile's geometryNormalized box with
  coordinateSpace "normalized" when using a tile.
- Use evidence IDs matching this pattern: E-<SUBJECT>-<ASPECT>
  (example: E-W001-SPACING). Make IDs unique when the same property has
  more than one candidate (example: E-W001-SPACING-NOTE).
- Evidence IDs must be unique within a single extraction response. Prefer
  stable aspect names so the same plan mark can share a subjectKey across
  pages/passes; do not invent pass-specific subjectKeys for the same tagged
  object.
- IDs may only use letters, numbers, and . _ : -
- originalText must quote or closely paraphrase the supporting plan text or
  visible tile text.
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
- Structural-member extraction covers explicitly scheduled or tagged members
  (headers, beams, girders, posts/columns, and similar) when the source
  identifies them. Do not invent members that are not tagged or scheduled.
- Opening extraction covers scalar opening facts and explicit associations only.
- subjectKind + subjectKey identify the extraction cluster; propertyPath identifies
  the candidate within that cluster.
- Do not mint ObjectIds or resolved object types here.
- The same Stage 5 Evidence artifact may contain "wall", "structural-member",
  "opening", "sheathing-system", "sheathing-area", "floor-framing-system",
  "floor-framing-area", "roof-framing-system", and "roof-plane" records
  simultaneously.

subjectKey:
- Use the most stable plan-derived identifier for the future object/cluster.
- Prefer the exact wall mark, opening mark, member mark, bay/plane label,
  schedule mark, or callout text as printed on the plan.
- Preserve realistic plan marks as-is (examples of form only: W1, W-001,
  Wall Type A, D04, Window 3, H2, HDR-001, BAY A, GABLE A, FLOOR SYS A).
  Do not rewrite a plan mark into a different invented code.
- When a bare tag/mark line is present for a wall, opening, structural member,
  sheathing system/area, floor system/area, or roof system/plane, use that exact
  string as subjectKey for every property belonging to that object.
- When multiple labeled marks appear, emit separate Evidence clusters for each
  mark. Reuse the same subjectKey for every property belonging to that object.
- Never merge facts from one labeled object into another object's subjectKey.
- Conflicting values stay separate Evidence records within the appropriate
  subjectKey only.
- This is an extraction cluster key, not a resolved ObjectId.
- Evidence from multiple pages/sheets that concerns the same tagged object
  must reuse the same subjectKey (cross-page schedule + plan callout).
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
  parentWallTag with the exact plan wall mark (examples of form: W1, W-001).
- Examples for openings (explicit header association in this stage):
  headerMemberTag with the exact plan header mark (examples of form: H2, HDR-001).
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

structural-member extraction rules:
- Emit one Evidence record per atomic property candidate.
- Do not infer missing quantity as 1.
- Do not infer category from ambiguous wording.
- Do not infer materialType from size.
- Do not infer location if not explicitly evidenced.
- Do not calculate linear footage.
- Do not infer built-up plyCount.
- Do not invent relationships to walls, openings, or other objects beyond
  explicit supportedOpeningTag / schedule location marks.
- Do not create review items or resolve competing candidates.

opening extraction rules (scalar facts only in this stage):
- Emit one Evidence record per atomic property candidate.
- Do not infer missing quantity as 1.
- When a schedule row includes an explicit quantity column/value for that mark,
  emit quantity from that column.
- When a schedule distinguishes NOMINAL vs ROUGH opening sizes, emit
  dimensions.nominal* and dimensions.rough* separately. Do not copy rough into
  nominal or nominal into rough.
- Do not infer category from ambiguous wording.
- Do not infer rough opening dimensions from nominal dimensions.
- Do not infer king/jack/cripple/sill framing requirements.
- Do not calculate framing quantities.
- Do not create review items or resolve competing candidates.

opening visual floor-plan search rules (this stage):
- On plan/floor-plan visuals (full sheet and tiles), systematically search for
  construction openings across the complete primary plan viewport. Do not stop
  after finding one prominent opening (for example a labeled garage door).
- Inspect each primary wall region (via full sheet context and each attached
  tile) for door swings, window symbols, garage-door openings, cased openings,
  and explicit opening labels or dimension strings adjacent to those symbols.
- Emit a separate opening subjectKey for each distinct visually identified
  opening. Do not collapse multiple doors/windows into one subject merely
  because they share a similar size label.
- Prefer exact printed marks as subjectKey when present (examples of form only:
  D1, W12, GARAGE DOOR, WINDOW TYPE MARK, 2'-4" x 6'-8" DOOR). When several openings
  share an identical size string, keep clusters separate by appending a short
  distinguishing visible cue printed next to that opening (examples of form
  only: adjacent room name, "ENTRY", "CLOSET") — use only text visible on the
  plan. Do not mint ObjectIds or invent marks.
- A bare wall-line interruption without a readable door/window/garage symbol or
  opening label is not enough; omit that candidate rather than inventing an
  opening.
- Emit category only when the symbol/label supports it: door, window,
  garage-door, cased, or other/unknown when ambiguous. Prefer garage-door when
  the plan explicitly labels a garage door opening.
- Emit dimensions.nominalWidthFeet / dimensions.nominalHeightFeet only when an
  explicit width x height (or equivalent) label is readable for that opening,
  or when a schedule/type key explicitly supplies those sizes for that opening's
  mark (see opening type-mark / schedule dimension rules). Convert feet-inches
  labels to decimal feet without inventing missing parts. Do not infer standard
  door/window sizes or copy one opening's dimensions onto another.
- Emit headerMemberTag only when a header/member mark is explicitly linked to
  that opening by callout/leader/note (not by vague proximity alone). Attach
  the header tag to the correct opening subject only. If the same association is
  already emitted as structural-member supportedOpeningTag, you may omit the
  reciprocal opening headerMemberTag — deterministic linking can invert one
  explicit relationship. Prefer one clear source-grounded link over duplicate
  reciprocal narration.
- Emit parentWallTag only when the source explicitly states the wall mark that
  owns the opening. Do not invent wall marks from shear-wall type notes alone
  or from layout proximity.
- If an opening is visible but a property is unreadable/ambiguous, omit that
  property. Do not invent jack/king counts, header sizes, quantities, or
  framing math.
- Opening search applies in addition to schedule-based opening extraction; both
  may contribute Evidence for the same subjectKey across pages.

opening type-mark / schedule dimension rules (this stage):
- Opening type marks (examples of form only: compact door codes, window type
  codes) identify the opening subject. They do not authorize dimensions by
  themselves.
- Emit opening dimensions from a type mark only when the source explicitly
  defines how that mark maps to width/height (schedule row, legend, note, or
  printed W×H beside the opening). Do not decode industry size conventions
  without that explicit key.
- When an opening label itself prints explicit width x height (examples of form
  only: 3'-0" x 6'-8", 22" x 30"), emit dimensions.nominalWidthFeet /
  dimensions.nominalHeightFeet for that opening subject.
- A schedule-derived opening property may attach only when an explicit
  unambiguous key links plan opening mark → schedule/type row → property.
  Do not associate dimensions by visual similarity, ordering, proximity alone,
  construction convention, or "standard" sizes.
- If the current pages do not contain sufficient authority for a dimension,
  omit it. Missing is preferable to inferred.

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
- Emit parentWallTag only when the source (page text or visual label/callout)
  explicitly states which wall tag owns the opening (example of form:
  "O-001 in Wall W-001").
- Use the exact wall tag string from the plan as candidateValue.
- Do not emit ObjectIds, WS-* segment IDs, or parentObjectId values.
- Do not infer a parent wall from proximity, layout, or header references.
- Do not infer parentWallTag when the association is missing or ambiguous.

opening header-association extraction rules (this stage):
- Emit headerMemberTag only when the source (page text or visual callout/leader)
  explicitly associates a header/member mark with the opening (example of form:
  "Header HDR-001 at Opening O-001", or a plan leader from a header mark to
  that opening).
- Use the exact header tag string from the plan as candidateValue.
- Do not emit ObjectIds, SM-* IDs, or headerMemberId values.
- Do not infer header associations from opening width, category, or vague
  proximity without a linking callout/leader/note.
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
- MAX SPAN / SPAN = X callouts (examples: "MAX. SPAN = 17'-0"") are member-length
  or span facts: emit joistMemberLengthFeet when the source identifies installed
  member length; never emit spanDirection from MAX SPAN values.
- Do not emit parentSystemTag merely because a floor area and floor system appear
  on the same sheet. Emit parentSystemTag only when the source explicitly states
  the parent system reference for that area tag.
- Emit joistLayoutLengthFeet only when the page text explicitly establishes the
  floor bay length along the joist spacing axis (perpendicular to span), in
  feet, for that floor area — including orthogonal bay dimensions when span
  direction is stated and the dimension is clearly the spacing-axis length.
- In description for joistLayoutLengthFeet evidence, identify spacing-axis
  authority when the source makes that axis explicit.
- If the source does not explicitly establish joistLayoutLengthFeet, omit it.
- Emit joistMemberLengthFeet only when the page text explicitly states the
  installed / common joist member (piece) length for that floor area tag
  (examples of form: member-length callouts, MAX SPAN limits, "joists … long").
- Do not derive joistMemberLengthFeet from areaSquareFeet,
  joistLayoutLengthFeet, walls, clear span alone without explicit member-length
  identification, IRC/span tables, or generic construction practice.
- Do not treat clear span as joistMemberLengthFeet unless the source explicitly
  identifies that value as the installed/member length (MAX SPAN callouts qualify).
- If the source does not explicitly establish joistMemberLengthFeet, omit it.
  Do not default or assume a member length.
- Do not create review items or resolve competing candidates.

roof-framing extraction rules (this stage):
- Emit one Evidence record per atomic property candidate.
- Do not calculate common-rafter count or rafter linear footage.
- Do not derive rafterLayoutLengthFeet from areaSquareFeet, pitch, diagrams,
  or geometric guesses.
- Do not infer framing type, member size, member spacing, or span direction.
- Emit rafterLayoutLengthFeet only when the page text explicitly establishes the
  roof plane length along the common-rafter spacing axis (perpendicular to
  span), in feet, for that roof plane — including gable/ridge length wording
  when span direction makes that axis unambiguous.
- If the source does not explicitly establish rafterLayoutLengthFeet, omit it.
- Do not derive rafter length from pitch, horizontal run, span tables, or
  IRC tables.
- Do not invent hip, valley, or jack rafter quantities.
- Do not convert truss systems into stick common-rafter counts.
- Pitch and areaSquareFeet may be emitted when explicitly stated, but they are
  not inputs to common-rafter count.
- Do not create review items or resolve competing candidates.

structural-member opening-association extraction rules (this stage):
- Emit supportedOpeningTag when the source (page text or visual callout/leader)
  explicitly associates a header/member with an opening identity (examples of
  form: "Header HDR-001 at Opening O-001", or a plan leader tying a member mark
  to a labeled opening).
- Use the exact opening identity string from the plan as candidateValue (same
  string used as the opening subjectKey when possible).
- Do not emit ObjectIds or supportedObjectIds values.
- Do not infer supportedOpeningTag from vague proximity without a linking
  callout/leader/note.
- Do not require a reciprocal opening headerMemberTag for the same association;
  one explicit direction is enough for deterministic linking later.

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
- Exception for schema-token properties only: when the plan meaning is
  unambiguous, emit the engine token for bearingStatus
  (bearing | non-bearing | unknown), opening category
  (door | window | ...), structural-member category
  (header | beam | girder | post | column | ...), and similar enum fields.
  If ambiguous, omit rather than guess.

schedule and compact-notation reading rules (this stage):
- Read schedule tables and pipe/column rows as atomic facts under the row mark.
  Example form: a header schedule row MARK | SIZE/MATERIAL | LENGTH | QTY maps to
  structural-member Evidence for that MARK (category, size, materialType,
  lengthFeet, quantity) when those columns are explicit.
- Schedule-row grounding: a schedule-derived property belongs only to the
  explicitly keyed row/column subject shown in the source. Attach assembly,
  material, fastener, or similar cells only to that row's mark.
- Do not propagate a schedule cell to neighboring marks, visually similar marks,
  unlisted marks, or marks that appear only as detail references on another
  sheet unless that exact mark has its own readable schedule row with that cell.
- Do not reason that because SW-class / wall-type / member-class rows nearby use
  a material, another mark "probably" uses it too. Missing is preferable to
  generalized Evidence.
- When a row cell explicitly points to a detail/note instead of stating a value,
  emit that reference (for example detailReference / specificationReference /
  noteReference) rather than inventing the missing cell value from other rows.
- Compact assembly callouts such as '2x6 SPF STUDS @ 16" O.C.' may yield separate
  Evidence for stud size, spacing, and material when clearly stated together.
- When the plan identifies a wood stud wall (for example "WOOD STUD" / "wood stud
  wall"), preserve that wood-stud identity in wallType (and material when stated).
  Opening framing eligibility depends on wood-stud identity.
- Do not invent columns that the schedule does not show (especially jack counts,
  sheathing SF, member lengths, or king counts).
- Prefer short originalText quotes from the supporting schedule/callout line.
- Keep JSON compact: one Evidence record per atomic fact; avoid duplicating the
  same fact with long restated prose.
- Keep description to one short clause (<= 12 words). Keep originalText to the
  shortest supporting quote. Leave unused source fields null. Do not expand
  schedule rows into narrative paragraphs.

floor / roof spacing-axis dimension rules (this stage):
- When the source states joist/rafter span (or framing) direction AND an explicit
  dimension that is clearly the length measured along the axis perpendicular to
  that span (spacing axis) for a named bay/plane, emit joistLayoutLengthFeet or
  rafterLayoutLengthFeet for that area/plane.
  Also emit spanDirection for the bay/plane when the source states span (for
  example "SPAN N-S" / "RAFTERS SPAN N-S").
  Examples of form only: bay dimension labeled orthogonal to stated span;
  gable/ridge length for commons that span perpendicular to the gable.
- Do not derive layout length from areaSquareFeet, pitch, or unlabeled overall
  building dimensions.
- Emit joistMemberLengthFeet only when the source explicitly identifies installed
  / common joist piece length (for example wording of the form
  "JOISTS … LONG" or "joist member length …").
- Never invent rafter member length; V1 does not take roof common LF from
  extraction.

Return JSON only. No markdown. No explanation.

JSON shape (illustrative; do not copy values unless present in page text):
{
  "evidence": [
    {
      "id": "E-W001-SPACING",
      "type": "dimension",
      "relationship": "supports",
      "description": "Stud spacing callout.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": null,
          "pageLabel": null,
          "revision": null
        },
        "region": null,
        "tileId": null,
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
      "description": "Wall length dimension.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": null,
          "pageLabel": null,
          "revision": null
        },
        "region": null,
        "tileId": "t-r0-c1",
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
      "type": "schedule",
      "relationship": "supports",
      "description": "Header schedule category.",
      "source": {
        "page": {
          "documentId": null,
          "pageNumber": 2,
          "sheetId": "A2.01",
          "sheetTitle": null,
          "pageLabel": null,
          "revision": null
        },
        "region": null,
        "tileId": null,
        "elementLabel": "HDR-001",
        "detailNumber": null,
        "sectionNumber": null,
        "scheduleName": null,
        "noteReference": null
      },
      "originalText": "HDR-001 Header",
      "references": [],
      "subjectKind": "structural-member",
      "subjectKey": "HDR-001",
      "propertyPath": "category",
      "candidateValue": "header"
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

function buildExtractionPreamble(
  buildingAssemblies: ExtractFramingEvidenceInput["buildingAssemblies"],
  extractionBundle?: ExtractionPageBundle,
): string {
  const bundleLines: string[] = [];
  if (extractionBundle) {
    bundleLines.push(
      "",
      `Extraction page bundle: ${extractionBundle.bundleId}`,
      `Scope intent: ${extractionBundle.intent}`,
      "Bundle page roles (source context only — not construction objects):",
    );
    for (const member of extractionBundle.members) {
      bundleLines.push(
        `- page ${member.pageNumber}: role=${member.role}, visual=${member.visualDetailLevel}` +
          (member.reason ? ` (${member.reason})` : ""),
      );
    }
    if (extractionBundle.intent === "referenced-detail") {
      const hasSelectedTiles = extractionBundle.members.some(
        (member) =>
          Array.isArray(member.selectedTileIds) &&
          member.selectedTileIds.length > 0,
      );
      bundleLines.push(
        "This is a referenced-detail observation pass reached via an explicit plan reference.",
        "Identify the explicitly referenced detail/callout on the provided visuals when visible.",
        "Extract source-grounded framing facts that belong to that referenced detail.",
        "A reference authorizes inspection; it does not assign every fact on the sheet to the originating subject.",
        "Only link facts to an existing subjectKey when the source explicitly identifies that same mark/tag.",
        "Do not calculate quantities. Do not invent jack/king/header framing math.",
        "Do not extract neighboring/unrelated detail callouts that are outside the requested detail.",
        hasSelectedTiles
          ? "Selected tiles are a higher-resolution view of the same page — set source.tileId when the fact was read from a Tile image block; leave tileId null if read only from the Full Sheet."
          : "Preserve pageNumber provenance; leave tileId null for full-sheet-only referenced passes.",
        ...extractionBundle.routingNotes
          .filter((note) => note.trim().length > 0)
          .map((note) => `Routing note: ${note}`),
      );
    } else {
      bundleLines.push(
        "The primary page is the detailed source for this pass.",
        "Supporting/global pages are project-level context only.",
        "Attribute each Evidence record to the pageNumber where the fact was actually observed.",
        "When the fact was read from a Tile image block, also set source.tileId to that tile's tileId.",
        "When the fact was read only from the Full Sheet or from page text, leave source.tileId null.",
        "Do not attribute global/support-page facts to the primary pageNumber.",
      );
    }
  }

  return `Extract framing evidence from these plan pages.

Known assemblies from prior stage (context only, not plan text):
${JSON.stringify(buildingAssemblies, null, 2)}
${bundleLines.join("\n")}

Each page block below is labeled with pageNumber. Attached full-sheet images and
tiles, when present, are visuals for that pageNumber only. Tile labels are
provenance identifiers (tileId + geometry), not semantic interpretations.`;
}


function visualsToMap(
  visuals: PlanVisualSet | readonly PlanPageVisual[] | undefined,
): Map<number, PlanPageVisual> {
  if (!visuals) {
    return new Map();
  }

  const list: readonly PlanPageVisual[] =
    "pages" in visuals ? visuals.pages : visuals;

  return new Map(list.map((visual) => [visual.pageNumber, visual]));
}

function tilesToMap(
  tiles:
    | readonly PlanPageTileSet[]
    | ReadonlyMap<number, readonly PlanPageVisualTile[]>
    | undefined,
): Map<number, PlanPageVisualTile[]> {
  if (!tiles) {
    return new Map();
  }

  if (Array.isArray(tiles)) {
    const tileSets = tiles as readonly PlanPageTileSet[];
    return new Map(
      tileSets.map((tileSet) => [tileSet.pageNumber, [...tileSet.tiles]]),
    );
  }

  const asMap = tiles as ReadonlyMap<number, readonly PlanPageVisualTile[]>;
  return new Map(
    [...asMap.entries()].map(([pageNumber, list]) => [pageNumber, [...list]]),
  );
}

/**
 * Resolves page visuals for Stage 5. Renders only pages that lack usable text
 * unless pre-rendered visuals are supplied for those pages.
 */
export async function resolvePageVisualsForExtraction(input: {
  planIndex: PlanIndex;
  pages: readonly PlanPage[];
  pageVisuals?: PlanVisualSet | readonly PlanPageVisual[];
  visualOutputDir?: string;
  visualScale?: number;
}): Promise<Map<number, PlanPageVisual>> {
  const provided = visualsToMap(input.pageVisuals);
  const missingPageNumbers = input.pages
    .filter((page) => pageNeedsVisual(page) && !provided.has(page.pageNumber))
    .map((page) => page.pageNumber);

  if (missingPageNumbers.length === 0) {
    return provided;
  }

  const outputDir =
    input.visualOutputDir ??
    (await mkdtemp(path.join(tmpdir(), "takeoff-bot-page-visuals-")));

  const rendered = await renderPlanPageVisuals({
    pdfPath: input.planIndex.pdfPath,
    pageNumbers: missingPageNumbers,
    outputDir,
    scale: input.visualScale,
  });

  for (const visual of rendered.pages) {
    provided.set(visual.pageNumber, visual);
  }

  return provided;
}

/**
 * Resolves overlapping page tiles for empty-text pages.
 * Crops from a higher-resolution page render (default scale 2).
 */
export async function resolvePageTilesForExtraction(input: {
  planIndex: PlanIndex;
  pages: readonly PlanPage[];
  pageTiles?:
    | readonly PlanPageTileSet[]
    | ReadonlyMap<number, readonly PlanPageVisualTile[]>;
  tileOutputDir?: string;
  tileSourceScale?: number;
  tileColumns?: number;
  tileRows?: number;
  tileOverlapFraction?: number;
}): Promise<Map<number, PlanPageVisualTile[]>> {
  const provided = tilesToMap(input.pageTiles);
  const missingPageNumbers = input.pages
    .filter((page) => pageNeedsVisual(page) && !provided.has(page.pageNumber))
    .map((page) => page.pageNumber);

  if (missingPageNumbers.length === 0) {
    return provided;
  }

  const rootDir =
    input.tileOutputDir ??
    (await mkdtemp(path.join(tmpdir(), "takeoff-bot-page-tiles-")));
  const sourceDir = path.join(rootDir, "tile-source");
  const cropsDir = path.join(rootDir, "tiles");

  const sourceSet = await renderPlanPageVisuals({
    pdfPath: input.planIndex.pdfPath,
    pageNumbers: missingPageNumbers,
    outputDir: sourceDir,
    scale: input.tileSourceScale ?? DEFAULT_PAGE_TILE_SOURCE_SCALE,
  });

  for (const sourcePageVisual of sourceSet.pages) {
    const pageTileDir = path.join(
      cropsDir,
      `page-${String(sourcePageVisual.pageNumber).padStart(4, "0")}`,
    );
    const tileSet = await tilePlanPageVisual({
      sourcePageVisual,
      outputDir: pageTileDir,
      columns: input.tileColumns ?? DEFAULT_PAGE_TILE_GRID.columns,
      rows: input.tileRows ?? DEFAULT_PAGE_TILE_GRID.rows,
      overlapFraction:
        input.tileOverlapFraction ?? DEFAULT_PAGE_TILE_GRID.overlapFraction,
    });
    provided.set(sourcePageVisual.pageNumber, tileSet.tiles);
  }

  return provided;
}

/**
 * Builds Stage 5 multimodal user content without calling Anthropic.
 * Used by extraction and by deterministic contract tests.
 */
export async function buildExtractionUserContent(input: {
  pages: readonly PlanPage[];
  buildingAssemblies: ExtractFramingEvidenceInput["buildingAssemblies"];
  visualsByPageNumber?: ReadonlyMap<number, PlanPageVisual>;
  tilesByPageNumber?: ReadonlyMap<number, readonly PlanPageVisualTile[]>;
  extractionBundle?: ExtractionPageBundle;
}): Promise<ContentBlockParam[]> {
  return buildPlanPagesUserContent({
    pages: input.pages,
    visualsByPageNumber: input.visualsByPageNumber,
    tilesByPageNumber: input.tilesByPageNumber,
    preambleText: buildExtractionPreamble(
      input.buildingAssemblies,
      input.extractionBundle,
    ),
  });
}

function assertVisualImageBudget(input: {
  pages: readonly PlanPage[];
  visualsByPageNumber: ReadonlyMap<number, PlanPageVisual>;
  tilesByPageNumber: ReadonlyMap<number, readonly PlanPageVisualTile[]>;
}): void {
  const imageCount = countVisualImageBlocks(input);
  if (imageCount <= MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST) {
    return;
  }

  throw new Error(
    `extractedEvidence: multimodal request would include ${imageCount} images, exceeding the safe single-request budget of ${MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST}. Use page routing / page bundles to scope Stage 5 to fewer pages before sending full-sheet context plus overlapping tiles.`,
  );
}

/**
 * Calls Claude to extract structured framing evidence from plan page text
 * and optional page visuals / tiles.
 */
export async function extractFramingEvidenceViaClaude(
  input: ExtractFramingEvidenceInput,
): Promise<ExtractedFramingEvidencePayload> {
  const pages = selectPagesForExtraction(
    input.planIndex,
    input.pageClassification,
    input.planReadingOrder,
    input.extractionBundle,
  );

  if (pages.length === 0) {
    throw new Error(
      "No framing-relevant pages are available for Anthropic evidence extraction.",
    );
  }

  const brainPackPaths = resolveExtractionBrainPackPaths(
    input.extractionBundle?.intent,
  );
  const knowledge = await loadKnowledgeFiles([...brainPackPaths]);
  const knowledgeBlock = formatKnowledgeForPrompt(knowledge);
  const systemPrompt = buildSystemPrompt(knowledgeBlock);
  const pageVisualMode = input.pageVisualMode ?? "full-page-and-tiles";
  const bundle = input.extractionBundle;

  const needsVisualChannel = pages.some((page) => pageNeedsVisual(page));
  if (!needsVisualChannel) {
    return runClaudeJson({
      systemPrompt,
      userPrompt: buildUserPrompt({
        pages,
        buildingAssemblies: input.buildingAssemblies,
      }),
      schema: extractedFramingEvidencePayloadSchema,
      label: "extracted framing evidence",
      // Multi-domain realistic plans can exceed 16k output tokens when verbose;
      // 32k + articulation rules covers current synthetic multi-page sets without
      // redesigning extraction into domain-scoped passes.
      maxTokens: 32768,
    });
  }

  const pagesNeedingFull = bundle
    ? pages.filter((page) => {
        const member = bundle.members.find((m) => m.pageNumber === page.pageNumber);
        return (
          member?.visualDetailLevel === "full-page" ||
          member?.visualDetailLevel === "full-page-and-tiles" ||
          member?.visualDetailLevel === "full-page-and-selected-tiles"
        );
      })
    : pageVisualMode === "full-page" || pageVisualMode === "full-page-and-tiles"
      ? pages
      : [];

  const pagesNeedingTiles = bundle
    ? pages.filter((page) => {
        const member = bundle.members.find((m) => m.pageNumber === page.pageNumber);
        return (
          member?.visualDetailLevel === "full-page-and-tiles" ||
          member?.visualDetailLevel === "full-page-and-selected-tiles" ||
          member?.visualDetailLevel === "selected-tiles"
        );
      })
    : pageVisualMode === "tiles" || pageVisualMode === "full-page-and-tiles"
      ? pages
      : [];

  const visualsByPageNumber =
    pagesNeedingFull.length > 0
      ? await resolvePageVisualsForExtraction({
          planIndex: input.planIndex,
          pages: pagesNeedingFull,
          pageVisuals: input.pageVisuals,
          visualOutputDir: input.visualOutputDir,
          visualScale: input.visualScale,
        })
      : new Map<number, PlanPageVisual>();

  const tilesByPageNumber =
    pagesNeedingTiles.length > 0
      ? await resolvePageTilesForExtraction({
          planIndex: input.planIndex,
          pages: pagesNeedingTiles,
          pageTiles: input.pageTiles,
          tileOutputDir: input.tileOutputDir,
          tileSourceScale: input.tileSourceScale,
          tileColumns: input.tileColumns,
          tileRows: input.tileRows,
          tileOverlapFraction: input.tileOverlapFraction,
        })
      : new Map<number, PlanPageVisualTile[]>();

  // Restrict to selectedTileIds when the bundle member requests localization.
  if (bundle) {
    for (const member of bundle.members) {
      const selected = member.selectedTileIds;
      if (!selected || selected.length === 0) {
        continue;
      }
      const level = member.visualDetailLevel;
      if (
        level !== "selected-tiles" &&
        level !== "full-page-and-selected-tiles"
      ) {
        continue;
      }
      const allowed = new Set(selected);
      const existing = tilesByPageNumber.get(member.pageNumber) ?? [];
      const filtered = existing.filter((tile) => allowed.has(tile.tileId));
      if (filtered.length === 0) {
        throw new Error(
          `extractFramingEvidenceViaClaude: none of selectedTileIds [${selected.join(", ")}] were available for page ${member.pageNumber}.`,
        );
      }
      tilesByPageNumber.set(member.pageNumber, filtered);
    }
  }

  assertVisualImageBudget({
    pages,
    visualsByPageNumber,
    tilesByPageNumber,
  });

  const userContent = await buildExtractionUserContent({
    pages,
    buildingAssemblies: input.buildingAssemblies,
    visualsByPageNumber,
    tilesByPageNumber,
    extractionBundle: bundle,
  });

  return runClaudeJson({
    systemPrompt,
    userContent,
    schema: extractedFramingEvidencePayloadSchema,
    label: "extracted framing evidence",
    maxTokens: 32768,
    onApiCall: input.onApiCall,
    onUsage: input.onUsage,
  });
}

export {
  buildSystemPrompt,
  buildUserPrompt,
  selectPagesForExtraction,
};
