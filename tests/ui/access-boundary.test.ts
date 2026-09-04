import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FramingTakeoff } from "../../src/framing/schemas/framingTakeoff.schema.js";
import type { ProductAccounting } from "../../src/framing/schemas/productAccounting.schema.js";
import {
  FramingTakeoffService,
  resolveUiAccessMode,
} from "../../src/ui/framingTakeoffService.js";
import { createUiServer } from "../../src/ui/createUiServer.js";

function sampleTakeoff(): FramingTakeoff {
  return {
    schemaVersion: 2,
    projectId: "proj-access",
    pdfPath: "/tmp/sample.pdf",
    createdAt: "2026-09-03T12:00:00.000Z",
    materials: [
      {
        material: "2x4",
        lengthOrType: "8 ft studs",
        description: "2x4 regularly spaced studs at 16 in O.C.",
        quantity: 10,
        unit: "each",
        category: "lumber",
        domain: "wall",
        quantityKey: "wall.studs",
        canonicalClassification: "stud-2x4-regular-spacing",
        debugSourceIds: ["WS-001"],
      },
    ],
    assumptions: [
      {
        id: "A-1",
        summary: "kingStudCount=2",
        quantityKeys: ["opening.king-studs"],
      },
    ],
    meta: { wallCount: 1, materialCount: 1 },
  };
}

function sampleAccounting(): ProductAccounting {
  return {
    schemaVersion: 1,
    projectId: "proj-access",
    createdAt: "2026-09-03T12:00:00.000Z",
    entries: [
      {
        taxonomySection: "truss-roof",
        taxonomySectionTitle: "Truss Roof",
        taxonomyItemId: "common-trusses",
        label: "Common trusses",
        status: "unaccounted",
        gapClass: "applicability_unestablished",
      },
    ],
    summary: {
      checklistItemCount: 1,
      calculatedCount: 0,
      unaccountedCount: 1,
      byGapClass: {
        applicability_unestablished: 1,
        read_or_input_gap: 0,
        calculator_gap: 0,
      },
    },
  };
}

function seedSession(
  service: FramingTakeoffService,
  accessMode: "customer" | "developer",
): string {
  const takeoff = sampleTakeoff();
  const accounting = sampleAccounting();
  const sessionId = "sess-test-1";
  // Reach into private sessions map via startDemoSession bypass:
  // construct with access mode and inject via typed cast for unit isolation.
  const internal = service as unknown as {
    sessions: Map<
      string,
      {
        id: string;
        projectId: string;
        pdfPath: string;
        result: {
          success: boolean;
          projectId: string;
          pdfPath: string;
          takeoffPath: string | null;
          accountingPath: string | null;
          takeoff: FramingTakeoff;
          accounting: ProductAccounting;
          construction: null;
          debugPaths: string[];
          errors: string[];
        };
      }
    >;
    accessMode: "customer" | "developer";
  };
  internal.accessMode = accessMode;
  internal.sessions.set(sessionId, {
    id: sessionId,
    projectId: "proj-access",
    pdfPath: "/tmp/sample.pdf",
    result: {
      success: true,
      projectId: "proj-access",
      pdfPath: "/tmp/sample.pdf",
      takeoffPath: "artifacts/proj-access/framing/framing-takeoff.json",
      accountingPath:
        "artifacts/proj-access/framing/framing-product-accounting.json",
      takeoff,
      accounting,
      construction: null,
      debugPaths: [],
      errors: [],
    },
  });
  return sessionId;
}

describe("UI access boundary", () => {
  it("resolveUiAccessMode defaults to customer", () => {
    assert.equal(resolveUiAccessMode(undefined), "customer");
    assert.equal(resolveUiAccessMode(""), "customer");
    assert.equal(resolveUiAccessMode("customer"), "customer");
    assert.equal(resolveUiAccessMode("developer"), "developer");
    assert.equal(resolveUiAccessMode("DEVELOPER"), "developer");
  });

  it("customer view-state omits diagnostics and debug material fields", () => {
    const service = new FramingTakeoffService({ accessMode: "customer" });
    const sessionId = seedSession(service, "customer");
    const state = service.getSession(sessionId);
    assert.equal(state.accessMode, "customer");
    assert.equal("accounting" in state, false);
    assert.equal("takeoffPath" in state, false);
    assert.equal("accountingPath" in state, false);
    assert.equal(state.takeoff.materials[0]?.material, "2x4");
    assert.equal(state.takeoff.materials[0]?.quantity, 10);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        state.takeoff.materials[0],
        "debugSourceIds",
      ),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        state.takeoff.materials[0],
        "canonicalClassification",
      ),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(state.takeoff.assumptions?.[0], "id"),
      false,
    );
  });

  it("developer view-state includes same quantities plus diagnostics", () => {
    const service = new FramingTakeoffService({ accessMode: "developer" });
    const sessionId = seedSession(service, "developer");
    const state = service.getSession(sessionId);
    assert.equal(state.accessMode, "developer");
    if (state.accessMode !== "developer") {
      assert.fail("expected developer");
    }
    assert.equal(state.takeoff.materials[0]?.quantity, 10);
    assert.deepEqual(state.takeoff.materials[0]?.debugSourceIds, ["WS-001"]);
    assert.ok(state.accounting);
    assert.equal(state.accounting.entries[0]?.gapClass, "applicability_unestablished");
    assert.ok(state.takeoffPath);
    assert.ok(state.accountingPath);
  });

  it("HTTP customer mode does not expose accounting payload", async () => {
    const service = new FramingTakeoffService({ accessMode: "customer" });
    seedSession(service, "customer");
    const server = createUiServer(service);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    try {
      const access = await fetch(`http://127.0.0.1:${port}/api/access`);
      assert.equal(access.status, 200);
      assert.deepEqual(await access.json(), { accessMode: "customer" });

      const session = await fetch(
        `http://127.0.0.1:${port}/api/sessions/sess-test-1`,
      );
      assert.equal(session.status, 200);
      const body = (await session.json()) as Record<string, unknown>;
      const bodyText = JSON.stringify(body);
      assert.equal(bodyText.includes("gapClass"), false);
      assert.equal(bodyText.includes("applicability_unestablished"), false);
      const takeoff = body.takeoff as FramingTakeoff;
      assert.equal(takeoff.materials[0]?.quantity, 10);
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          takeoff.materials[0],
          "canonicalClassification",
        ),
        false,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
