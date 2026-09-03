import { createHash } from "node:crypto";

import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { ExtractionPageBundle } from "../../pdf/ExtractionPageBundle.js";
import type { FramingExtractionIntent } from "../../pdf/deriveRoleAssignmentsFromPageClassification.js";
import type { GovernedProjectDictionary } from "../../project-reading/schemas/projectDictionary.schema.js";
import {
  extractionProjectContextAuditSchema,
  extractionProjectContextSchema,
  type ExtractionProjectContext,
  type ExtractionProjectContextAudit,
} from "./extractionProjectContext.schema.js";
import { selectKnownDefinitionsForWorkUnit } from "./selectKnownDefinitionsForWorkUnit.js";

const CONTEXT_DISCLAIMER = "CONTEXT ONLY — not plan evidence" as const;

const WALL_SUBTYPE_BINDING_PATTERN = /^SW\d/i;

const OWNERSHIP_MECHANISM_PATTERN =
  /ownership|governed-by|parent-system|area-system|parent_system|governed_by/i;

const RELATIONSHIP_INTENTS = new Set<FramingExtractionIntent>([
  "floor-framing",
  "sheathing",
  "roof-framing",
]);

const PHYSICAL_DEFINITION_INTENTS = new Set<string>([
  "wall-framing",
  "structural-members",
  "floor-framing",
  "sheathing",
  "roof-framing",
  "openings",
]);

type DomainPatterns = {
  systemTagPattern: RegExp;
  areaTagPattern: RegExp;
  keywordPattern: RegExp;
};

const DOMAIN_PATTERNS: Record<
  "floor-framing" | "sheathing" | "roof-framing",
  DomainPatterns
> = {
  "floor-framing": {
    systemTagPattern: /^(FFS-|FLOOR-SYS-|FLOOR FRAMING)/i,
    areaTagPattern: /^(FFA-|FLOOR-AREA-|FLOOR AREA)/i,
    keywordPattern: /\bfloor[\s-]*(framing|system|area|joist)\b/i,
  },
  sheathing: {
    systemTagPattern: /^(SHS-|SHEATHING SYSTEM|SHEATHING-SYS-)/i,
    areaTagPattern: /^(SHA-|SHEATHING AREA|SHEATHING-AREA-)/i,
    keywordPattern: /\bsheathing\b/i,
  },
  "roof-framing": {
    systemTagPattern: /^(RFS-|ROOF-SYS-|ROOF FRAMING SYSTEM)/i,
    areaTagPattern: /^(RFP-|ROOF-PLANE-|ROOF PLANE)/i,
    keywordPattern: /\broof[\s-]*(framing|system|plane|rafter)\b/i,
  },
};

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    compareStrings,
  );
}

function domainForIntent(
  intent: string,
): "floor-framing" | "sheathing" | "roof-framing" | null {
  if (intent === "floor-framing" || intent === "sheathing" || intent === "roof-framing") {
    return intent;
  }
  return null;
}

function matchesDomainTag(
  tag: string,
  domain: "floor-framing" | "sheathing" | "roof-framing",
  kind: "system" | "area",
): boolean {
  if (WALL_SUBTYPE_BINDING_PATTERN.test(tag)) {
    return false;
  }

  const patterns = DOMAIN_PATTERNS[domain];
  const pattern =
    kind === "system" ? patterns.systemTagPattern : patterns.areaTagPattern;
  return pattern.test(tag) || patterns.keywordPattern.test(tag);
}

function classifyTag(
  tag: string,
  domain: "floor-framing" | "sheathing" | "roof-framing",
): "system" | "area" | null {
  const isSystem = matchesDomainTag(tag, domain, "system");
  const isArea = matchesDomainTag(tag, domain, "area");
  if (isSystem && !isArea) {
    return "system";
  }
  if (isArea && !isSystem) {
    return "area";
  }
  if (isSystem && isArea) {
    return tag.toUpperCase().includes("AREA") ? "area" : "system";
  }
  return null;
}

function sourcePageFromBinding(
  binding: GovernedProjectDictionary["bindings"][number],
): number {
  const withPage = binding.provenance.find((ref) => ref.pageNumber != null);
  return withPage?.pageNumber ?? 1;
}

function isOwnershipBindingMechanism(mechanism: string): boolean {
  return OWNERSHIP_MECHANISM_PATTERN.test(mechanism);
}

