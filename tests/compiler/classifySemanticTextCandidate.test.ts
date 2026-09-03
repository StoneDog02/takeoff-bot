import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifySemanticTextCandidate,
  isTypeOrAssemblyIdentifier,
  normalizeTypeIdentifierKey,
} from "../../src/compiler/type-marks/classifySemanticTextCandidate.js";

describe("classifySemanticTextCandidate", () => {
  it("classifies reusable type identifiers", () => {
    assert.equal(classifySemanticTextCandidate("SW2"), "type-or-assembly-identifier");
    assert.equal(classifySemanticTextCandidate("W1"), "type-or-assembly-identifier");
    assert.equal(classifySemanticTextCandidate("W-001"), "type-or-assembly-identifier");
    assert.equal(
      classifySemanticTextCandidate("TYPE A"),
      "type-or-assembly-identifier",
    );
    assert.ok(isTypeOrAssemblyIdentifier("SW5"));
  });

  it("rejects wall property phrases as identity", () => {
    assert.equal(
      classifySemanticTextCandidate("BEARING WALL"),
      "wall-property-or-classification",
    );
    assert.equal(
      classifySemanticTextCandidate("2X4 WALL"),
      "wall-property-or-classification",
    );
    assert.equal(
      classifySemanticTextCandidate("EXTERIOR WALL"),
      "wall-property-or-classification",
    );
    assert.equal(isTypeOrAssemblyIdentifier("BEARING WALL"), false);
  });

  it("rejects general notes and schedule text", () => {
    assert.equal(classifySemanticTextCandidate("GENERAL NOTES"), "general-note");
    assert.equal(classifySemanticTextCandidate("NOTE 3"), "general-note");
    assert.equal(
      classifySemanticTextCandidate("WALL SCHEDULE"),
      "schedule-or-legend-text",
    );
  });

  it("rejects imperial dimensions and unknown text", () => {
    assert.equal(classifySemanticTextCandidate("12'-0\""), "unknown");
    assert.equal(classifySemanticTextCandidate(""), "unknown");
  });

  it("normalizes identifier keys", () => {
    assert.equal(normalizeTypeIdentifierKey("sw2"), "SW2");
    assert.equal(normalizeTypeIdentifierKey("Type A"), "A");
  });
});
