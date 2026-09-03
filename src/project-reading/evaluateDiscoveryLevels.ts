import type {
  ProjectDictionary,
  ProjectConventionHypothesis,
  ProjectReferenceBinding,
  ProjectObservation,
  ProjectSemanticDefinition,
} from "./schemas/projectDictionary.schema.js";
import type { GovernanceReport } from "./dictionaryGovernor.js";

export type DiscoveryLevels = {
  level1Safe: boolean;
  level2Discovery: boolean;
  level3GovernedDiscovery: boolean;
  level1Notes: string[];
  level2Notes: string[];
  level3Notes: string[];
  newObservations: ProjectObservation[];
  newHypotheses: ProjectConventionHypothesis[];
  newDefinitions: ProjectSemanticDefinition[];
  newBindings: ProjectReferenceBinding[];
  governorAcceptedNewIds: string[];
  governorRejectedNewIds: string[];
  noDiscovery: boolean;
};

export type L5Recommendation = "A" | "B" | "C" | "D" | "NO_DISCOVERY";

function normalizeClaim(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function claimsEquivalent(a: string, b: string): boolean {
  const na = normalizeClaim(a);
  const nb = normalizeClaim(b);
  if (na === nb) return true;
  if (na.length > 20 && nb.length > 20) {
    return na.includes(nb.slice(0, 40)) || nb.includes(na.slice(0, 40));
  }
  return false;
}

function isNewObservation(
  obs: ProjectObservation,
  seed: ProjectDictionary,
): boolean {
  return !seed.observations.some((s) => claimsEquivalent(s.claim, obs.claim));
}

function isNewHypothesis(
  hyp: ProjectConventionHypothesis,
  seed: ProjectDictionary,
): boolean {
  return !seed.hypotheses.some((s) => claimsEquivalent(s.claim, hyp.claim));
}

function isNewDefinition(
  def: ProjectSemanticDefinition,
  seed: ProjectDictionary,
): boolean {
  return !seed.definitions.some(
    (s) => s.semanticTypeKey === def.semanticTypeKey,
  );
}

function isNewBinding(
  binding: ProjectReferenceBinding,
  seed: ProjectDictionary,
): boolean {
  return !seed.bindings.some(
    (s) =>
      s.physicalRunKey === binding.physicalRunKey &&
      s.referenceKey === binding.referenceKey,
  );
}

export function evaluateDiscoveryLevels(input: {
  seedBaseline: ProjectDictionary;
  liveDictionary: ProjectDictionary;
  governanceReport: GovernanceReport;
}): DiscoveryLevels {
  const { seedBaseline, liveDictionary, governanceReport } = input;

  const newObservations = liveDictionary.observations.filter((o) =>
    isNewObservation(o, seedBaseline),
  );
  const newHypotheses = liveDictionary.hypotheses.filter((h) =>
    isNewHypothesis(h, seedBaseline),
  );
  const newDefinitions = liveDictionary.definitions.filter((d) =>
    isNewDefinition(d, seedBaseline),
  );
  const newBindings = liveDictionary.bindings.filter((b) =>
    isNewBinding(b, seedBaseline),
  );

  const level1Notes: string[] = [];
  const sw1Failure = governanceReport.greenOutcome === "FAILURE" &&
    governanceReport.greenCriterion?.includes("SW1");
  const hallucinationFailure =
    governanceReport.greenOutcome === "FAILURE" &&
    governanceReport.greenCriterion?.includes("Hallucinated");
  const unsupportedBinding = liveDictionary.bindings.some(
    (b) =>
      b.status === "established_binding" &&
      /^SW\d/i.test(b.referenceKey ?? "") &&
      governanceReport.rejectedBindingIds.includes(b.physicalRunKey),
  );
  const level1Safe =
    !sw1Failure && !hallucinationFailure && !unsupportedBinding;
  if (level1Safe) {
    level1Notes.push("No unsupported SW* bindings or hallucinated established rules.");
  } else {
    if (sw1Failure) level1Notes.push("FAILURE: unsupported SW1 binding attempt.");
    if (hallucinationFailure) level1Notes.push("FAILURE: hallucinated citation.");
    if (unsupportedBinding) level1Notes.push("Rejected unsupported subtype binding.");
  }

  const hasNewContent =
    newObservations.length > 0 ||
    newHypotheses.length > 0 ||
    newDefinitions.length > 0 ||
    newBindings.length > 0;

  const promotedEstablished = [
    ...liveDictionary.hypotheses.filter(
      (h) =>
        h.status === "established_rule" &&
        seedBaseline.hypotheses.every(
          (s) => s.id !== h.id || s.status !== "established_rule",
        ),
    ),
    ...liveDictionary.bindings.filter(
      (b) =>
        b.status === "established_binding" &&
        seedBaseline.bindings.every(
          (s) =>
            s.physicalRunKey !== b.physicalRunKey ||
            s.status !== "established_binding",
        ),
    ),
  ];

  const level2Discovery = hasNewContent;
  const level2Notes: string[] = [];
  if (level2Discovery) {
    level2Notes.push(
      `New content: ${newObservations.length} obs, ${newHypotheses.length} hyp, ${newDefinitions.length} defs, ${newBindings.length} bindings.`,
    );
  } else {
    level2Notes.push("No semantic delta vs seed baseline.");
  }

  const governorAcceptedNewIds = [
    ...governanceReport.acceptedHypothesisIds.filter((id) =>
      newHypotheses.some((h) => h.id === id) ||
      liveDictionary.hypotheses.some(
        (h) =>
          h.id === id &&
          h.status === "established_rule" &&
          seedBaseline.hypotheses.every(
            (s) => s.id !== id || s.status !== "established_rule",
          ),
      ),
    ),
    ...governanceReport.acceptedBindingIds.filter((id) =>
      newBindings.some((b) => b.physicalRunKey === id),
    ),
  ];

  const governorRejectedNewIds = [
    ...governanceReport.rejectedHypothesisIds.filter((id) =>
      newHypotheses.some((h) => h.id === id),
    ),
    ...governanceReport.rejectedBindingIds.filter((id) =>
      newBindings.some((b) => b.physicalRunKey === id),
    ),
  ];

  const level3GovernedDiscovery = governorAcceptedNewIds.length > 0;
  const level3Notes: string[] = [];
  if (level3GovernedDiscovery) {
    level3Notes.push(
      `Governor accepted new claims: ${governorAcceptedNewIds.join(", ")}`,
    );
  } else if (level2Discovery) {
    level3Notes.push(
      "Discovery present but none survived governance as established_rule/binding.",
    );
  } else {
    level3Notes.push("No governed discovery.");
  }

  const noDiscovery =
    !level2Discovery &&
    liveDictionary.hypotheses.every((h) =>
      seedBaseline.hypotheses.some((s) => claimsEquivalent(s.claim, h.claim)),
    );

  return {
    level1Safe,
    level2Discovery,
    level3GovernedDiscovery,
    level1Notes,
    level2Notes,
    level3Notes,
    newObservations,
    newHypotheses,
    newDefinitions,
    newBindings,
    governorAcceptedNewIds,
    governorRejectedNewIds,
    noDiscovery,
  };
}

export function mapLevelsToRecommendation(
  levels: DiscoveryLevels,
  liveRunSucceeded: boolean,
): L5Recommendation {
  if (!liveRunSucceeded) return "B";
  if (levels.level3GovernedDiscovery) return "A";
  if (levels.noDiscovery) return "NO_DISCOVERY";
  if (levels.level2Discovery && !levels.level3GovernedDiscovery) return "B";
  if (!levels.level1Safe) return "B";
  return "NO_DISCOVERY";
}