function collectDictionaryTags(
  dictionary: GovernedProjectDictionary | null,
  domain: "floor-framing" | "sheathing" | "roof-framing",
): { systemTags: string[]; areaTags: string[] } {
  if (!dictionary) {
    return { systemTags: [], areaTags: [] };
  }

  const systemTags: string[] = [];
  const areaTags: string[] = [];

  const considerTag = (tag: string) => {
    const kind = classifyTag(tag, domain);
    if (kind === "system") {
      systemTags.push(tag);
    } else if (kind === "area") {
      areaTags.push(tag);
    }
  };

  for (const definition of dictionary.definitions) {
    considerTag(definition.semanticTypeKey);
    for (const property of definition.properties) {
      if (property.propertyPath === "parentSystemTag") {
        considerTag(property.rawText);
      }
    }
  }

  for (const observation of dictionary.observations) {
    const tokens = observation.claim.match(/[A-Z0-9][A-Z0-9._-]{2,}/gi) ?? [];
    for (const token of tokens) {
      considerTag(token);
    }
  }

  for (const binding of dictionary.bindings) {
    if (binding.status !== "established_binding") {
      continue;
    }
    if (WALL_SUBTYPE_BINDING_PATTERN.test(binding.referenceKey ?? "")) {
      continue;
    }
    considerTag(binding.physicalRunKey);
    if (binding.referenceKey) {
      considerTag(binding.referenceKey);
    }
  }

  return {
    systemTags: uniqueSorted(systemTags),
    areaTags: uniqueSorted(areaTags),
  };
}

function collectDictionaryBindings(
  dictionary: GovernedProjectDictionary | null,
  domain: "floor-framing" | "sheathing" | "roof-framing",
  bundlePageNumbers: readonly number[],
): ExtractionProjectContext["dictionaryBindings"] {
  if (!dictionary) {
    return [];
  }

  const bundlePages = new Set(bundlePageNumbers);
  const bindings: ExtractionProjectContext["dictionaryBindings"] = [];

  for (const binding of dictionary.bindings) {
    if (binding.status !== "established_binding") {
      continue;
    }
    if (!binding.physicalRunKey || !binding.referenceKey) {
      continue;
    }
    if (WALL_SUBTYPE_BINDING_PATTERN.test(binding.referenceKey)) {
      continue;
    }

    const areaKind = classifyTag(binding.physicalRunKey, domain);
    const systemKind = classifyTag(binding.referenceKey, domain);
    const ownershipMechanism = isOwnershipBindingMechanism(binding.mechanism);
    if (!ownershipMechanism && (!areaKind || !systemKind)) {
      continue;
    }
    if (areaKind !== "area" && systemKind !== "system" && !ownershipMechanism) {
      continue;
    }

    const sourcePage = sourcePageFromBinding(binding);
    if (!bundlePages.has(sourcePage) && bundlePageNumbers.length > 0) {
      continue;
    }

    bindings.push({
      physicalRunKey: binding.physicalRunKey,
      referenceKey: binding.referenceKey,
      mechanism: binding.mechanism,
      sourcePage,
    });
  }

  return bindings.sort((left, right) =>
    left.physicalRunKey === right.physicalRunKey
      ? compareStrings(left.referenceKey, right.referenceKey)
      : compareStrings(left.physicalRunKey, right.physicalRunKey),
  );
}

function truncateSummary(text: string, maxLength = 160): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function collectCrossPageNotes(
  compiledPages: readonly CompiledDrawingPage[],
  bundlePageNumbers: readonly number[],
  domain: "floor-framing" | "sheathing" | "roof-framing",
): ExtractionProjectContext["crossPageNotes"] {
  const bundlePages = new Set(bundlePageNumbers);
  const notes: ExtractionProjectContext["crossPageNotes"] = [];
  const keywordPattern = DOMAIN_PATTERNS[domain].keywordPattern;

  for (const page of compiledPages) {
    if (!bundlePages.has(page.pageNumber)) {
      continue;
    }

    for (const primitive of page.text.primitives ?? []) {
      const text = primitive.rawText?.trim() ?? "";
      if (text.length < 8 || !keywordPattern.test(text)) {
        continue;
      }

      notes.push({
        pageNumber: page.pageNumber,
        noteReference: primitive.id ?? null,
        summaryText: truncateSummary(text),
      });
    }

    for (const definition of page.semanticDefinitions?.definitions ?? []) {
      const summaryParts = definition.properties
        .map((property) => property.rawText)
        .filter(Boolean);
      if (summaryParts.length === 0) {
        continue;
      }
      const summary = summaryParts.join(" | ");
      if (!keywordPattern.test(summary) && !keywordPattern.test(definition.semanticTypeKey)) {
        continue;
      }
      notes.push({
        pageNumber: page.pageNumber,
        noteReference: definition.semanticTypeKey,
        summaryText: truncateSummary(summary),
      });
    }
  }

  return notes
    .sort(
      (left, right) =>
        left.pageNumber - right.pageNumber ||
        compareStrings(left.summaryText, right.summaryText),
    )
    .slice(0, 24);
}

