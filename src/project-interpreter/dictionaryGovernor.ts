import type {
  ProjectConventionHypothesis,
  ProjectDictionary,
  ProjectReferenceBinding,
  ProjectSemanticDefinition,
  ProvenanceRef,
} from "./schemas/projectDictionary.schema.js";
import type { CompilerInvestigationFacade } from "./compilerInvestigationFacade.js";
import { normalizeForScheduleMatch } from "../drawing-compiler/semantic-definitions/extractScheduleFromRowBands.js";

export type ValidatorResult = {
  validator: string;
  claimId: string;
  passed: boolean;
  message: string;
};

export type GovernanceReport = {
  evaluatedAt: string;
  passRate: number;
  acceptedHypothesisIds: string[];
  rejectedHypothesisIds: string[];
  acceptedBindingIds: string[];
  rejectedBindingIds: string[];
  acceptedDefinitionKeys: string[];
  rejectedDefinitionKeys: string[];
  validatorResults: ValidatorResult[];
  greenOutcome: "GREEN" | "FAILURE" | "STOP" | null;
  greenCriterion: string | null;
  dictionary: ProjectDictionary;
};

function quoteSnippets(claim: string): string[] {
  const matches = claim.match(/"([^"]{3,120})"/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

function isGraphicConventionClaim(claim: string): boolean {
  return /heavy\s*line|lineweight|line\s*weight|graphic\s*convention/i.test(
    claim,
  );
}

function isSubtypeBinding(binding: ProjectReferenceBinding): boolean {
  return binding.referenceKey != null && /^SW\d/i.test(binding.referenceKey);
}

function isScheduleOnlyProvenance(provenance: ProvenanceRef[]): boolean {
  return (
    provenance.length > 0 &&
    provenance.every(
      (p) =>
        p.kind === "artifact" &&
        (p.artifactPath?.includes("schedule") ||
          p.artifactPath?.includes("definition") ||
          p.pageNumber === 1),
    )
  );
}

export class DictionaryGovernor {
  constructor(private readonly facade: CompilerInvestigationFacade) {}

  async govern(dictionary: ProjectDictionary): Promise<GovernanceReport> {
    const validatorResults: ValidatorResult[] = [];
    const acceptedHypothesisIds: string[] = [];
    const rejectedHypothesisIds: string[] = [];
    const acceptedBindingIds: string[] = [];
    const rejectedBindingIds: string[] = [];

    for (const obs of dictionary.observations) {
      const r = this.verifyProvenanceExists(obs.id, obs.provenance);
      validatorResults.push(r);
    }

    for (const hyp of dictionary.hypotheses) {
      const results = await this.validateHypothesis(hyp);
      validatorResults.push(...results);
      const failed = results.some((r) => !r.passed);
      if (failed || hyp.status === "rejected") {
        rejectedHypothesisIds.push(hyp.id);
        hyp.status = "rejected";
      } else if (hyp.status === "established_rule") {
        acceptedHypothesisIds.push(hyp.id);
      }
    }

    for (const binding of dictionary.bindings) {
      const results = await this.validateBinding(binding);
      validatorResults.push(...results);
      const failed = results.some((r) => !r.passed);
      if (failed || binding.status === "rejected") {
        rejectedBindingIds.push(binding.physicalRunKey);
        binding.status = "rejected";
      } else if (binding.status === "established_binding") {
        acceptedBindingIds.push(binding.physicalRunKey);
      }
    }

    const acceptedDefinitionKeys: string[] = [];
    const rejectedDefinitionKeys: string[] = [];

    for (const def of dictionary.definitions) {
      const results = this.validateDefinition(def);
      validatorResults.push(...results);
      const failed = results.some((r) => !r.passed);
      if (failed) {
        rejectedDefinitionKeys.push(def.semanticTypeKey);
      } else {
        acceptedDefinitionKeys.push(def.semanticTypeKey);
      }
    }

    const totalClaims =
      dictionary.hypotheses.length +
      dictionary.bindings.filter((b) => b.status !== "unresolved").length +
      dictionary.definitions.length;
    const passed = validatorResults.filter((r) => r.passed).length;
    const passRate =
      validatorResults.length > 0 ? passed / validatorResults.length : 1;

    const green = this.evaluateGreen(dictionary, {
      acceptedHypothesisIds,
      rejectedHypothesisIds,
      acceptedBindingIds,
      rejectedBindingIds,
      acceptedDefinitionKeys,
      rejectedDefinitionKeys,
      validatorResults,
    });

    return {
      evaluatedAt: new Date().toISOString(),
      passRate,
      acceptedHypothesisIds,
      rejectedHypothesisIds,
      acceptedBindingIds,
      rejectedBindingIds,
      acceptedDefinitionKeys,
      rejectedDefinitionKeys,
      validatorResults,
      greenOutcome: green.outcome,
      greenCriterion: green.criterion,
      dictionary,
    };
  }

