import { z } from "zod";

/**
 * Shared identifier format for persistent engine entities.
 *
 * IDs must:
 * - Be non-empty
 * - Remain stable after creation
 * - Avoid whitespace
 * - Use only characters safe for JSON, logs, filenames, and references
 *
 * Prefix and generation rules belong to the owning scope or subsystem.
 */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, "Identifier is required.")
  .max(128, "Identifier must not exceed 128 characters.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Identifier contains unsupported characters.",
  );

/**
 * Persistent ID for a resolved domain object.
 *
 * Examples:
 * - W-001
 * - WS-001-02
 * - O-014
 * - SM-008
 */
export const objectIdSchema = identifierSchema.brand<"ObjectId">();

/**
 * Identifies one execution of the deterministic pipeline.
 */
export const pipelineRunIdSchema =
  identifierSchema.brand<"PipelineRunId">();

/**
 * Identifies a persisted artifact.
 */
export const artifactIdSchema = identifierSchema.brand<"ArtifactId">();

/**
 * Identifies a source-evidence record.
 */
export const evidenceIdSchema = identifierSchema.brand<"EvidenceId">();

/**
 * Identifies an assumption record.
 */
export const assumptionIdSchema = identifierSchema.brand<"AssumptionId">();

/**
 * Identifies a validation issue.
 */
export const validationIssueIdSchema =
  identifierSchema.brand<"ValidationIssueId">();

/**
 * Identifies one deterministic validation-rule evaluation.
 */
export const validationResultIdSchema =
  identifierSchema.brand<"ValidationResultId">();

/**
 * Identifies a user-facing review item.
 */
export const reviewItemIdSchema =
  identifierSchema.brand<"ReviewItemId">();

/**
 * Identifies an immutable user decision that confirms, replaces, rejects,
 * or otherwise resolves an engine-generated reviewable condition.
 */
export const userDecisionIdSchema =
  identifierSchema.brand<"UserDecisionId">();

/**
 * Identifies one explainable confidence evaluation.
 */
export const confidenceEvaluationIdSchema =
  identifierSchema.brand<"ConfidenceEvaluationId">();

export type Identifier = z.infer<typeof identifierSchema>;
export type ObjectId = z.infer<typeof objectIdSchema>;
export type PipelineRunId = z.infer<typeof pipelineRunIdSchema>;
export type ArtifactId = z.infer<typeof artifactIdSchema>;
export type EvidenceId = z.infer<typeof evidenceIdSchema>;
export type AssumptionId = z.infer<typeof assumptionIdSchema>;
export type ValidationIssueId = z.infer<typeof validationIssueIdSchema>;
export type ValidationResultId = z.infer<typeof validationResultIdSchema>;
export type ReviewItemId = z.infer<typeof reviewItemIdSchema>;
export type UserDecisionId = z.infer<typeof userDecisionIdSchema>;
export type ConfidenceEvaluationId = z.infer<
  typeof confidenceEvaluationIdSchema
>;
