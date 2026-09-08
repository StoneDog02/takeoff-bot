import type {
  GovernedProjectDictionary,
  ProjectDictionary,
  ProjectSemanticDefinition,
} from "./schemas/projectDictionary.schema.js";

export function normalizeDictionaryMark(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

const MARK_TOKEN_PATTERN =
  /\b(SW\d+[A-Z]?|WB\d[\w./-]*|LSTHD\w*|STHD\w*|HDU\w*|HTT\w*|MTS\w*|CS\d+\w*)\b/gi;

export function collectDictionaryMarkTokens(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(MARK_TOKEN_PATTERN)) {
    const token = match[1];
    if (token) {
      keys.add(normalizeDictionaryMark(token));
    }
  }
  return [...keys];
}

function acceptedKeys(
  dictionary: ProjectDictionary | GovernedProjectDictionary,
): Set<string> | null {
  const governance = (dictionary as GovernedProjectDictionary).governance;
  if (!governance?.acceptedDefinitionKeys) {
    return null;
  }
  return new Set(
    governance.acceptedDefinitionKeys.map((key) => normalizeDictionaryMark(key)),
  );
}

/**
 * Lookup a project-specific schedule/legend definition by mark.
 * Returns null when the dictionary has no validated match.
 */
export function lookupProjectDictionaryDefinition(
  dictionary: ProjectDictionary | GovernedProjectDictionary | null | undefined,
  mark: string,
): ProjectSemanticDefinition | null {
  if (!dictionary || mark.trim().length === 0) {
    return null;
  }

  const needle = normalizeDictionaryMark(mark);
  const accepted = acceptedKeys(dictionary);

  for (const definition of dictionary.definitions) {
    if (accepted && !accepted.has(normalizeDictionaryMark(definition.semanticTypeKey))) {
      continue;
    }
    if (normalizeDictionaryMark(definition.semanticTypeKey) === needle) {
      return definition;
    }
  }

  return null;
}

export function lookupProjectDictionaryDefinitionFromTexts(
  dictionary: ProjectDictionary | GovernedProjectDictionary | null | undefined,
  texts: readonly string[],
): ProjectSemanticDefinition | null {
  if (!dictionary) {
    return null;
  }

  for (const text of texts) {
    const direct = lookupProjectDictionaryDefinition(dictionary, text);
    if (direct) {
      return direct;
    }
    for (const token of collectDictionaryMarkTokens(text)) {
      const hit = lookupProjectDictionaryDefinition(dictionary, token);
      if (hit) {
        return hit;
      }
    }
  }

  return null;
}
