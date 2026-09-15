import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { compareBurtonBenchmark } from "../../src/framing/benchmark/compareBurtonBenchmark.js";
import { explainBurtonBenchmarkComparison } from "../../src/framing/benchmark/explainBurtonBenchmark.js";
import { exportBurtonBenchmarkCsv } from "../../src/framing/benchmark/exportBurtonBenchmarkCsv.js";
import { loadBurtonBenchmarkFixture } from "../../src/framing/benchmark/loadBurtonBenchmarkFixture.js";
import { buildProductAccounting } from "../../src/framing/product/buildProductAccounting.js";
import {
  emptyFramingConstruction,
} from "../../src/framing/schemas/framingConstruction.schema.js";
import type { FramingTakeoff } from "../../src/framing/schemas/framingTakeoff.schema.js";
import { createUiServer } from "../../src/ui/createUiServer.js";
import {
  DeveloperExportForbiddenError,
  FramingTakeoffService,
} from "../../src/ui/framingTakeoffService.js";

const REPO_ROOT = process.cwd();
const FORBIDDEN_IMPORT = /from ["']\.\.\/(read|resolve|calculate|output)\//;

function sampleTakeoff(): FramingTakeoff {
  return {
    schemaVersion: 2,
    projectId: "proj-bui1",
    pdfPath: "/tmp/sample.pdf",
    createdAt: "2026-09-15T12:00:00.000Z",
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

function seedSession(
  service: FramingTakeoffService,
  accessMode: "customer" | "developer",
): string {
  const takeoff = sampleTakeoff();
  const accounting = buildProductAccounting({
    projectId: "proj-bui1",
    construction: emptyFramingConstruction(),
    materials: [],
    createdAt: "2026-09-15T12:00:00.000Z",
  });
  const sessionId = "sess-bui1-1";
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
          accounting: typeof accounting;
          construction: ReturnType<typeof emptyFramingConstruction> | null;
          debugPaths: string[];
          errors: string[];
        };
        benchmarkResult?: unknown;
      }
    >;
    accessMode: "customer" | "developer";
  };
  internal.accessMode = accessMode;
  internal.sessions.set(sessionId, {
    id: sessionId,
    projectId: "proj-bui1",
    pdfPath: "/tmp/sample.pdf",
    result: {
      success: true,
      projectId: "proj-bui1",
      pdfPath: "/tmp/sample.pdf",
      takeoffPath: "artifacts/proj-bui1/framing/framing-takeoff.json",
      accountingPath:
        "artifacts/proj-bui1/framing/framing-product-accounting.json",
      takeoff,
      accounting,
      construction: emptyFramingConstruction(),
      debugPaths: [],
      errors: [],
    },
  });
  return sessionId;
}

async function listen(service: FramingTakeoffService) {
  const server = createUiServer(service);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, port: address.port };
}

describe("beckstead benchmark developer panel API", () => {
  it("customer mode is forbidden and session JSON has no benchmark payload", async () => {
    const service = new FramingTakeoffService({ accessMode: "customer" });
    const sessionId = seedSession(service, "customer");
    assert.throws(
      () => service.getBecksteadBenchmark(sessionId),
      (error: unknown) => error instanceof DeveloperExportForbiddenError,
    );
    assert.throws(
      () => service.getBecksteadBenchmarkCsv(sessionId),
      (error: unknown) => error instanceof DeveloperExportForbiddenError,
    );

    const { server, port } = await listen(service);
    try {
      const json = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${sessionId}/beckstead-benchmark`,
      );
      assert.equal(json.status, 403);
      const csv = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${sessionId}/beckstead-benchmark.csv`,
      );
      assert.equal(csv.status, 403);
      const session = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${sessionId}`,
      );
      const body = (await session.json()) as Record<string, unknown>;
      assert.equal(body.accessMode, "customer");
      assert.equal("gradeSheet" in body, false);
      assert.equal("rows" in body, false);
      assert.equal("accounting" in body, false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("developer JSON and CSV consume the same cached CMP+XPL result", async () => {
    const service = new FramingTakeoffService({ accessMode: "developer" });
    const sessionId = seedSession(service, "developer");
    const first = service.getBecksteadBenchmark(sessionId);
    const second = service.getBecksteadBenchmark(sessionId);
    assert.equal(first, second);
    assert.equal(first.gradeSheet.quantityAgreement.numericComparedCount, 0);
    assert.equal(first.gradeSheet.quantityAgreement.matchPercent, null);
    assert.equal(
      first.rows.filter((row) => row.burton).every((row) => row.status === "NOT COMPARABLE"),
      true,
    );
    assert.equal(
      first.rows.some((row) => row.burton?.comparisonEligible === true),
      false,
    );
    const fixture = loadBurtonBenchmarkFixture(REPO_ROOT);
    assert.equal(
      first.rows.filter((row) => row.burton).every((row) => {
        const item = fixture.items.find(
          (entry) => entry.benchmarkItemId === row.burton?.benchmarkItemId,
        );
        return item?.comparisonEligible === row.burton?.comparisonEligible;
      }),
      true,
    );

    const csv = service.getBecksteadBenchmarkCsv(sessionId);
    assert.equal(csv, exportBurtonBenchmarkCsv(first));
    assert.match(csv, /,null,/);
    assert.equal(csv.toLowerCase().includes("no evidence"), false);
    assert.equal(csv.includes("accuracy"), false);

    const takeoff = sampleTakeoff();
    const independently = explainBurtonBenchmarkComparison({
      comparison: compareBurtonBenchmark({
        takeoff,
        benchmark: fixture,
        runId: sessionId,
        runKind: "live",
      }),
      takeoff,
      construction: emptyFramingConstruction(),
      constructionKind: "session-post-calc",
    });
    assert.deepEqual(
      first.rows.map((row) => row.status),
      independently.rows.map((row) => row.status),
    );
    assert.deepEqual(
      first.rows.map((row) => row.ours),
      independently.rows.map((row) => row.ours),
    );

    const { server, port } = await listen(service);
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${sessionId}/beckstead-benchmark`,
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as typeof first;
      assert.equal(body.runId, first.runId);
      assert.equal(body.gradeSheet.quantityAgreement.matchPercent, null);
      const csvResponse = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${sessionId}/beckstead-benchmark.csv`,
      );
      assert.equal(csvResponse.status, 200);
      assert.equal(await csvResponse.text(), csv);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("does not import production pipeline modules from new benchmark files", () => {
    const dir = path.join(REPO_ROOT, "src/framing/benchmark");
    for (const file of [
      "exportBurtonBenchmarkCsv.ts",
      "benchmarkDisplay.ts",
    ]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      assert.equal(FORBIDDEN_IMPORT.test(source), false, file);
    }
  });
});
