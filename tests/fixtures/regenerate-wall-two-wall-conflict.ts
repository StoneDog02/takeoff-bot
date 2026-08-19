import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallTwoWallConflictFixtureLines } from "./wallTwoWallConflictFixtureLines.ts";

const target = path.resolve(
  "tests/fixtures/wall-w001-w002-conflict-text-layer.pdf",
);

await writeTextLayerPdf(target, [wallTwoWallConflictFixtureLines()]);
console.log(`Regenerated ${target}`);
