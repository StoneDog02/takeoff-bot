import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveUseMockAi } from "../../src/config/aiMode.js";

describe("resolveUseMockAi", () => {
  it("uses mock extraction when Anthropic is not configured", () => {
    assert.equal(
      resolveUseMockAi({ live: false, anthropicConfigured: false }),
      true,
    );
  });

  it("uses live Claude when Anthropic is configured", () => {
    assert.equal(
      resolveUseMockAi({ live: false, anthropicConfigured: true }),
      false,
    );
  });

  it("never falls back to mock in --live mode", () => {
    assert.equal(
      resolveUseMockAi({ live: true, anthropicConfigured: true }),
      false,
    );
  });

  it("fails clearly when --live is requested without an API key", () => {
    assert.throws(
      () => resolveUseMockAi({ live: true, anthropicConfigured: false }),
      /ANTHROPIC_API_KEY is required for --live/,
    );
  });
});
