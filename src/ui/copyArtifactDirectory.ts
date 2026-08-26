import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Copies a completed framing artifact directory into a session workspace.
 * The source directory is never modified by subsequent session operations.
 */
export async function copyArtifactDirectory(
  sourceDir: string,
  destinationDir: string,
): Promise<void> {
  const resolvedSource = path.resolve(sourceDir);
  const resolvedDestination = path.resolve(destinationDir);

  try {
    await access(resolvedSource);
  } catch {
    throw new Error(
      `Artifact directory does not exist or is not readable: ${resolvedSource}`,
    );
  }

  await mkdir(path.dirname(resolvedDestination), { recursive: true });
  await cp(resolvedSource, resolvedDestination, { recursive: true });
}
