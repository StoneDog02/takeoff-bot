import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallSheathingFixtureLines } from "./wallSheathingFixtureLines.ts";

const target = path.resolve(
  "tests/fixtures/wall-w001-shs001-text-layer.pdf",
);

await writeTextLayerPdf(target, [wallSheathingFixtureLines()]);
console.log(`Regenerated ${target}`);
