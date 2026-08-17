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

Rules:
- Extract only what is supported by the provided page text.
- Do not invent walls, dimensions, assemblies, openings, or quantities.
- Prefer multiple atomic evidence records over one overloaded record.
- Never calculate material quantities.
- Missing or unclear facts should simply omit evidence; do not guess.
- Leave source.region null unless coordinates are explicitly provided.
- Use evidence IDs matching this pattern: E-<OBJECT>-<ASPECT> (example: E-W001-GEOMETRY).
- IDs may only use letters, numbers, and . _ : -
- originalText must quote or closely paraphrase the supporting plan text.
- source.page.pageNumber and sheetId must match the provided page catalog.
- relationship should be "supports" unless the text clearly conflicts.

Return JSON only. No markdown. No explanation.

JSON shape:
{
  "evidence": [
    {
      "id": "E-W001-CLASS",
      "type": "note",
      "relationship": "supports",
      "description": "...",
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
      "originalText": "...",
      "references": []
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

Known assemblies from prior stage:
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
  });
}

export { selectPagesForExtraction };
