import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages.js";

import {
  DEFAULT_STRUCTURED_JSON_THINKING,
  extractTextFromClaudeMessage,
  usageSnapshotFromMessage,
} from "../../ai/anthropic/runClaudeJson.js";
import { getAnthropicClient } from "../../ai/anthropic/client.js";
import { env } from "../../config/env.js";
import { parseJson } from "../../core/utils/parseJson.js";
import { validateWithSchema } from "../../core/validation/validateWithSchema.js";
import { renderPagePng } from "../../compiler/dimensions/dimOwnership.js";
import { cropBboxFromRaster } from "../../compiler/semantic-mark-recovery/markOcr.js";
import {
  CLAUDE_REGION_OUTPUT_CONTRACT,
  CLAUDE_REGION_SYSTEM_PROMPT,
  claudeRegionInterpretResponseSchema,
  emptyInterpretTelemetry,
  prepareClaudeRegionPayload,
  type ProjectLearningInterpretTelemetry,
} from "./claudeRegionInterpretContract.js";
import {
  interpretProjectLearningRegionsDeterministic,
  type InterpretedDefinitionProposal,
} from "./interpretProjectLearningRegions.js";
import {
  projectLearningCandidateSchema,
  type ProjectLearningCandidate,
} from "./projectLearningTypes.js";

/** P0 V1: only SW shear-wall + WB header schedule tables. */
const MAX_P0_REGIONS = 4;
const MAX_REGION_TEXT_CHARS = 6000;
const REGION_MAX_TOKENS = 8192;

async function createRegionMessage(input: {
  systemPrompt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string | ContentBlockParam[];
  }>;
}): Promise<string> {
  const client = getAnthropicClient();
  const useStream = REGION_MAX_TOKENS >= 8192;
  const params = {
    model: env.anthropicModel,
    max_tokens: REGION_MAX_TOKENS,
    system: input.systemPrompt,
    thinking: DEFAULT_STRUCTURED_JSON_THINKING,
    messages: input.messages,
  };
  const message = useStream
    ? await client.messages.stream(params).finalMessage()
    : await client.messages.create({ ...params, stream: false });
  void usageSnapshotFromMessage(message);
  return extractTextFromClaudeMessage(message);
}

function validateRegionText(rawText: string, label: string) {
  const parsed = parseJson(rawText);
  const prepared = prepareClaudeRegionPayload(parsed);
  return validateWithSchema(
    claudeRegionInterpretResponseSchema,
    prepared,
    label,
  );
}

function isP0ScheduleTable(c: ProjectLearningCandidate): boolean {
  if (c.elementType !== "table") return false;
  const text = `${c.rawValue} ${c.tableHint ?? ""} ${c.definitionKind ?? ""}`;
  const isSw =
    c.definitionKind === "shear-wall" || /SHEAR\s*WALL\s*SCHEDULE/i.test(text);
  const isWb =
    c.definitionKind === "header" ||
    /WOOD\s*BEAM|BEAM\s*\/\s*HEADER|HEADER\s*SCHEDULE|WO\s*BEAM/i.test(text);
  return isSw || isWb;
}

/**
 * Bound region selection to P0 SW/WB schedule tables (+ schedule-row assist if no table).
 */
