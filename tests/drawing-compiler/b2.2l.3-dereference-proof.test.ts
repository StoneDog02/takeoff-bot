import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { compileDrawingPage } from "../../src/drawing-compiler/compileDrawingPage.js";
import {
  buildDereferencedBindingEvidence,
  buildSemanticDefinitionEvidenceFromCompiledPages,
} from "../../src/scopes/framing/geometry/buildSemanticDefinitionEvidenceFromCompiledPages.js";

const PDF = "tests/fixtures/beckstead-residence-plans.pdf";
const PROOF_TARGET = path.resolve("artifacts/b2.2l.3/metrics/phase0-proof-target.json");

describe("B2.2L.3 dereference proof (Beckstead)", () => {
  it("schedule keys do not bind all p4 runs without plan reference", async () => {
    const prevDef = process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION;
    const prevProof = process.env.TAKEOFF_B2_2L3_PROOF;
    process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = "1";
    process.env.TAKEOFF_B2_2L3_PROOF = "1";
    try {
      const p1 = await compileDrawingPage({
        pdfPath: PDF,
        pageNumber: 1,
        options: { smoke: true, maxOcr: 4 },
      });
      const p4 = await compileDrawingPage({
        pdfPath: PDF,
        pageNumber: 4,
        options: {
          smoke: true,
          maxOcr: 4,
          crossPageDefinitions: p1.semanticDefinitions?.definitions ?? [],
        },
      });
      const runCount = p4.geometry.pbgRuns.length;
      const emitCount = p4.semanticDereference?.metrics.emitCount ?? 0;
      assert.ok(emitCount < runCount, "schedule-only binding must not cover all runs");
    } finally {
      if (prevDef === undefined) delete process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION;
      else process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = prevDef;
      if (prevProof === undefined) delete process.env.TAKEOFF_B2_2L3_PROOF;
      else process.env.TAKEOFF_B2_2L3_PROOF = prevProof;
    }
  });

  it("full dereference path when Phase 0 proof target has matching key", async () => {
    let proofTarget: {
      selectedPhysicalRunKey: string | null;
      discoveredSemanticKey: string | null;
      matchingDefinitionId: string | null;
    } | null = null;
    try {
      proofTarget = JSON.parse(
        await readFile(PROOF_TARGET, "utf8"),
      ) as typeof proofTarget;
    } catch {
      return;
    }
    if (!proofTarget?.selectedPhysicalRunKey || !proofTarget.discoveredSemanticKey) {
      return;
    }

    const prevDef = process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION;
    const prevProof = process.env.TAKEOFF_B2_2L3_PROOF;
    process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = "1";
    process.env.TAKEOFF_B2_2L3_PROOF = "1";
    try {
      const p1 = await compileDrawingPage({
        pdfPath: PDF,
        pageNumber: 1,
        options: { smoke: true, maxOcr: 4 },
      });
      const p4 = await compileDrawingPage({
        pdfPath: PDF,
        pageNumber: 4,
        options: {
          smoke: true,
          maxOcr: 4,
          crossPageDefinitions: p1.semanticDefinitions?.definitions ?? [],
        },
      });

      const bindingEvidence = buildDereferencedBindingEvidence([p4]);
      const defEvidence = buildSemanticDefinitionEvidenceFromCompiledPages([p1]);

      const runBinding = bindingEvidence.find(
        (e) => e.subjectKey === proofTarget!.selectedPhysicalRunKey,
      );
      if (proofTarget.matchingDefinitionId) {
        assert.ok(runBinding, "expected dereferenced binding for proof target run");
        assert.equal(
          runBinding!.candidateValue,
          proofTarget.discoveredSemanticKey,
        );
        assert.ok(
          defEvidence.some(
            (e) => e.subjectKey === proofTarget!.discoveredSemanticKey,
          ),
        );
      }
    } finally {
      if (prevDef === undefined) delete process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION;
      else process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = prevDef;
      if (prevProof === undefined) delete process.env.TAKEOFF_B2_2L3_PROOF;
      else process.env.TAKEOFF_B2_2L3_PROOF = prevProof;
    }
  });
});