  verifyProvenanceExists(
    claimId: string,
    provenance: ProvenanceRef[],
  ): ValidatorResult {
    if (provenance.length === 0) {
      return {
        validator: "verifyProvenanceExists",
        claimId,
        passed: false,
        message: "No provenance references",
      };
    }
    for (const ref of provenance) {
      if (!ref.toolCallId || ref.toolCallId.length === 0) {
        return {
          validator: "verifyProvenanceExists",
          claimId,
          passed: false,
          message: "Provenance missing toolCallId",
        };
      }
    }
    return {
      validator: "verifyProvenanceExists",
      claimId,
      passed: true,
      message: "Provenance present",
    };
  }

  async verifyTextCitation(
    claimId: string,
    claim: string,
    provenance?: ProvenanceRef[],
  ): Promise<ValidatorResult> {
    const snippets = quoteSnippets(claim);
    if (snippets.length === 0) {
      return {
        validator: "verifyTextCitation",
        claimId,
        passed: true,
        message: "No quoted text to verify",
      };
    }
    for (const snippet of snippets) {
      const hits = this.facade.searchProjectText(snippet.slice(0, 40));
      const found = hits.some((h) =>
        h.text.toLowerCase().includes(snippet.toLowerCase().slice(0, 20)),
      );
      if (found) continue;

      const visionOk = this.verifySnippetInVisionCache(
        snippet,
        provenance ?? [],
      );
      if (!visionOk) {
        return {
          validator: "verifyTextCitation",
          claimId,
          passed: false,
          message: `Quoted text not found in project text or region OCR: "${snippet.slice(0, 40)}"`,
        };
      }
    }
    return {
      validator: "verifyTextCitation",
      claimId,
      passed: true,
      message: "Quoted text verified",
    };
  }

  verifyVisionRegionCitation(
    claimId: string,
    claim: string,
    provenance: ProvenanceRef[],
  ): ValidatorResult {
    const snippets = quoteSnippets(claim);
    const visionRefs = provenance.filter((p) => p.kind === "vision_region");
    if (visionRefs.length === 0) {
      return {
        validator: "verifyVisionRegionCitation",
        claimId,
        passed: true,
        message: "No vision_region provenance",
      };
    }
    if (snippets.length === 0) {
      return {
        validator: "verifyVisionRegionCitation",
        claimId,
        passed: true,
        message: "No quoted text requiring vision verification",
      };
    }
    for (const snippet of snippets) {
      const needle = snippet.toLowerCase().slice(0, 20);
      let found = false;
      for (const ref of visionRefs) {
        const entry = this.facade.getRegionOcrEntry(ref.toolCallId);
        if (
          entry &&
          entry.ocrText.toLowerCase().includes(needle)
        ) {
          found = true;
          break;
        }
      }
      if (!found) {
        return {
          validator: "verifyVisionRegionCitation",
          claimId,
          passed: false,
          message: `Vision region OCR does not contain quoted text: "${snippet.slice(0, 40)}"`,
        };
      }
    }
    return {
      validator: "verifyVisionRegionCitation",
      claimId,
      passed: true,
      message: "Vision region citation verified against OCR cache",
    };
  }

  private verifySnippetInVisionCache(
    snippet: string,
    provenance: ProvenanceRef[],
  ): boolean {
    const needle = snippet.toLowerCase().slice(0, 20);
    for (const ref of provenance) {
      if (ref.kind !== "vision_region") continue;
      const entry = this.facade.getRegionOcrEntry(ref.toolCallId);
      if (entry?.ocrText.toLowerCase().includes(needle)) return true;
    }
    return false;
  }

  verifyGraphicRule(
    claimId: string,
    claim: string,
    provenance: ProvenanceRef[],
  ): ValidatorResult {
    if (!isGraphicConventionClaim(claim)) {
      return {
        validator: "verifyGraphicRule",
        claimId,
        passed: true,
        message: "Not a graphic convention claim",
      };
    }
    const hasLegendOrNote = provenance.some(
      (p) =>
        p.pageNumber != null &&
        (p.kind === "compiler" ||
          p.kind === "ocr" ||
          p.kind === "vision_region"),
    );
    const scheduleOnly = isScheduleOnlyProvenance(provenance);
    if (scheduleOnly) {
      return {
        validator: "verifyGraphicRule",
        claimId,
        passed: false,
        message: "Graphic rule cannot be inferred from schedule alone",
      };
    }
    if (!hasLegendOrNote) {
      return {
        validator: "verifyGraphicRule",
        claimId,
        passed: false,
        message: "Graphic convention requires legend/note provenance on cited page",
      };
    }
    return {
      validator: "verifyGraphicRule",
      claimId,
      passed: true,
      message: "Graphic rule has non-schedule provenance",
    };
  }

