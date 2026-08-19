import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.js";
import {
  type MixedHeaderLengthFeet,
  wallHeaderMixedFixtureLines,
} from "./wallHeaderMixedFixtureLines.js";

const fixturesDir = path.resolve("tests/fixtures");

const fixtures: Array<{ fileName: string; headerLengthFeet: MixedHeaderLengthFeet }> =
  [
    { fileName: "wall-w001-hdr001-text-layer.pdf", headerLengthFeet: 6 },
    { fileName: "wall-w001-hdr001-8ft-text-layer.pdf", headerLengthFeet: 8 },
  ];

for (const fixture of fixtures) {
  const target = path.join(fixturesDir, fixture.fileName);
  await writeTextLayerPdf(target, [
    wallHeaderMixedFixtureLines(fixture.headerLengthFeet),
  ]);
  console.log(`Regenerated ${target}`);
}
