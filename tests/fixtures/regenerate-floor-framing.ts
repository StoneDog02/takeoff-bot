import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { floorFramingFixtureLines } from "./floorFramingFixtureLines.ts";

const target = path.resolve(
  "tests/fixtures/wall-w001-ffs001-text-layer.pdf",
);

await writeTextLayerPdf(target, [floorFramingFixtureLines()]);
console.log(`Regenerated ${target}`);