export function selectP0ClaudeRegions(
  candidates: readonly ProjectLearningCandidate[],
): ProjectLearningCandidate[] {
  const tables = candidates
    .filter(isP0ScheduleTable)
    .map((c) => {
      let score = 0;
      if (c.definitionKind === "shear-wall" || /SHEAR\s*WALL/i.test(c.rawValue)) {
        score += 40;
      }
      if (c.definitionKind === "header" || /BEAM|HEADER/i.test(c.rawValue)) {
        score += 40;
      }
      if (c.bbox) score += 5;
      score += Math.min(20, Math.floor(c.rawValue.length / 200));
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.c);

  const sw = tables.find(
    (c) => c.definitionKind === "shear-wall" || /SHEAR\s*WALL/i.test(c.rawValue),
  );
  const wb = tables.find(
    (c) => c.definitionKind === "header" || /BEAM|HEADER/i.test(c.rawValue),
  );
  const picked: ProjectLearningCandidate[] = [];
  if (sw) picked.push(sw);
  if (wb && wb.id !== sw?.id) picked.push(wb);
  for (const t of tables) {
    if (picked.length >= MAX_P0_REGIONS) break;
    if (!picked.some((p) => p.id === t.id)) picked.push(t);
  }

  if (picked.length === 0) {
    return candidates
      .filter(
        (c) =>
          c.elementType === "schedule-row" && c.sourceKind === "ocr-row-band",
      )
      .slice(0, MAX_P0_REGIONS);
  }

  return picked.slice(0, MAX_P0_REGIONS);
}

async function interpretOneRegion(input: {
  candidate: ProjectLearningCandidate;
  userContent: ContentBlockParam[];
  telemetry: ProjectLearningInterpretTelemetry;
}): Promise<{
  proposals: InterpretedDefinitionProposal[];
  error?: string;
  originalResponse?: string;
}> {
  const label = `project-learning-region:${input.candidate.id}`;
  input.telemetry.regionCalls += 1;

  const firstText = await createRegionMessage({
    systemPrompt: CLAUDE_REGION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: input.userContent }],
  });

  try {
    const result = validateRegionText(firstText, label);
    input.telemetry.firstPassSuccesses += 1;
    return {
      proposals: result.definitions.map((def) => ({
        candidateId: def.sourceCandidateId ?? input.candidate.id,
        semanticTypeKey: def.semanticTypeKey,
        definitionKind: def.definitionKind,
        properties: def.properties,
        interpretedValue: def.interpretedValue,
      })),
      originalResponse: firstText,
    };
  } catch (firstError) {
    input.telemetry.firstPassFailures += 1;
    input.telemetry.repairAttempts += 1;
    const firstErrorMessage =
      firstError instanceof Error ? firstError.message : String(firstError);

    const repairPrompt = `The previous response failed Project Learning schema validation.
Return corrected JSON only. No markdown. No explanation.
Do not invent new construction facts — only fix representation to match the contract.
Omit definitions you cannot support with visible properties.

Required output contract:
${CLAUDE_REGION_OUTPUT_CONTRACT}

Validation error:
${firstErrorMessage}

Original response:
${firstText.slice(0, 12000)}`;

    try {
      const repairText = await createRegionMessage({
        systemPrompt: CLAUDE_REGION_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: input.userContent },
          { role: "assistant", content: firstText },
          { role: "user", content: repairPrompt },
        ],
      });
      const repaired = validateRegionText(repairText, `${label} (repaired)`);
      input.telemetry.repairSuccesses += 1;
      return {
        proposals: repaired.definitions.map((def) => ({
          candidateId: def.sourceCandidateId ?? input.candidate.id,
          semanticTypeKey: def.semanticTypeKey,
          definitionKind: def.definitionKind,
          properties: def.properties,
          interpretedValue: def.interpretedValue,
        })),
        originalResponse: firstText,
      };
    } catch (secondError) {
      input.telemetry.repairFailures += 1;
      const message =
        secondError instanceof Error
          ? secondError.message.slice(0, 400)
          : "repair failed";
      return {
        proposals: [],
        originalResponse: firstText,
        error: `first=${firstErrorMessage.slice(0, 220)}; repair=${message}`,
      };
    }
  }
}

/**
 * Production Project Learning interpret path: P0 schedule region → Claude
 * construction-semantic proposals → interpreted candidates.
 */
