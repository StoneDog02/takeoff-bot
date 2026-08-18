import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import { reviewItemSchema } from "../../../core/schemas/review-item.schema.js";
import type {
  ReviewAction,
  ReviewAffectedObject,
  ReviewQuantityImpact,
} from "../../../core/schemas/review-item.schema.js";
import type {
  AssumptionId,
  EvidenceId,
  ValidationIssueId,
} from "../../../core/schemas/identity.schema.js";
import type {
  BlockingStatus,
  ReviewStatus,
} from "../../../core/schemas/status.schema.js";
import type { ValidationTarget } from "../../../core/schemas/validation.schema.js";
import { createReviewItemId } from "./ids.js";

export type CreateReviewItemInput = {
  ruleId: string;
  target: ValidationTarget;
  title: string;
  description: string;
  action: ReviewAction;
  reviewStatus: ReviewStatus;
  blockingStatus: BlockingStatus;
  affectedObjects?: ReviewAffectedObject[];
  quantityImpacts?: ReviewQuantityImpact[];
  evidenceIds?: EvidenceId[];
  assumptionIds?: AssumptionId[];
  validationIssueIds?: ValidationIssueId[];
};

export function createReviewItem(input: CreateReviewItemInput): ReviewItem {
  return reviewItemSchema.parse({
    id: createReviewItemId(input.ruleId, input.target),
    kind: "actionable",
    origin: "validation",
    reason:
      input.blockingStatus === "blocked" ||
      input.blockingStatus === "partially-blocked"
        ? "calculation-blocked"
        : "missing-information",
    title: input.title,
    description: input.description,
    action: input.action,
    reviewStatus: input.reviewStatus,
    blockingStatus: input.blockingStatus,
    affectedObjects: input.affectedObjects ?? [],
    quantityImpacts: input.quantityImpacts ?? [],
    evidenceIds: input.evidenceIds ?? [],
    assumptionIds: input.assumptionIds ?? [],
    validationIssueIds: input.validationIssueIds ?? [],
  });
}
