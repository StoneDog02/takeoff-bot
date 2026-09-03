import type { SemanticDefinition } from "../compiler/schemas/semanticDefinition.schema.js";
import { extractScheduleFromRowBands } from "../compiler/semantic-definitions/extractScheduleFromRowBands.js";
import type { CompilerInvestigationFacade } from "./compilerInvestigationFacade.js";
import {
  extractKeyedNoteCitationSnippet,
  probeP1KeyedNoteSignal,
} from "./probeP1KeyedNoteSignal.js";
import type {
  ProjectDictionary,
  ProjectSemanticDefinition,
} from "./schemas/projectDictionary.schema.js";
import type { ProjectOrientationContext } from "./projectOrientationContext.js";

export type BuildOrientationDictionaryInput = {
  projectId: string;
  pdfPath: string;
  facade: CompilerInvestigationFacade;
  schedulePageNumber?: number;
  planPageNumber?: number;
};

export type BuildOrientationDictionaryResult = {
  dictionary: ProjectDictionary;
  orientationContext: ProjectOrientationContext;
  keyedNoteProbe: Awaited<ReturnType<typeof probeP1KeyedNoteSignal>>;
  selectedOwnershipRunKey: string | null;
};

function scheduleOcrToolCallId(
  page: number,
  row: number,
  columnId: string,
): string {
  return `schedule-p${page}-r${row}-${columnId}`;
}

function mapDefinitionsToDictionary(
  definitions: SemanticDefinition[],
): ProjectSemanticDefinition[] {
  return definitions.map((def) => ({
    semanticTypeKey: def.semanticTypeKey,
    sourcePage: def.sourcePageNumber,
    properties: def.properties.map((p) => ({
      propertyPath: p.propertyPath,
      rawText: p.rawText,
    })),
    status: "definition" as const,
    provenance: [
      {
        kind: "compiler" as const,
        pageNumber: def.sourcePageNumber,
        region: def.sourceRegion,
        toolCallId: scheduleOcrToolCallId(
          def.sourcePageNumber,
          def.provenance.rowIndex ?? 0,
          "row",
        ),
      },
    ],
  }));
}

/**
 * P2 orientation: L.6 schedule extraction + keyed-note probe + graphic-rule hypotheses.
 */
