import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { calculateFloorFraming } from "../../src/framing/calculate/calculateFloorFraming.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";
import { buildBecksteadWave5CrawlSouthEvidence } from "../fixtures/becksteadWave5CrawlSouthEvidence.js";

describe("beckstead wave5 floor milestone", () => {
  it("merges sibling crawl system assembly and surfaces dual layout conflict on linked S area", () => {
    const payload = resolveFloorFraming(buildBecksteadWave5CrawlSouthEvidence());
    const area = payload.areas.find(
      (entry) => entry.id === "FFA-CRAWL-SPACE-FLOOR-AREA---S",
    );
    const system = payload.systems.find(
      (entry) => entry.id === "FFS-CRAWL-SPACE-FLOOR-SYSTEM",
    );

    assert.ok(area);
    assert.ok(system);
    assert.equal(area.parentSystemId, "FFS-CRAWL-SPACE-FLOOR-SYSTEM");
    assert.equal(area.joistLayoutLengthFeet, null);
    assert.equal(area.joistMemberLengthFeet, 17);
    assert.equal(system.assembly.joistSize, '11 7/8"');
    assert.ok(
      area.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "joistLayoutLengthFeet" &&
          trace.method === "unresolved",
      ),
    );

    const patio = payload.areas.find((entry) => entry.id === "FFA-PATIO-SLAB-AREA");
    assert.ok(patio);
    assert.equal(patio.parentSystemId, "FFS-UNRESOLVED");
  });

  it("does not emit patio slab joist materials when dimensions are supplied", () => {
    const evidence = [
      ...buildBecksteadWave5CrawlSouthEvidence(),
      evidenceSchema.parse({
        id: "E-PATIO-LAYOUT",
        type: "dimension",
        relationship: "supports",
        description: "Patio dimension",
        source: {
          page: {
            documentId: null,
            pageNumber: 3,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "PATIO SLAB AREA",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "20'-0\"",
        references: [],
        subjectKind: "floor-framing-area",
        subjectKey: "PATIO SLAB AREA",
        propertyPath: "joistLayoutLengthFeet",
        candidateValue: 20,
      }),
    ];

    const payload = resolveFloorFraming(evidence);
    const materials = calculateFloorFraming(payload);
    assert.equal(
      materials.filter((line) =>
        line.sourceObjectIds.some((id) => id.startsWith("FFA-PATIO")),
      ).length,
      0,
    );
  });
});
