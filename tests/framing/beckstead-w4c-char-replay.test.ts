import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { calculateFramingTakeoff } from "../../src/framing/calculate/calculateFramingTakeoff.js";
import { buildProductAccounting } from "../../src/framing/product/buildProductAccounting.js";
import { buildReadCompleteReport } from "../../src/framing/read/buildReadCompleteReport.js";
import {
  buildFramingConstructionFromEvidence,
  readFramingPlans,
} from "../../src/framing/read/readFramingPlans.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import { mergeIdentifiedOpeningParentsFromCompiledPages } from "../../src/framing/geometry/mergeIdentifiedOpeningParentsFromCompiledPages.js";
import {
  loadBecksteadW4cCharReplayCompiledPages,
  loadBecksteadW4cCharReplayDictionary,
  loadBecksteadW4cCharReplayEvidence,
  loadBecksteadW4cCharReplaySlimCompiledPages,
} from "../fixtures/becksteadW4cCharReplay.js";
import {
  BECKSTEAD_M5_CRAWL_JOIST_COUNT,
  BECKSTEAD_M5_CRAWL_JOIST_LF,
} from "../fixtures/becksteadM5FloorLayoutEvidence.js";

const CRAWL_AREA_ID = "FFA-FLOOR-AREA---CRAWL-SPACE-MAIN";
const CRAWL_SYSTEM_ID = "FFS-FLOOR-SYS---CRAWL-SPACE";
const PORCH_AREA_ID = "FFA-COV.-PORCH";
const PATIO_AREA_ID = "FFA-UNCOV.-PATIO";
const GARAGE_AREA_ID = "FFA-DOUBLE-GARAGE";

function syntheticPlanIndex(): PlanIndex {
  return {
    pdfPath: "tests/fixtures/wall-w001-text-layer.pdf",
    totalPages: 1,
    pages: [
      {
        pageNumber: 1,
        label: "A1",
        sheetId: "A1",
        textContent: "W-001 wood stud wall 20'-0\"",
      },
    ],
    indexedAt: "2026-09-06T00:00:00.000Z",
    sourceContentHash: null,
  };
}