  async verifySubtypeBinding(
    binding: ProjectReferenceBinding,
  ): Promise<ValidatorResult> {
    if (!isSubtypeBinding(binding)) {
      return {
        validator: "verifySubtypeBinding",
        claimId: binding.physicalRunKey,
        passed: true,
        message: "Not a subtype binding",
      };
    }
    if (binding.status === "unresolved" || binding.status === "rejected") {
      return {
        validator: "verifySubtypeBinding",
        claimId: binding.physicalRunKey,
        passed: true,
        message: "Unresolved/rejected binding — no subtype assertion",
      };
    }
    const patternHits = this.facade.findTextPattern(
      binding.referenceKey ?? "SW",
    );
    const onPlan = patternHits.some((h) => h.pageNumber >= 2);
    if (!onPlan && binding.status === "established_binding") {
      return {
        validator: "verifySubtypeBinding",
        claimId: binding.physicalRunKey,
        passed: false,
        message: `SW* key ${binding.referenceKey} not found on plan pages`,
      };
    }
    return {
      validator: "verifySubtypeBinding",
      claimId: binding.physicalRunKey,
      passed: true,
      message: "Subtype binding evidence acceptable or not asserted",
    };
  }

  async verifyRunOwnership(
    binding: ProjectReferenceBinding,
  ): Promise<ValidatorResult> {
    if (binding.status === "unresolved" || binding.status === "rejected") {
      return {
        validator: "verifyRunOwnership",
        claimId: binding.physicalRunKey,
        passed: true,
        message: "No ownership claim",
      };
    }
    const run = await this.facade.getPhysicalRun(binding.physicalRunKey);
    if (!run) {
      return {
        validator: "verifyRunOwnership",
        claimId: binding.physicalRunKey,
        passed: false,
        message: "Physical run not found in PBG",
      };
    }
    return {
      validator: "verifyRunOwnership",
      claimId: binding.physicalRunKey,
      passed: true,
      message: "Run exists in PBG",
    };
  }

  private async validateHypothesis(
    hyp: ProjectConventionHypothesis,
  ): Promise<ValidatorResult[]> {
    const results: ValidatorResult[] = [];
    results.push(this.verifyProvenanceExists(hyp.id, hyp.provenance));
    results.push(await this.verifyTextCitation(hyp.id, hyp.claim, hyp.provenance));
    results.push(
      this.verifyVisionRegionCitation(hyp.id, hyp.claim, hyp.provenance),
    );
    results.push(this.verifyGraphicRule(hyp.id, hyp.claim, hyp.provenance));

    if (hyp.status === "established_rule") {
      const graphic = isGraphicConventionClaim(hyp.claim);
      if (graphic && results.some((r) => !r.passed)) {
        hyp.status = "rejected";
        hyp.governanceNotes = [
          ...(hyp.governanceNotes ?? []),
          "Rejected: graphic rule failed governance",
        ];
      }
    }
    return results;
  }

  private validateDefinition(def: ProjectSemanticDefinition): ValidatorResult[] {
    const results: ValidatorResult[] = [];
    results.push(this.verifyProvenanceExists(def.semanticTypeKey, def.provenance));
    results.push(this.verifyDefinitionKey(def));
    results.push(this.verifyDefinitionPropertyCitation(def));
    return results;
  }

  verifyDefinitionKey(def: ProjectSemanticDefinition): ValidatorResult {
    const passed = /^SW\d/i.test(def.semanticTypeKey);
    return {
      validator: "verifyDefinitionKey",
      claimId: def.semanticTypeKey,
      passed,
      message: passed
        ? "SW schedule key pattern"
        : "Definition key must match SW* pattern",
    };
  }

  verifyDefinitionPropertyCitation(
    def: ProjectSemanticDefinition,
  ): ValidatorResult {
    for (const prop of def.properties) {
      const raw = prop.rawText.trim();
      if (!raw) {
        return {
          validator: "verifyDefinitionPropertyCitation",
          claimId: `${def.semanticTypeKey}:${prop.propertyPath}`,
          passed: false,
          message: "Empty property rawText",
        };
      }
      let found = false;
      for (const [toolCallId, entry] of this.facade.getRegionOcrCache()) {
        if (!toolCallId.startsWith("schedule-")) continue;
        const a = normalizeForScheduleMatch(raw);
        const b = normalizeForScheduleMatch(entry.ocrText);
        if (a && b && (b.includes(a) || a.includes(b))) {
          found = true;
          break;
        }
      }
      if (!found) {
        return {
          validator: "verifyDefinitionPropertyCitation",
          claimId: `${def.semanticTypeKey}:${prop.propertyPath}`,
          passed: false,
          message: `Property rawText not found in schedule OCR cache: "${raw.slice(0, 48)}"`,
        };
      }
    }
    return {
      validator: "verifyDefinitionPropertyCitation",
      claimId: def.semanticTypeKey,
      passed: true,
      message:
        def.properties.length > 0
          ? "All properties verified against schedule OCR cache"
          : "No properties to verify",
    };
  }

