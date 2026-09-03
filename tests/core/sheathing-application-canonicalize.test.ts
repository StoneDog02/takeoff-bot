import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalizeSheathingApplication,
  normalizeSheathingSystemCandidate,
} from "../../src/framing/resolve/sheathingPropertyPaths.js";
import { normalizeOpeningCandidate } from "../../src/framing/resolve/openingPropertyPaths.js";
import { normalizeWallFramingCandidate } from "../../src/framing/resolve/wallFramingPropertyPaths.js";
import { normalizeStructuralMemberCandidate } from "../../src/framing/resolve/structuralMemberPropertyPaths.js";

describe("canonicalizeSheathingApplication", () => {
  it("maps explicit wall terminology to wall", () => {
    for (const candidate of [
      "wall",
      "WALLS",
      "wall sheathing",
      "EXTERIOR WALLS",
      "exterior wall",
      "interior walls",
      "exterior wall sheathing",
      "EXT WALL",
      "EXT WALLS",
      "INT WALL",
      "INT WALLS",
    ]) {
      assert.equal(
        canonicalizeSheathingApplication(candidate),
        "wall",
        candidate,
      );
    }
  });

  it("maps explicit floor and roof terminology", () => {
    assert.equal(canonicalizeSheathingApplication("floor sheathing"), "floor");
    assert.equal(canonicalizeSheathingApplication("subfloor"), "floor");
    assert.equal(canonicalizeSheathingApplication("roof decking"), "roof");
    assert.equal(canonicalizeSheathingApplication("ROOF SHEATHING"), "roof");
  });

  it("rejects ambiguous or substring-only forms", () => {
    for (const candidate of [
      "sidewall",
      "firewall panel",
      "party",
      "sheathing",
      "exterior",
      "interior",
      "EXT",
      "INT",
      "walls and roofs",
      "arbitrary-wall-stuff",
    ]) {
      assert.equal(
        canonicalizeSheathingApplication(candidate),
        undefined,
        candidate,
      );
    }
  });

  it("does not alias EXT/INT WALL into wall.location", () => {
    assert.equal(normalizeWallFramingCandidate("location", "EXT WALL"), undefined);
    assert.equal(normalizeWallFramingCandidate("location", "INT WALLS"), undefined);
    assert.equal(normalizeWallFramingCandidate("location", "EXTERIOR"), undefined);
    assert.equal(normalizeWallFramingCandidate("location", "INTERIOR"), undefined);
    assert.equal(normalizeWallFramingCandidate("location", "exterior"), "exterior");
    assert.equal(normalizeWallFramingCandidate("location", "interior"), "interior");
  });

  it("is used by normalizeSheathingSystemCandidate without mutating inputs", () => {
    assert.equal(
      normalizeSheathingSystemCandidate("application", "EXTERIOR WALLS"),
      "wall",
    );
    assert.equal(
      normalizeSheathingSystemCandidate("application", "sidewall"),
      undefined,
    );
  });
});

describe("cross-domain enum boundaries (documented exact-only posture)", () => {
  it("keeps opening category / wall location / SM category exact-case for now", () => {
    // Deferred: case folding would help WINDOW→window / EXTERIOR→exterior /
    // HEADER→header, but existing resolver contracts intentionally leave
    // non-exact casing unresolved. Milestone H only expands sheathing
    // application alias vocabulary where Brain supports assembly-class mapping.
    assert.equal(normalizeOpeningCandidate("category", "WINDOW"), undefined);
    assert.equal(normalizeWallFramingCandidate("location", "EXTERIOR"), undefined);
    assert.equal(
      normalizeStructuralMemberCandidate("category", "HEADER"),
      undefined,
    );
  });
});
