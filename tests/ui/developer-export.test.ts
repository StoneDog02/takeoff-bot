import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MASTER_TAXONOMY_CHECKLIST } from "../../src/framing/product/masterTaxonomyChecklist.js";
import { buildProductAccounting } from "../../src/framing/product/buildProductAccounting.js";
import {
  emptyFramingConstruction,
} from "../../src/framing/schemas/framingConstruction.schema.js";
import type { FramingTakeoff } from "../../src/framing/schemas/framingTakeoff.schema.js";
import type { ProductAccounting } from "../../src/framing/schemas/productAccounting.schema.js";
import {
  buildContractorCsv,
  buildDeveloperRunExport,
} from "../../src/ui/buildDeveloperRunExport.js";
import { createUiServer } from "../../src/ui/createUiServer.js";
import {
  DeveloperExportForbiddenError,
  FramingTakeoffService,
} from "../../src/ui/framingTakeoffService.js";

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
  return buildProductAccounting({
    projectId: "proj-access",
    construction: emptyFramingConstruction(),
    materials: [],
    createdAt: "2026-09-03T12:00:00.000Z",
  });
}

function seedSession(
  service: FramingTakeoffService,
  accessMode: "customer" | "developer",
): string {
  const takeoff = sampleTakeoff();
  const accounting = sampleAccounting();
  const sessionId = "sess-test-1";
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

describe("developer run export", () => {
  it("contains full accounting, materials, and diagnostic fields", () => {
    const service = new FramingTakeoffService({ accessMode: "developer" });
    const sessionId = seedSession(service, "developer");
    const exported = service.getDeveloperRunExport(sessionId);

    assert.equal(exported.exportKind, "framing-developer-run");
    assert.equal(exported.accessMode, "developer");
    assert.equal(exported.projectId, "proj-access");
    assert.equal(exported.sessionId, sessionId);
    assert.ok(exported.takeoffPath);
    assert.ok(exported.accountingPath);
    assert.equal(exported.takeoff.materials.length, 1);
    assert.equal(exported.takeoff.materials[0]?.quantity, 10);
    assert.deepEqual(exported.takeoff.materials[0]?.debugSourceIds, ["WS-001"]);
    assert.equal(
      exported.takeoff.materials[0]?.canonicalClassification,
      "stud-2x4-regular-spacing",
    );
    assert.equal(exported.takeoff.assumptions?.[0]?.id, "A-1");
    assert.equal(exported.takeoff.meta?.wallCount, 1);

    assert.equal(
      exported.accounting.entries.length,
      MASTER_TAXONOMY_CHECKLIST.items.length,
    );
    assert.equal(
      exported.accounting.summary.checklistItemCount,
      MASTER_TAXONOMY_CHECKLIST.items.length,
    );
    const first = exported.accounting.entries[0];
    assert.ok(first?.taxonomySection);
    assert.ok(first?.taxonomySectionTitle);
    assert.ok(first?.taxonomyItemId);
    assert.ok(first?.label);
    assert.ok(first?.status === "calculated" || first?.status === "unaccounted");
  });

  it("buildDeveloperRunExport preserves nested accounting entries", () => {
    const service = new FramingTakeoffService({ accessMode: "developer" });
    const sessionId = seedSession(service, "developer");
    const state = service.getSession(sessionId);
    assert.equal(state.accessMode, "developer");
    if (state.accessMode !== "developer") {
      assert.fail("expected developer");
    }
    const exported = buildDeveloperRunExport(state, "2026-09-03T18:00:00.000Z");
    assert.equal(exported.exportedAt, "2026-09-03T18:00:00.000Z");
    assert.deepEqual(exported.accounting, state.accounting);
    assert.deepEqual(exported.takeoff, state.takeoff);
  });

  it("customer mode cannot access developer export (service + HTTP)", async () => {
    const service = new FramingTakeoffService({ accessMode: "customer" });
    const sessionId = seedSession(service, "customer");
    assert.throws(
      () => service.getDeveloperRunExport(sessionId),
      (error: unknown) => error instanceof DeveloperExportForbiddenError,
    );

    const server = createUiServer(service);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/sessions/${sessionId}/developer-export`,
      );
      assert.equal(response.status, 403);
      const body = (await response.json()) as { error?: string };
      assert.match(body.error ?? "", /customer mode/i);

      const session = await fetch(
        `http://127.0.0.1:${address.port}/api/sessions/${sessionId}`,
      );
      const sessionBody = (await session.json()) as Record<string, unknown>;
      assert.equal(sessionBody.accessMode, "customer");
      assert.equal("accounting" in sessionBody, false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("developer HTTP export returns full diagnostic JSON", async () => {
    const service = new FramingTakeoffService({ accessMode: "developer" });
    const sessionId = seedSession(service, "developer");
    const server = createUiServer(service);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/sessions/${sessionId}/developer-export`,
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        exportKind: string;
        takeoff: FramingTakeoff;
        accounting: ProductAccounting;
      };
      assert.equal(body.exportKind, "framing-developer-run");
      assert.equal(body.takeoff.materials.length, 1);
      assert.equal(
        body.accounting.entries.length,
        MASTER_TAXONOMY_CHECKLIST.items.length,
      );
      assert.ok(body.accounting.entries.every((entry) => entry.label));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("contractor CSV export still aggregates Material | Length / Type | Quantity", () => {
    const csv = buildContractorCsv([
      {
        material: "2x4",
        lengthOrType: "8 ft studs",
        quantity: 7,
        unit: "each",
      },
      {
        material: "2x4",
        lengthOrType: "8 ft studs",
        quantity: 3,
        unit: "each",
      },
      {
        material: "2x6",
        lengthOrType: "plates",
        quantity: 20,
        unit: "linear-foot",
      },
    ]);
    assert.match(csv, /^Material,Length \/ Type,Quantity,Unit\n/);
    assert.match(csv, /"2x4","8 ft studs",10,pcs/);
    assert.match(csv, /"2x6","plates",20,LF/);
    assert.equal(csv.includes("debugSourceIds"), false);
    assert.equal(csv.includes("gapClass"), false);
  });
});
