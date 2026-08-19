import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import { wallMultiObjectFramingFixturePages } from "./wallMultiObjectFramingFixtureLines.ts";

const target = path.resolve(
  "tests/fixtures/wall-w001-w002-o001-o002-o003-hdr001-hdr002-text-layer.pdf",
);

await writeTextLayerPdf(target, wallMultiObjectFramingFixturePages());
console.log(`Regenerated ${target}`);