function emptyContext(intent: string, bundlePageNumbers: number[]): ExtractionProjectContext {
  return extractionProjectContextSchema.parse({
    intent,
    bundlePageNumbers,
    knownSystemTags: [],
    knownAreaTags: [],
    dictionaryBindings: [],
    crossPageNotes: [],
    knownDefinitions: [],
    contextDisclaimer: CONTEXT_DISCLAIMER,
  });
}

export function hashExtractionProjectContext(
  context: ExtractionProjectContext,
): string {
  return createHash("sha256")
    .update(JSON.stringify(context))
    .digest("hex")
    .slice(0, 16);
}

export function auditExtractionProjectContext(
  context: ExtractionProjectContext,
): ExtractionProjectContextAudit {
  const contextInjected =
    context.knownSystemTags.length > 0 ||
    context.knownAreaTags.length > 0 ||
    context.dictionaryBindings.length > 0 ||
    context.crossPageNotes.length > 0 ||
    (context.knownDefinitions?.length ?? 0) > 0;

  return extractionProjectContextAuditSchema.parse({
    contextSliceHash: hashExtractionProjectContext(context),
    contextBindingCount: context.dictionaryBindings.length,
    contextNoteCount: context.crossPageNotes.length,
    contextInjected,
  });
}

export type BuildExtractionProjectContextInput = {
  intent: string;
  bundle: ExtractionPageBundle;
  dictionary: GovernedProjectDictionary | null;
  compiledPages: readonly CompiledDrawingPage[];
  buildingAssemblies: {
    assemblyNames: string[];
    notes: string[];
  };
  /** Test / retrieval seam for semantic-key override. */
  candidateKeysOverride?: readonly string[];
  schedulePrimary?: boolean;
};

/**
 * Intent-scoped project context for extraction preamble (O1).
 * Context is not Evidence — Claude must still ground relationships in plan text.
 * knownDefinitions are semantic-key-driven validated Project Dictionary defs.
 */
export function buildExtractionProjectContext(
  input: BuildExtractionProjectContextInput,
): ExtractionProjectContext {
  const bundlePageNumbers = input.bundle.members
    .map((member) => member.pageNumber)
    .sort((left, right) => left - right);

  const knownDefinitions = PHYSICAL_DEFINITION_INTENTS.has(input.intent)
    ? selectKnownDefinitionsForWorkUnit({
        intent: input.intent,
        bundle: input.bundle,
        dictionary: input.dictionary,
        compiledPages: input.compiledPages,
        candidateKeysOverride: input.candidateKeysOverride,
        schedulePrimary: input.schedulePrimary,
      })
    : [];

  if (!RELATIONSHIP_INTENTS.has(input.intent as FramingExtractionIntent)) {
    return extractionProjectContextSchema.parse({
      ...emptyContext(input.intent, bundlePageNumbers),
      knownDefinitions,
    });
  }

  const domain = domainForIntent(input.intent);
  if (!domain) {
    return extractionProjectContextSchema.parse({
      ...emptyContext(input.intent, bundlePageNumbers),
      knownDefinitions,
    });
  }

  const { systemTags, areaTags } = collectDictionaryTags(input.dictionary, domain);
  const dictionaryBindings = collectDictionaryBindings(
    input.dictionary,
    domain,
    bundlePageNumbers,
  );
  const crossPageNotes = collectCrossPageNotes(
    input.compiledPages,
    bundlePageNumbers,
    domain,
  );

  return extractionProjectContextSchema.parse({
    intent: input.intent,
    bundlePageNumbers,
    knownSystemTags: systemTags,
    knownAreaTags: areaTags,
    dictionaryBindings,
    crossPageNotes,
    knownDefinitions,
    contextDisclaimer: CONTEXT_DISCLAIMER,
  });
}
