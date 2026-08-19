import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallOpeningFixtureLines } from "./wallOpeningFixtureLines.ts";

const fixturesDir = path.resolve("tests/fixtures");

const fixtures = [
  { fileName: "wall-w001-o001-text-layer.pdf", nominalWidthFeet: 3 as const },
  { fileName: "wall-w001-o001-4ft-text-layer.pdf", nominalWidthFeet: 4 as const },
];

for (const fixture of fixtures) {
  const target = path.join(fixturesDir, fixture.fileName);
  await writeTextLayerPdf(target, [wallOpeningFixtureLines(fixture.nominalWidthFeet)]);
  console.log(`Regenerated ${target}`);
}
