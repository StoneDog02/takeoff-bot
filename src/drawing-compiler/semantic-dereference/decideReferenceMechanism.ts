import type { ReferenceMechanism } from "../semantic-dereference/referenceMechanism.schema.js";
import type { ConventionInventoryEntry } from "../semantic-dereference/referenceMechanism.schema.js";

export function decideReferenceMechanism(input: {
  inventory: readonly ConventionInventoryEntry[];
  textualSwMarkCount: number;
  tagWithLeaderCount: number;
  keyedNoteCount: number;
  graphicConventionCount: number;
  ocrRecoveredKeys: readonly string[];
}): {
  referenceMechanism: ReferenceMechanism;
  rationale: string[];
} {
  const rationale: string[] = [];
  const mechanisms: ReferenceMechanism[] = [];

  const hasTags =
    input.textualSwMarkCount > 0 ||
    input.inventory.some(
      (e) =>
        (e.conventionClass === "wall-type-tag" || e.conventionClass === "textual-sw-mark") &&
        e.canEstablishSemanticKey,
    );
  const hasLeaders = input.tagWithLeaderCount > 0;
  const hasKeyed = input.keyedNoteCount > 0;
  const hasGraphic =
    input.graphicConventionCount > 0 &&
    input.inventory.some((e) => e.conventionClass === "line-style-shear");

  if (hasTags) {
    mechanisms.push(hasLeaders ? "TAG_LEADER" : "TAG");
    rationale.push(
      hasLeaders
        ? `Recovered ${input.textualSwMarkCount || "classified"} wall-type tag(s) with leader geometry.`
        : `Recovered classified wall-type tag(s) without confirmed leaders.`,
    );
  }
  if (hasKeyed) {
    mechanisms.push("KEYED_NOTE");
    rationale.push(`Found ${input.keyedNoteCount} keyed-note convention(s).`);
  }
  if (hasGraphic && !hasTags) {
    mechanisms.push("GRAPHIC_CONVENTION");
    rationale.push(
      "Graphic linework convention detected without explicit SW text tags.",
    );
  }

  if (mechanisms.length === 0) {
    if (input.ocrRecoveredKeys.length > 0) {
      mechanisms.push("TAG");
      rationale.push(
        `OCR recovered type keys (${input.ocrRecoveredKeys.join(", ")}) on plan sheet.`,
      );
    } else {
      return {
        referenceMechanism: "NOT_ESTABLISHED",
        rationale: [
          "Full sheet audit found no deterministic plan-side shear-wall reference convention.",
        ],
      };
    }
  }

  if (mechanisms.length > 1) {
    return { referenceMechanism: "MIXED", rationale };
  }
  return { referenceMechanism: mechanisms[0]!, rationale };
}