export async function buildOrientationDictionary(
  input: BuildOrientationDictionaryInput,
): Promise<BuildOrientationDictionaryResult> {
  const t0 = performance.now();
  const schedulePage = input.schedulePageNumber ?? 1;
  const planPage = input.planPageNumber ?? 4;

  await input.facade.precompilePages([planPage]);

  const rowBand = await extractScheduleFromRowBands({
    pdfPath: input.pdfPath,
    pageNumber: schedulePage,
    pageWidth: (await input.facade.ensurePageCompiled(schedulePage)).pageWidth,
    pageHeight: (await input.facade.ensurePageCompiled(schedulePage)).pageHeight,
  });

  for (const entry of rowBand.ocrCache) {
    input.facade.registerScheduleOcrEntry({
      toolCallId: scheduleOcrToolCallId(
        entry.pageNumber,
        entry.rowIndex,
        entry.columnId,
      ),
      pageNumber: entry.pageNumber,
      bbox: entry.cellBbox,
      imagePath: "",
      ocrText: entry.ocrText,
    });
  }

  const scheduleCompiled = await input.facade.ensurePageCompiled(schedulePage);
  const definitions = rowBand.block.definitions;
  const dictionaryDefinitions = mapDefinitionsToDictionary(definitions);

  const keyedNoteProbe = await probeP1KeyedNoteSignal({
    pdfPath: input.pdfPath,
    pageNumber: schedulePage,
    pageWidth: scheduleCompiled.pageWidth,
    pageHeight: scheduleCompiled.pageHeight,
    scheduleDefinitionsOnPage: definitions.length > 0,
  });

  const noteSnippet = extractKeyedNoteCitationSnippet(keyedNoteProbe.ocrText);
  const noteToolCallId = "orientation-p1-keyed-note";

  input.facade.registerScheduleOcrEntry({
    toolCallId: noteToolCallId,
    pageNumber: schedulePage,
    bbox: keyedNoteProbe.region,
    imagePath: "",
    ocrText: keyedNoteProbe.ocrText,
  });

  const lineAudit = await input.facade.getLineStyleObservations(planPage);
  let selectedOwnershipRunKey: string | null = null;
  for (const entry of lineAudit.entries) {
    if (
      entry.isHeavyLine &&
      entry.nearRunKey &&
      entry.distancePt != null &&
      entry.distancePt < 25
    ) {
      selectedOwnershipRunKey = entry.nearRunKey;
      break;
    }
  }

  const hypotheses: ProjectDictionary["hypotheses"] = [];

  if (keyedNoteProbe.hasSwKeyedNote || noteSnippet) {
    hypotheses.push({
      id: "hyp-sw-keyed-note",
      status: "established_rule",
      conventionClass: "keyed-note",
      claim: noteSnippet
        ? `Keyed note on S1.1: "${noteSnippet}" establishes shear-wall schedule dereference vocabulary.`
        : "Keyed note vocabulary SW_ on S1.1 associates plan shear-wall callouts with the shear wall schedule.",
      provenance: [
        {
          kind: "ocr",
          pageNumber: schedulePage,
          region: keyedNoteProbe.region,
          toolCallId: noteToolCallId,
        },
      ],
    });
  }

  hypotheses.push({
    id: "hyp-graphic-shear-class",
    status: keyedNoteProbe.hasSwKeyedNote ? "established_rule" : "hypothesis",
    conventionClass: "heavy-linework",
    claim:
      "Heavy structural wall linework on main floor plan indicates shear-wall class when S1.1 keyed-note / schedule vocabulary governs graphic convention.",
    provenance: [
      {
        kind: "compiler",
        pageNumber: planPage,
        toolCallId: "orientation-line-style-audit",
      },
      ...(keyedNoteProbe.hasSwKeyedNote
        ? [
            {
              kind: "ocr" as const,
              pageNumber: schedulePage,
              region: keyedNoteProbe.region,
              toolCallId: noteToolCallId,
            },
          ]
        : []),
    ],
  });

  const bindings: ProjectDictionary["bindings"] = [];
  if (selectedOwnershipRunKey && keyedNoteProbe.hasSwKeyedNote) {
    bindings.push({
      physicalRunKey: selectedOwnershipRunKey,
      referenceKey: "shear-wall",
      status: "established_binding",
      mechanism: "graphic-convention",
      provenance: [
        {
          kind: "compiler",
          pageNumber: planPage,
          toolCallId: "orientation-line-style-audit",
        },
        {
          kind: "ocr",
          pageNumber: schedulePage,
          region: keyedNoteProbe.region,
          toolCallId: noteToolCallId,
        },
      ],
    });
  }

  const unresolved: ProjectDictionary["unresolved"] = [
    {
      id: "unresolved-sw-subtype-p4",
      question:
        "Which physical runs on p4 (if any) bind to specific SW schedule subtypes (SW1–SW5)?",
      reason:
        "Graphic convention and keyed notes establish shear-wall class and schedule definitions; per-wall SW* tags are not recoverable on Beckstead p4.",
    },
  ];

  const dictionary: ProjectDictionary = {
    projectId: input.projectId,
    generatedAt: new Date().toISOString(),
    interpreterModel: "orientation-l7-deterministic",
    experimentBranch: "compiler_heavy",
    observations: [
      {
        id: "obs-heavy-lines-p4",
        claim: `${lineAudit.heavyLineNearRunCount} heavy-linework segments coincide with PBG runs on page ${planPage}.`,
        provenance: [
          {
            kind: "compiler",
            pageNumber: planPage,
            toolCallId: "orientation-line-style-audit",
          },
        ],
      },
      {
        id: "obs-schedule-defs-p1",
        claim: `Schedule definitions extracted: ${definitions.length} row(s) on page ${schedulePage}.`,
        provenance: [
          {
            kind: "compiler",
            pageNumber: schedulePage,
            toolCallId: "orientation-schedule-extraction",
          },
        ],
      },
    ],
    hypotheses,
    definitions: dictionaryDefinitions,
    bindings,
    unresolved,
    contradictions: [],
    metrics: {
      toolCalls: 0,
      tokens: 0,
      durationMs: Number((performance.now() - t0).toFixed(1)),
      interpreterMode: "compiler_seed",
    },
  };

  const orientationContext: ProjectOrientationContext = {
    sourceFingerprint: null,
    definitions,
    establishedRules: hypotheses.filter((h) => h.status === "established_rule"),
    dictionaryDefinitions,
    referenceMechanismHint: "GRAPHIC_CONVENTION",
    graphicConventionAuthorized: hypotheses.some(
      (h) =>
        h.id === "hyp-graphic-shear-class" && h.status === "established_rule",
    ),
  };

  return {
    dictionary,
    orientationContext,
    keyedNoteProbe,
    selectedOwnershipRunKey,
  };
}