  private async validateBinding(
    binding: ProjectReferenceBinding,
  ): Promise<ValidatorResult[]> {
    const results: ValidatorResult[] = [];
    results.push(this.verifyProvenanceExists(binding.physicalRunKey, binding.provenance));
    results.push(await this.verifySubtypeBinding(binding));
    results.push(await this.verifyRunOwnership(binding));

    if (
      binding.status === "established_binding" &&
      isSubtypeBinding(binding) &&
      results.some((r) => !r.passed)
    ) {
      binding.status = "rejected";
      binding.governanceNotes = [
        ...(binding.governanceNotes ?? []),
        "Rejected: subtype binding failed governance",
      ];
    }
    return results;
  }

  private evaluateGreen(
    dictionary: ProjectDictionary,
    ctx: {
      acceptedHypothesisIds: string[];
      rejectedHypothesisIds: string[];
      acceptedBindingIds: string[];
      rejectedBindingIds: string[];
      acceptedDefinitionKeys: string[];
      rejectedDefinitionKeys: string[];
      validatorResults: ValidatorResult[];
    },
  ): { outcome: "GREEN" | "FAILURE" | "STOP" | null; criterion: string | null } {
    const sw1SubtypeFailure = dictionary.bindings.some(
      (b) =>
        b.referenceKey === "SW1" &&
        ctx.validatorResults.some(
          (r) =>
            r.claimId === b.physicalRunKey &&
            r.validator === "verifySubtypeBinding" &&
            !r.passed,
        ),
    );
    if (sw1SubtypeFailure) {
      return {
        outcome: "FAILURE",
        criterion: "F1: Unsupported confident SW1 binding",
      };
    }

    const hallucinated = ctx.validatorResults.some(
      (r) => r.validator === "verifyTextCitation" && !r.passed,
    );
    if (hallucinated && dictionary.hypotheses.some((h) => h.status === "established_rule")) {
      return {
        outcome: "FAILURE",
        criterion: "F4: Hallucinated legend text",
      };
    }

    if (ctx.acceptedDefinitionKeys.length > 0) {
      return {
        outcome: "GREEN",
        criterion: "D: Governed schedule definition with provenance",
      };
    }

    if (ctx.acceptedHypothesisIds.length > 0) {
      return {
        outcome: "GREEN",
        criterion: "A: Governance accepted established_rule with provenance",
      };
    }

    if (ctx.acceptedBindingIds.length > 0) {
      return {
        outcome: "GREEN",
        criterion: "B: Governance accepted established_binding",
      };
    }

    if (dictionary.unresolved.length > 0) {
      const subtypeUnresolved = dictionary.unresolved.some((u) =>
        /subtype|SW\d|SW\*/i.test(u.question + u.reason),
      );
      if (subtypeUnresolved) {
        return {
          outcome: "GREEN",
          criterion: "C: Fail-closed unresolved for subtype",
        };
      }
    }

    const rejectRate =
      dictionary.hypotheses.length > 0
        ? ctx.rejectedHypothesisIds.length / dictionary.hypotheses.length
        : 0;
    if (rejectRate > 0.5 && dictionary.unresolved.length === 0) {
      return { outcome: "STOP", criterion: "High reject rate without unresolved" };
    }

    if (dictionary.unresolved.length > 0) {
      return {
        outcome: "GREEN",
        criterion: "C: Documented unresolved conclusion",
      };
    }

    return { outcome: null, criterion: null };
  }
}

export function governDefinitions(
  definitions: ProjectSemanticDefinition[],
): ValidatorResult[] {
  return definitions.flatMap((def) => [
    {
      validator: "verifyDefinitionKey",
      claimId: def.semanticTypeKey,
      passed: /^SW\d/i.test(def.semanticTypeKey),
      message: "SW key pattern",
    },
    {
      validator: "verifyDefinition",
      claimId: def.semanticTypeKey,
      passed: def.provenance.length > 0,
      message:
        def.provenance.length > 0
          ? "Definition has provenance"
          : "Definition missing provenance",
    },
  ]);
}
