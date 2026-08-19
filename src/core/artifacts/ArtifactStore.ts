import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ArtifactEnvelope } from "../schemas/artifact-envelope.schema.js";
import { formatStageArtifactName } from "../utils/ids.js";

export class ArtifactStore {
  constructor(private readonly rootDirectory = "artifacts") {}

  async write(
    projectId: string,
    scopeName: string,
    order: number,
    stageName: string,
    artifact: ArtifactEnvelope<unknown>,
  ): Promise<string> {
    const directory = path.resolve(
      this.rootDirectory,
      projectId,
      scopeName,
    );
    await mkdir(directory, { recursive: true });

    const artifactPath = path.join(
      directory,
      formatStageArtifactName(order, stageName),
    );
    await writeFile(
      artifactPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      "utf8",
    );

    return artifactPath;
  }

  async writeExternal(
    projectId: string,
    scopeName: string,
    fileName: string,
    artifact: ArtifactEnvelope<unknown>,
  ): Promise<string> {
    const directory = path.resolve(
      this.rootDirectory,
      projectId,
      scopeName,
      "external",
    );
    await mkdir(directory, { recursive: true });

    const artifactPath = path.join(directory, fileName);
    await writeFile(
      artifactPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      "utf8",
    );

    return artifactPath;
  }

  async read(artifactPath: string): Promise<ArtifactEnvelope<unknown>> {
    const content = await readFile(artifactPath, "utf8");
    return JSON.parse(content) as ArtifactEnvelope<unknown>;
  }
}