describe("W4-C characterization Evidence+dictionary replay (no Anthropic)", () => {
  it("current resolvers emit 31/527, LVL 23.5 LF, and W5-B floor parenting", () => {
    const evidence = loadBecksteadW4cCharReplayEvidence();
    const dictionary = loadBecksteadW4cCharReplayDictionary();
    assert.equal(evidence.length, 224);

    const construction = buildFramingConstructionFromEvidence(evidence, {
      projectDictionary: dictionary,
    });
    const calculated = calculateFramingTakeoff(construction);

    const joists = calculated.materials.find(
      (line) => line.quantityKey === "floor.joists",
    );
    const lf = calculated.materials.find(
      (line) => line.quantityKey === "floor.joist-linear-feet",
    );
    assert.equal(joists?.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT);
    assert.equal(joists?.unit, "each");
    assert.equal(lf?.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF);
    assert.equal(lf?.unit, "linear-foot");

    const crawlSystem = construction.floorFraming.systems.find(
      (system) => system.id === CRAWL_SYSTEM_ID,
    );
    assert.ok(crawlSystem);
    assert.deepEqual(crawlSystem.areaIds, [CRAWL_AREA_ID]);
    assert.equal(crawlSystem.areaIds.includes(PORCH_AREA_ID), false);
    assert.equal(crawlSystem.areaIds.includes(PATIO_AREA_ID), false);
    assert.equal(crawlSystem.areaIds.includes(GARAGE_AREA_ID), false);

    const porch = construction.floorFraming.areas.find(
      (area) => area.id === PORCH_AREA_ID,
    );
    const patio = construction.floorFraming.areas.find(
      (area) => area.id === PATIO_AREA_ID,
    );
    const garage = construction.floorFraming.areas.find(
      (area) => area.id === GARAGE_AREA_ID,
    );
    const crawl = construction.floorFraming.areas.find(
      (area) => area.id === CRAWL_AREA_ID,
    );
    assert.ok(porch);
    assert.ok(patio);
    assert.ok(garage);
    assert.ok(crawl);
    assert.equal(crawl.parentSystemId, CRAWL_SYSTEM_ID);
    assert.equal(porch.parentSystemId, "FFS-UNRESOLVED");
    assert.equal(patio.parentSystemId, "FFS-UNRESOLVED");
    assert.equal(garage.parentSystemId, "FFS-UNRESOLVED");
    assert.equal(garage.layout, '4" CONC. SLAB');
    assert.equal(garage.joistLayoutLengthFeet, null);
    assert.equal(garage.joistMemberLengthFeet, null);

    const readComplete = buildReadCompleteReport(construction);
    const garageCondition = readComplete.conditions.find(
      (condition) => condition.conditionId === GARAGE_AREA_ID,
    );
    assert.ok(garageCondition);
    assert.equal(
      garageCondition.fields.some(
        (field) =>
          field.propertyPath === "assembly.joistType" &&
          field.status === "not-applicable",
      ),
      true,
    );

    const memberIds = construction.structuralMembers.structuralMembers.map(
      (member) => member.id,
    );
    assert.deepEqual(memberIds, [
      "SM-6x6-POST-WTRIM",
      "SM-WB2-10DF",
      "SM-WB2-11.88LVL",
      "SM-WB2-8DF",
      "SM-WB3-10DF",
    ]);
    assert.equal(memberIds.includes("SM-MST37"), false);
    assert.equal(memberIds.includes("SM-MTS30C"), false);
    assert.equal(memberIds.includes("SM-STHD14RJ"), false);
    assert.equal(memberIds.includes("SM-CS16x48"), false);

    const lvlMember = construction.structuralMembers.structuralMembers.find(
      (member) => member.id === "SM-WB2-11.88LVL",
    );
    assert.ok(lvlMember);
    assert.equal(lvlMember.materialType, "lvl");
    assert.equal(lvlMember.size, '(2)-1.3/4"x11.7/8" LVL');
    assert.equal(lvlMember.lengthFeet, 23.5);

    const postMember = construction.structuralMembers.structuralMembers.find(
      (member) => member.id === "SM-6x6-POST-WTRIM",
    );
    assert.ok(postMember);
    assert.equal(postMember.category, "post");
    assert.equal(postMember.size, "6x6");

    const lvlLine = calculated.materials.find(
      (line) =>
        line.sourceObjectIds.includes("SM-WB2-11.88LVL") &&
        line.unit === "linear-foot",
    );
    assert.ok(lvlLine);
    assert.equal(lvlLine.quantity, 23.5);
    assert.equal(lvlLine.category, "engineered-wood");
    assert.match(lvlLine.material ?? "", /LVL/i);
    assert.equal(
      calculated.materials.some((line) =>
        /hanger|hold-?down|strap|MST37|MTS30C|STHD|HDU|CS16/i.test(
          `${line.material ?? ""} ${line.description ?? ""} ${line.id}`,
        ),
      ),
      false,
    );

    const accounting = buildProductAccounting({
      projectId: "w4c-char-replay",
      construction,
      materials: calculated.materials,
      createdAt: "2026-09-06T00:00:00.000Z",
    });
    const byId = Object.fromEntries(
      accounting.entries.map((entry) => [entry.taxonomyItemId, entry]),
    );
    assert.equal(byId.lvl?.status, "calculated");
    assert.equal(byId["ext-headers"]?.status, "calculated");
    assert.notEqual(byId["int-door-headers"]?.status, "calculated");
    assert.equal(
      byId["int-door-headers"]?.gapClass,
      "applicability_unestablished",
    );
    assert.notEqual(byId["lvl-beams-floor"]?.status, "calculated");
    assert.equal(
      byId["lvl-beams-floor"]?.gapClass,
      "applicability_unestablished",
    );
    assert.notEqual(byId["common-trusses"]?.gapClass, "calculator_gap");
    assert.equal(byId["common-trusses"]?.gapClass, "applicability_unestablished");
    assert.equal(byId["girder-trusses"]?.gapClass, "applicability_unestablished");
    assert.equal(
      byId["gable-end-trusses"]?.gapClass,
      "applicability_unestablished",
    );
    for (const itemId of [
      "ext-bottom-plates",
      "ext-double-top-plates",
      "int-bottom-plates",
      "int-double-top-plates",
    ] as const) {
      assert.notEqual(byId[itemId]?.status, "calculated", itemId);
      assert.equal(byId[itemId]?.gapClass, "applicability_unestablished", itemId);
    }
  });

  it("Evidence replay injects the dictionary and writes reader-project-dictionary.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "w4c-char-replay-"));
    try {
      const result = await readFramingPlans({
        projectId: "w4c-char-replay-debug",
        planIndex: syntheticPlanIndex(),
        useMockAi: true,
        evidenceReplay: loadBecksteadW4cCharReplayEvidence(),
        projectDictionary: loadBecksteadW4cCharReplayDictionary(),
        writeDebugArtifacts: true,
        artifactsRoot: root,
      });

      assert.equal(result.projectDictionary?.definitions.length, 3);
      const dictionaryPath = result.debugPaths.find((entry) =>
        entry.endsWith("reader-project-dictionary.json"),
      );
      assert.ok(dictionaryPath);
      const written = JSON.parse(await readFile(dictionaryPath, "utf8")) as {
        definitions: Array<{ semanticTypeKey: string }>;
      };
      assert.deepEqual(
        written.definitions.map((definition) => definition.semanticTypeKey),
        ["WB2-11.88LVL", "WB2-10DF", "WB3-10DF"],
      );
      assert.equal(
        result.construction.structuralMembers.structuralMembers.find(
          (member) => member.id === "SM-WB2-11.88LVL",
        )?.materialType,
        "lvl",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("opening geometry on frozen compiled pages attaches 0 identified parents (fail-closed, no qty invent)", () => {
    assert.notEqual(process.env.TAKEOFF_OPENING_GEOMETRY, "1");

    const compiled = loadBecksteadW4cCharReplayCompiledPages();
    assert.ok(compiled.pages.length > 0);
    const evidence = loadBecksteadW4cCharReplayEvidence();
    const dictionary = loadBecksteadW4cCharReplayDictionary();

    const merged = mergeIdentifiedOpeningParentsFromCompiledPages({
      evidence,
      pages: compiled.pages,
    });

    const slimMerged = mergeIdentifiedOpeningParentsFromCompiledPages({
      evidence,
      pages: loadBecksteadW4cCharReplaySlimCompiledPages(),
    });

    assert.ok(merged.audit.gapCandidateCount > 0, compiled.source);
    assert.equal(merged.audit.establishedParentAndMarkCount, 0);
    assert.equal(merged.audit.uniqueAttachments, 0);
    assert.equal(merged.attachments.length, 0);
    assert.ok(slimMerged.audit.gapCandidateCount > 0, "slim-fixture");
    assert.equal(slimMerged.audit.uniqueAttachments, 0);
    assert.equal(
      merged.evidence.some(
        (record) =>
          record.subjectKind === "opening" && record.propertyPath === "quantity",
      ),
      false,
    );

    const construction = buildFramingConstructionFromEvidence(merged.evidence, {
      projectDictionary: dictionary,
    });
    const identified = construction.openings.openings.filter(
      (opening) => !opening.id.startsWith("O-opening:p"),
    );
    assert.equal(identified.length, 12);
    assert.equal(
      identified.filter((opening) => opening.parentWallId != null).length,
      0,
    );
    assert.equal(
      identified.filter((opening) => opening.parentObjectId != null).length,
      0,
    );
    assert.equal(
      identified.some((opening) => opening.quantity != null),
      false,
    );

    const calculated = calculateFramingTakeoff(construction);
    const joists = calculated.materials.find(
      (line) => line.quantityKey === "floor.joists",
    );
    const lf = calculated.materials.find(
      (line) => line.quantityKey === "floor.joist-linear-feet",
    );
    assert.equal(joists?.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT);
    assert.equal(lf?.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF);

    const porch = construction.floorFraming.areas.find(
      (area) => area.id === PORCH_AREA_ID,
    );
    assert.equal(porch?.parentSystemId, "FFS-UNRESOLVED");

    const lvlLine = calculated.materials.find(
      (line) =>
        line.sourceObjectIds.includes("SM-WB2-11.88LVL") &&
        line.unit === "linear-foot",
    );
    assert.equal(lvlLine?.quantity, 23.5);
    assert.equal(
      calculated.materials.some((line) =>
        /^opening\./.test(line.quantityKey ?? ""),
      ),
      false,
    );
  });
});
