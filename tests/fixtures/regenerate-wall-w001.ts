import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallW001FixtureLines } from "./wallW001FixtureLines.ts";

const fixturesDir = path.resolve("tests/fixtures");

const fixtures = [
  { fileName: "wall-w001-text-layer.pdf", lengthFeet: 20 as const },
  { fileName: "wall-w001-24ft-text-layer.pdf", lengthFeet: 24 as const },
];

for (const fixture of fixtures) {
  const target = path.join(fixturesDir, fixture.fileName);
  await writeTextLayerPdf(target, [wallW001FixtureLines(fixture.lengthFeet)]);
  console.log(`Regenerated ${target}`);
}
