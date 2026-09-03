import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInspectRegionToolResult } from "../../src/project-reading/claudeProjectInterpreter.js";

describe("B2.2L.5 vision tool result", () => {
  it("inspectRegion result includes image block and metadata text", () => {
    const result = buildInspectRegionToolResult(
      {
        pageNumber: 1,
        bbox: { x0: 10, y0: 20, x1: 100, y1: 80 },
        imagePath: "/tmp/region.png",
        widthPx: 200,
        heightPx: 150,
        toolCallId: "toolu_test123",
        ocrText: "SW_ INDICATES SHEARWALL",
        pngBase64: "iVBORw0KGgo=",
      },
      "toolu_test123",
    );

    assert.equal(result.type, "tool_result");
    assert.equal(result.tool_use_id, "toolu_test123");
    assert.ok(Array.isArray(result.content));
    const blocks = result.content as Array<{ type: string; text?: string }>;
    assert.ok(blocks.some((b) => b.type === "text"));
    assert.ok(blocks.some((b) => b.type === "image"));
    const textBlock = blocks.find((b) => b.type === "text");
    assert.ok(textBlock?.text?.includes("toolu_test123"));
    assert.ok(textBlock?.text?.includes("SHEARWALL"));
  });

  it("non-region results serialize as JSON string", () => {
    const result = buildInspectRegionToolResult({ ok: true }, "toolu_x");
    assert.equal(result.type, "tool_result");
    assert.equal(typeof result.content, "string");
    assert.match(String(result.content), /"ok":true/);
  });
});
