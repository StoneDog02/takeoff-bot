import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { ExtractionPageBundle } from "../../pdf/ExtractionPageBundle.js";
import type {
  GovernedProjectDictionary,
  ProjectSemanticDefinition,
} from "../../project-reading/schemas/projectDictionary.schema.js";
import type { ExtractionProjectContextKnownDefinition } from "./extractionProjectContext.schema.js";

export const KNOWN_DEFINITIONS_CAP = 20;

const MARK_KEY_PATTERN =
  /\b(SW\d+[A-Z]?|WB\d[\w./-]*|LSTHD\w*|STHD\w*|HDU\w*|HTT\w*|MTS\w*|CS\d+\w*)\b/gi;

const PHYSICAL_INTENTS = new Set([
  "wall-framing",
  "structural-members",
  "floor-framing",
  "sheathing",
  "roof-framing",
  "openings",
]);

function normalizeKey(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

function isSchedulePrimaryBundle(bundle: ExtractionPageBundle): boolean {
  const primaryRoles = bundle.members
    .filter((m) => m.role === "primary")
    .map((m) => (m.reason ?? "").toLowerCase());
  if (primaryRoles.length === 0) return false;
  const scheduleOnly = primaryRoles.every(
    (reason) =>
      reason.includes("schedule") &&
      !reason.includes("plan") &&
      !reason.includes("framing"),
  );
  // Also treat global-only schedule pages: all members cite schedule without plan-layout.
  const allScheduleish = bundle.members.every((m) => {
    const r = (m.reason ?? "").toLowerCase();
    return r.includes("schedule") || r.includes("index") || r.includes("notes");
  });
  const noPlanMember = bundle.members.every((m) => {
    const r = (m.reason ?? "").toLowerCase();
    return !r.includes("framing-plan") && !r.includes("plan-layout") && !r.includes("primary plan");
  });
  return scheduleOnly || (allScheduleish && noPlanMember && bundle.intent !== "wall-framing");
}

/**
 * Explicit schedule-primary skip: bundle pages are only schedule/index/notes
 * with no physical plan primary. Callers may also pass schedulePrimary=true.
 */
export function shouldSkipDefinitionContext(input: {
  bundle: ExtractionPageBundle;
  schedulePrimary?: boolean;
}): boolean {
  if (input.schedulePrimary === true) return true;
  return isSchedulePrimaryBundle(input.bundle);
}

export function collectCandidateSemanticKeys(input: {
  compiledPages: readonly CompiledDrawingPage[];
  bundle: ExtractionPageBundle;
}): string[] {
  const pageNumbers = new Set(input.bundle.members.map((m) => m.pageNumber));
  const keys = new Set<string>();

  for (const page of input.compiledPages) {
    if (!pageNumbers.has(page.pageNumber)) continue;

    const markObs = page.semanticMarkRecovery?.observations ?? [];
    for (const obs of markObs) {
      if (obs.normalizedKey) keys.add(normalizeKey(obs.normalizedKey));
      else if (obs.rawText) {
        for (const m of obs.rawText.matchAll(MARK_KEY_PATTERN)) {
          keys.add(normalizeKey(m[1]!));
        }
      }
    }

    const ownership = page.semanticBinding?.ownershipAssociations ?? [];
    for (const assoc of ownership) {
      if (assoc.semanticSubjectKey) {
        keys.add(normalizeKey(assoc.semanticSubjectKey));
      }
    }
    const bindings = page.semanticBinding?.bindings ?? [];
    for (const binding of bindings) {
      if (binding.semanticSubjectKey) {
        keys.add(normalizeKey(binding.semanticSubjectKey));
      }
    }

    for (const prim of page.text?.primitives ?? []) {
      for (const m of String(prim.rawText ?? "").matchAll(MARK_KEY_PATTERN)) {
        keys.add(normalizeKey(m[1]!));
      }
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b));
}

function definitionToKnown(
  def: ProjectSemanticDefinition,
): ExtractionProjectContextKnownDefinition {
  const properties: Record<string, string> = {};
  for (const prop of def.properties) {
    properties[prop.propertyPath] = prop.rawText;
  }
  return {
    semanticTypeKey: def.semanticTypeKey,
    definitionKind: guessKind(def.semanticTypeKey),
    properties,
    sourcePage: def.sourcePage,
    validationStatus: "validated",
  };
}

function guessKind(key: string): string {
  if (/^SW\d/i.test(key)) return "shear-wall";
  if (/^WB\d/i.test(key)) return "header";
  if (/^(?:LSTHD|STHD|HDU|HTT)/i.test(key)) return "holdown";
  if (/^(?:MTS|CS|HSTA|MST)/i.test(key)) return "connector";
  return "unknown";
}

function acceptedDefinitionKeys(
  dictionary: GovernedProjectDictionary | null,
): Set<string> | null {
  if (!dictionary?.governance) return null;
  const accepted = (
    dictionary.governance as {
      acceptedDefinitionKeys?: string[];
    }
  ).acceptedDefinitionKeys;
  if (!accepted) return null;
  return new Set(accepted.map(normalizeKey));
}

function isValidatedDefinition(
  def: ProjectSemanticDefinition,
  accepted: Set<string> | null,
): boolean {
  if (accepted) return accepted.has(normalizeKey(def.semanticTypeKey));
  // If governance keys absent, treat dictionary.definitions as already governed.
  return def.status === "definition";
}

function lookupByKeys(
  dictionary: GovernedProjectDictionary,
  keys: readonly string[],
): ExtractionProjectContextKnownDefinition[] {
  const accepted = acceptedDefinitionKeys(dictionary);
  const keySet = new Set(keys.map(normalizeKey));
  const out: ExtractionProjectContextKnownDefinition[] = [];
  for (const def of dictionary.definitions) {
    if (!isValidatedDefinition(def, accepted)) continue;
    if (!keySet.has(normalizeKey(def.semanticTypeKey))) continue;
    out.push(definitionToKnown(def));
  }
  return out;
}

/**
 * Multi-family capped fallback when no page keys are available.
 * Intent may bias order; it does not exclude SW from floor or WB from wall.
 */
function cappedMultiFamilyFallback(
  dictionary: GovernedProjectDictionary,
  intent: string,
): ExtractionProjectContextKnownDefinition[] {
  const accepted = acceptedDefinitionKeys(dictionary);
  const defs = dictionary.definitions.filter((d) =>
    isValidatedDefinition(d, accepted),
  );

  const sw = defs.filter((d) => /^SW\d/i.test(d.semanticTypeKey));
  const wb = defs.filter((d) => /^WB\d/i.test(d.semanticTypeKey));
  const other = defs.filter(
    (d) => !/^SW\d/i.test(d.semanticTypeKey) && !/^WB\d/i.test(d.semanticTypeKey),
  );

  const ordered =
    intent === "structural-members" || intent === "floor-framing"
      ? [...wb, ...sw, ...other]
      : [...sw, ...wb, ...other];

  return ordered.slice(0, KNOWN_DEFINITIONS_CAP).map(definitionToKnown);
}

export function selectKnownDefinitionsForWorkUnit(input: {
  intent: string;
  bundle: ExtractionPageBundle;
  dictionary: GovernedProjectDictionary | null;
  compiledPages: readonly CompiledDrawingPage[];
  schedulePrimary?: boolean;
  /** Test seam: inject candidate keys instead of compiling from pages. */
  candidateKeysOverride?: readonly string[];
}): ExtractionProjectContextKnownDefinition[] {
  if (!PHYSICAL_INTENTS.has(input.intent)) {
    return [];
  }
  if (!input.dictionary || input.dictionary.definitions.length === 0) {
    return [];
  }
  if (shouldSkipDefinitionContext(input)) {
    return [];
  }

  const keys =
    input.candidateKeysOverride && input.candidateKeysOverride.length > 0
      ? [...input.candidateKeysOverride]
      : collectCandidateSemanticKeys({
          compiledPages: input.compiledPages,
          bundle: input.bundle,
        });

  if (keys.length > 0) {
    return lookupByKeys(input.dictionary, keys).slice(0, KNOWN_DEFINITIONS_CAP);
  }

  return cappedMultiFamilyFallback(input.dictionary, input.intent);
}
