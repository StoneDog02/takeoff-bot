import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decidePhase0Branch } from "../../src/drawing-compiler/semantic-mark-recovery/decidePhase0Branch.js";
import type { VisualMarkPageAudit } from "../../src/drawing-compiler/semantic-mark-recovery/auditVisualMarkPage.js";

function blankAudit(label: string, overrides: Partial<VisualMarkPageAudit> = {}): VisualMarkPageAudit {
  return {
    label,
    pageNumber: 1,
    pdfPath: "x.pdf",
    nativeTextItemCount: 0,
    annotationSegmentCount: 0,
    enclosureCount: 0,
    leaderCount: 0,
    eligibleRunCount: 0,
    dominantEncodingClasses: [],
    strategyTrials: [],
    recoveredSignals: [],
    scheduleLikeTextCount: 0,
    ...overrides,
  };
}

describe("decidePhase0Branch", () => {
  it("returns STOP when no recovery and no structure", () => {
    const result = decidePhase0Branch([
      blankAudit("beckstead-p4-plan"),
    ]);
    assert.equal(result.phase0Decision, "STOP");
  });

  it("returns ENCLOSURE_OCR when enclosure trial beats run-band", () => {
    const result = decidePhase0Branch([
      blankAudit("beckstead-p4-plan", {
        enclosureCount: 12,
        strategyTrials: [
          {
            strategy: "run-band",
            candidateRegionsGenerated: 40,
            ocrCallsRequired: 18,
            marksRecovered: 0,
            typeIdentifierRecovered: 0,
            recoveredSamples: [],
          },
          {
            strategy: "enclosure-interior",
            candidateRegionsGenerated: 12,
            ocrCallsRequired: 12,
            marksRecovered: 2,
            typeIdentifierRecovered: 2,
            recoveredSamples: [
              { rawText: "SW2", normalizedKey: "SW2", regionKind: "enclosure-interior" },
            ],
          },
        ],
      }),
    ]);
    assert.equal(result.phase0Decision, "ENCLOSURE_OCR");
  });

  it("returns LEADER_CALLOUT when leader trial wins", () => {
    const result = decidePhase0Branch([
      blankAudit("beckstead-p4-plan", {
        leaderCount: 5,
        strategyTrials: [
          {
            strategy: "leader-endpoint",
            candidateRegionsGenerated: 5,
            ocrCallsRequired: 5,
            marksRecovered: 1,
            typeIdentifierRecovered: 1,
            recoveredSamples: [
              { rawText: "W1", normalizedKey: "W1", regionKind: "leader-endpoint" },
            ],
          },
          {
            strategy: "run-band",
            candidateRegionsGenerated: 30,
            ocrCallsRequired: 18,
            marksRecovered: 0,
            typeIdentifierRecovered: 0,
            recoveredSamples: [],
          },
        ],
      }),
    ]);
    assert.equal(result.phase0Decision, "LEADER_CALLOUT");
  });
});
