import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { roofFramingFixtureLines } from "./roofFramingFixtureLines.ts";

const target = path.resolve(
  "tests/fixtures/wall-w001-rfs001-text-layer.pdf",
);

await writeTextLayerPdf(target, [roofFramingFixtureLines()]);
console.log(`Regenerated ${target}`);
