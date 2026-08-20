import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallOpeningHeaderJackStudFixtureLines } from "./wallOpeningHeaderJackStudFixtureLines.ts";

const target = path.resolve(
  "tests/fixtures/wall-w001-o001-hdr001-jack2-text-layer.pdf",
);

await writeTextLayerPdf(target, [wallOpeningHeaderJackStudFixtureLines(2, 2)]);
console.log(`Regenerated ${target}`);
