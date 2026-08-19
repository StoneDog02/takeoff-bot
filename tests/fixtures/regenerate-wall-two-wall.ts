import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallTwoWallFixtureLines } from "./wallTwoWallFixtureLines.ts";

const target = path.resolve("tests/fixtures/wall-w001-w002-text-layer.pdf");

await writeTextLayerPdf(target, [wallTwoWallFixtureLines()]);
console.log(`Regenerated ${target}`);