export async function interpretProjectLearningRegionsWithClaude(input: {
  pdfPath: string;
  candidates: readonly ProjectLearningCandidate[];
  pageWidthPt?: number;
  pageHeightPt?: number;
}): Promise<{
  candidates: ProjectLearningCandidate[];
  proposals: InterpretedDefinitionProposal[];
  telemetry: ProjectLearningInterpretTelemetry;
}> {
  const telemetry = emptyInterpretTelemetry();
  const targets = selectP0ClaudeRegions(input.candidates);
  if (targets.length === 0) {
    return {
      candidates: [...input.candidates],
      proposals: [],
      telemetry,
    };
  }

  const pageWidth = input.pageWidthPt ?? 2592;
  const pageHeight = input.pageHeightPt ?? 1728;
  const proposals: InterpretedDefinitionProposal[] = [];
  const failedInterpretNotes = new Map<string, string>();
  const pageRasterCache = new Map<
    number,
    Awaited<ReturnType<typeof renderPagePng>>
  >();

  for (const candidate of targets) {
    const familyHint =
      candidate.definitionKind === "shear-wall" ||
      /SHEAR\s*WALL/i.test(candidate.rawValue)
        ? "P0 family: shear-wall (SW* marks only)"
        : candidate.definitionKind === "header" ||
            /BEAM|HEADER/i.test(candidate.rawValue)
          ? "P0 family: header (WB* / wood beam-header marks only)"
          : "P0 family: SW* and/or WB* marks if present";

    const userContent: ContentBlockParam[] = [
      {
        type: "text",
        text: [
          `Candidate id: ${candidate.id}`,
          `Page: ${candidate.pageNumber}`,
          `Element: ${candidate.elementType}`,
          `Source: ${candidate.sourceKind}`,
          `Definition kind hint: ${candidate.definitionKind ?? "unknown"}`,
          familyHint,
          "",
          "Region / OCR supporting text (not authority):",
          candidate.rawValue.slice(0, MAX_REGION_TEXT_CHARS),
          "",
          CLAUDE_REGION_OUTPUT_CONTRACT,
          "",
          `Set sourceCandidateId to "${candidate.id}" on each definition.`,
        ].join("\n"),
      },
    ];

    if (candidate.bbox) {
      try {
        let rendered = pageRasterCache.get(candidate.pageNumber);
        if (!rendered) {
          rendered = await renderPagePng(
            input.pdfPath,
            candidate.pageNumber,
            2,
          );
          pageRasterCache.set(candidate.pageNumber, rendered);
        }
        const crop = cropBboxFromRaster(
          rendered.png,
          pageWidth,
          pageHeight,
          {
            x0: candidate.bbox.left,
            y0: candidate.bbox.bottom,
            x1: candidate.bbox.right,
            y1: candidate.bbox.top,
          },
          12,
        );
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: crop.png.toString("base64"),
          },
        });
      } catch {
        // text-only fallback
      }
    }

    try {
      const result = await interpretOneRegion({
        candidate,
        userContent,
        telemetry,
      });
      if (result.error) {
        failedInterpretNotes.set(candidate.id, result.error);
      }
      proposals.push(...result.proposals);
    } catch (error) {
      failedInterpretNotes.set(
        candidate.id,
        error instanceof Error
          ? error.message.slice(0, 400)
          : "region interpret failed",
      );
    }
  }

  telemetry.proposalCount = proposals.length;

  const annotateFailures = (
    list: ProjectLearningCandidate[],
  ): ProjectLearningCandidate[] =>
    list.map((candidate) => {
      const note = failedInterpretNotes.get(candidate.id);
      if (!note) return candidate;
      if (
        candidate.validationStatus !== "harvested" &&
        candidate.validationStatus !== "unresolved"
      ) {
        return candidate;
      }
      return projectLearningCandidateSchema.parse({
        ...candidate,
        validationStatus: "unresolved",
        conflictNotes: [
          ...(candidate.conflictNotes ?? []),
          `Claude region interpret failed after repair: ${note}`,
        ],
      });
    });

  if (proposals.length === 0) {
    return {
      candidates: annotateFailures(
        interpretProjectLearningRegionsDeterministic({
          candidates: input.candidates,
        }),
      ),
      proposals: [],
      telemetry,
    };
  }

  const byCandidate = new Map<string, InterpretedDefinitionProposal[]>();
  for (const proposal of proposals) {
    const list = byCandidate.get(proposal.candidateId) ?? [];
    list.push(proposal);
    byCandidate.set(proposal.candidateId, list);
  }

  const out: ProjectLearningCandidate[] = [];
  for (const candidate of input.candidates) {
    const props = byCandidate.get(candidate.id);
    if (!props || props.length === 0) {
      out.push(candidate);
      continue;
    }
    for (let i = 0; i < props.length; i++) {
      const proposal = props[i]!;
      out.push(
        projectLearningCandidateSchema.parse({
          ...candidate,
          id: props.length === 1 ? candidate.id : `${candidate.id}#${i + 1}`,
          semanticTypeKey: proposal.semanticTypeKey,
          definitionKind: proposal.definitionKind,
          properties: proposal.properties,
          interpretedValue: proposal.interpretedValue,
          validationStatus: "interpreted",
        }),
      );
    }
  }

  return {
    candidates: annotateFailures(out),
    proposals,
    telemetry,
  };
}
