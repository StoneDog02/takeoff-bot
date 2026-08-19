import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallOpeningHeaderFixtureLines } from "./wallOpeningHeaderFixtureLines.ts";

const target = path.resolve(
  "tests/fixtures/wall-w001-o001-hdr001-text-layer.pdf",
);

await writeTextLayerPdf(target, [wallOpeningHeaderFixtureLines()]);
console.log(`Regenerated ${target}`);
