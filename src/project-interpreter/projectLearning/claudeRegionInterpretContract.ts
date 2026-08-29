import { z } from "zod";

/**
 * Shared Project Learning definitionKind vocabulary — prompt + Zod must stay aligned.
 */
export const PROJECT_LEARNING_DEFINITION_KINDS = [
  "shear-wall",
  "header",
  "holdown",
  "wall-type",
  "connector",
  "unknown",
] as const;

export type ProjectLearningDefinitionKind =
  (typeof PROJECT_LEARNING_DEFINITION_KINDS)[number];

/** Representational aliases only — semantics unchanged. */
const DEFINITION_KIND_ALIASES: Record<string, ProjectLearningDefinitionKind> = {
  "shear-wall": "shear-wall",
  shearwall: "shear-wall",
  "shear_wall": "shear-wall",
  sw: "shear-wall",
  header: "header",
  beam: "header",
  "wood-beam": "header",
  "wood_beam": "header",
  "wood-beam-header": "header",
  wb: "header",
  holdown: "holdown",
  holddown: "holdown",
  "hold-down": "holdown",
  "wall-type": "wall-type",
  walltype: "wall-type",
  connector: "connector",
  unknown: "unknown",
};

export function normalizeDefinitionKind(
  raw: unknown,
): ProjectLearningDefinitionKind | unknown {
  if (typeof raw !== "string") return raw;
  const key = raw.trim().toLowerCase().replace(/[_\s]+/g, "-");
  return DEFINITION_KIND_ALIASES[key] ?? raw.trim();
}

/**
 * Normalize property bags into [{ propertyPath, rawText }].
 * Accepts array-of-objects or plain object maps. Does not invent values.
 */
export function normalizeDefinitionProperties(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const o = item as Record<string, unknown>;
        const propertyPath = o.propertyPath ?? o.path ?? o.key ?? o.name;
        const rawText = o.rawText ?? o.value ?? o.text ?? o.content;
        if (typeof propertyPath !== "string" || propertyPath.trim().length === 0) {
          return null;
        }
        if (rawText == null) return null;
        return {
          propertyPath: propertyPath.trim(),
          rawText: String(rawText),
        };
      })
      .filter(Boolean);
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([propertyPath, rawText]) => {
        if (!propertyPath.trim() || rawText == null) return null;
        return {
          propertyPath: propertyPath.trim(),
          rawText: String(rawText),
        };
      })
      .filter(Boolean);
  }

  return raw;
}

export const claudeRegionDefinitionSchema = z.object({
  semanticTypeKey: z.string().trim().min(1),
  definitionKind: z.preprocess(
    normalizeDefinitionKind,
    z.enum(PROJECT_LEARNING_DEFINITION_KINDS),
  ),
  properties: z.preprocess(
    normalizeDefinitionProperties,
    z
      .array(
        z.object({
          propertyPath: z.string().trim().min(1),
          rawText: z.string(),
        }),
      )
      .min(1),
  ),
  interpretedValue: z.string().trim().min(1),
  sourceCandidateId: z.string().trim().min(1).optional(),
});

export const claudeRegionInterpretResponseSchema = z.object({
  definitions: z.array(claudeRegionDefinitionSchema).max(16),
});

export type ClaudeRegionInterpretResponse = z.infer<
  typeof claudeRegionInterpretResponseSchema
>;

export const CLAUDE_REGION_OUTPUT_CONTRACT = `Return ONLY valid JSON matching this exact shape (no markdown, no commentary):
{
  "definitions": [
    {
      "semanticTypeKey": "SW2",
      "definitionKind": "shear-wall",
      "properties": [
        { "propertyPath": "assembly.sheathingType", "rawText": "7/16\\" OSB" }
      ],
      "interpretedValue": "SW2: 7/16 OSB sheathing",
      "sourceCandidateId": "<candidate id from the user message>"
    }
  ]
}

Rules for fields:
- semanticTypeKey: exact mark as printed (SW1, SW2, WB2-10DF, …). Required.
- definitionKind: MUST be one of: ${PROJECT_LEARNING_DEFINITION_KINDS.join(" | ")}.
  Use "shear-wall" for SW*; "header" for WB*/wood beam/header schedule marks.
- properties: MUST be an array of objects. Never a bare string array. Never omit propertyPath or rawText.
  propertyPath: stable dotted path (examples: assembly.sheathingType, assembly.nailingPattern.edge, assembly.holdownType, size, material).
  rawText: verbatim schedule cell text for that property (string; may be "" only if the cell is blank on the sheet).
- interpretedValue: short human summary of the definition.
- sourceCandidateId: echo the candidate id provided.

Behavior:
- Interpret project schedule/legend DEFINITIONS only — never invent physical occurrences, wall runs, openings, or quantities.
- Prefer SW* and WB* marks in this region. Omit marks you cannot support with visible properties.
- If a fact is not visible, OMIT that property or that whole definition — do not invent values to satisfy the schema.
- At most 16 definitions in this response. If the schedule has more, return the clearest SW*/WB* rows first.
- Raw OCR/ODL text is supporting input, not authority.`;

export const CLAUDE_REGION_SYSTEM_PROMPT = `You are the Project Learning region interpreter for construction plan schedules.

${CLAUDE_REGION_OUTPUT_CONTRACT}`;

export type ProjectLearningInterpretTelemetry = {
  regionCalls: number;
  firstPassSuccesses: number;
  firstPassFailures: number;
  repairAttempts: number;
  repairSuccesses: number;
  repairFailures: number;
  proposalCount: number;
};

export function emptyInterpretTelemetry(): ProjectLearningInterpretTelemetry {
  return {
    regionCalls: 0,
    firstPassSuccesses: 0,
    firstPassFailures: 0,
    repairAttempts: 0,
    repairSuccesses: 0,
    repairFailures: 0,
    proposalCount: 0,
  };
}

/**
 * Normalize a parsed Claude JSON object before Zod validate.
 * Drops definitions that still lack usable properties after representational normalize.
 */
export function prepareClaudeRegionPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const rec = raw as Record<string, unknown>;
  const defs = rec.definitions;
  if (!Array.isArray(defs)) return raw;

  const cleaned = defs
    .map((def) => {
      if (!def || typeof def !== "object" || Array.isArray(def)) return null;
      const d = { ...(def as Record<string, unknown>) };
      d.definitionKind = normalizeDefinitionKind(d.definitionKind);
      d.properties = normalizeDefinitionProperties(d.properties);
      if (!Array.isArray(d.properties) || d.properties.length === 0) return null;
      if (typeof d.semanticTypeKey !== "string" || !d.semanticTypeKey.trim()) {
        return null;
      }
      if (typeof d.interpretedValue !== "string" || !d.interpretedValue.trim()) {
        d.interpretedValue = `${String(d.semanticTypeKey).trim()}: ${(d.properties as Array<{ propertyPath: string; rawText: string }>).map((p) => p.rawText).join("; ")}`;
      }
      return d;
    })
    .filter(Boolean);

  return { ...rec, definitions: cleaned };
}
