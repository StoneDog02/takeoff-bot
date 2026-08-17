import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/**
 * Loads Construction Brain files by path relative to `knowledge/`.
 * Missing files are omitted so extraction can degrade gracefully.
 */
export async function loadKnowledgeFiles(
  relativePaths: string[],
): Promise<Record<string, string>> {
  const loaded: Record<string, string> = {};

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(REPO_ROOT, "knowledge", relativePath);
    try {
      loaded[relativePath] = await readFile(absolutePath, "utf8");
    } catch {
      // Skip missing optional knowledge files.
    }
  }

  return loaded;
}

export function formatKnowledgeForPrompt(
  knowledge: Record<string, string>,
): string {
  return Object.entries(knowledge)
    .map(([relativePath, content]) => {
      return `### ${relativePath}\n\n${content.trim()}`;
    })
    .join("\n\n");
}
