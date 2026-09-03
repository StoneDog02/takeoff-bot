import {
  projectLearningPayloadSchema,
} from "../../project-reading/projectLearning/projectLearningTypes.js";
import { createTypedArtifactEnvelopeSchema } from "../../core/schemas/artifact-envelope.schema.js";

export const projectLearningArtifactSchema = createTypedArtifactEnvelopeSchema(
  "project-learning",
  projectLearningPayloadSchema,
);

export type ProjectLearningArtifact = ReturnType<
  typeof projectLearningArtifactSchema.parse
>;
