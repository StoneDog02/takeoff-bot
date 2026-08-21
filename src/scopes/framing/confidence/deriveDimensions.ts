import type {
  ConfidenceDimension,
  ConfidenceDimensionLabel,
} from "../../../core/schemas/confidence.schema.js";
import type { ConfidenceLabel } from "../../../core/schemas/status.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type {
  ValidationIssue,
  ValidationResult,
} from "../../../core/schemas/validation.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";

export function deriveResolutionConfidence(
  traces: PropertyResolutionTrace[],
): ConfidenceDimension {
  if (traces.length === 0) {
    return {
      label: "medium",
      explanation: "No property resolution traces were recorded for this object.",
    };
  }

  if (traces.some((trace) => trace.method === "unresolved")) {
    return {
      label: "low",
      explanation: "One or more properties remain unresolved.",
    };
  }

  if (
    traces.every(
      (trace) =>
        trace.method === "explicit-project-value" ||
        trace.method === "deterministic-calculation",
    )
  ) {
    return {
      label: "high",
      explanation: "Values were resolved from explicit project data or calculation.",
    };
  }

  if (
    traces.some(
      (trace) =>
        trace.method === "approved-default" || trace.method === "user-override",
    )
  ) {
    return {
      label: "high",
      explanation:
        "Values were resolved through an approved default or user override.",
    };
  }

  return {
    label: "medium",
    explanation: "One or more properties used supported inference.",
  };
}

export function deriveEvidenceConfidence(
  evidenceIds: readonly string[],
  traces: PropertyResolutionTrace[],
): ConfidenceDimension {
  if (evidenceIds.length === 0) {
    return {
      label: "low",
      explanation: "No supporting evidence IDs are attached to this object.",
    };
  }

  const traceEvidenceIds = new Set(
    traces.flatMap((trace) => trace.evidenceIds),
  );
  const corroborated =
    traceEvidenceIds.size > 0 &&
    [...traceEvidenceIds].every((evidenceId) => evidenceIds.includes(evidenceId));

  if (
    corroborated &&
    traces.every(
      (trace) =>
        trace.method === "explicit-project-value" ||
        trace.method === "deterministic-calculation",
    )
  ) {
    return {
      label: "high",
      explanation: "Supporting evidence corroborates explicit project values.",
    };
  }

  if (traces.some((trace) => trace.method === "supported-inference")) {
    return {
      label: "medium",
      explanation: "Evidence supports the object but not every value is explicit.",
    };
  }

  return {
    label: "medium",
    explanation: "Evidence is present but not fully corroborated across properties.",
  };
}

export function deriveValidationConfidence(
  results: ValidationResult[],
  issues: ValidationIssue[],
): ConfidenceDimension {
  if (results.length === 0) {
    return {
      label: "medium",
      explanation: "No validation rules evaluated this object.",
    };
  }

  const failedResults = results.filter((result) => result.outcome === "failed");
  if (failedResults.length === 0) {
    return {
      label: "high",
      explanation: "All evaluated validation rules passed or were skipped.",
    };
  }

  if (
    issues.some(
      (issue) => issue.severity === "critical" || issue.severity === "blocking",
    )
  ) {
    return {
      label: "low",
      explanation: "Critical validation issues remain for this object.",
    };
  }

  return {
    label: "medium",
    explanation: "Validation warnings remain but calculation may still proceed.",
  };
}

export function deriveOverallLabel(
  dimensions: ConfidenceDimension[],
  blocked: boolean,
): ConfidenceLabel {
  if (blocked) {
    return "blocked";
  }

  if (dimensions.some((dimension) => dimension.label === "low")) {
    return "low";
  }

  if (dimensions.some((dimension) => dimension.label === "medium")) {
    return "medium";
  }

  return "high";
}

export function deriveReviewStatus(
  objectReviewStatus: ReviewItem["reviewStatus"] | string,
  reviewItems: ReviewItem[],
): ReviewItem["reviewStatus"] {
  if (reviewItems.some((item) => item.blockingStatus === "blocked")) {
    return "review-required";
  }

  if (reviewItems.length > 0) {
    return "review-recommended";
  }

  return objectReviewStatus as ReviewItem["reviewStatus"];
}

export function deriveBlockingStatus(
  objectBlockingStatus: ReviewItem["blockingStatus"] | string,
  reviewItems: ReviewItem[],
): ReviewItem["blockingStatus"] {
  if (reviewItems.some((item) => item.blockingStatus === "blocked")) {
    return "blocked";
  }

  if (reviewItems.some((item) => item.blockingStatus === "partially-blocked")) {
    return "partially-blocked";
  }

  return objectBlockingStatus as ReviewItem["blockingStatus"];
}

export function quantityImpactWeightForObjectType(
  objectType: string,
): "low" | "medium" | "high" {
  switch (objectType) {
    case "building-wall":
    case "structural-member":
    case "floor-framing-area":
    case "roof-plane":
    case "sheathing-area":
      return "high";
    case "wall-segment":
    case "opening":
    case "floor-framing-system":
    case "roof-framing-system":
    case "sheathing-system":
      return "medium";
    default:
      return "low";
  }
}
