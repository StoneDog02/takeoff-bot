import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import {
  wallOpeningHeaderKingStudFixtureLines,
} from "./wallOpeningHeaderKingStudFixtureLines.ts";

const king2Target = path.resolve(
  "tests/fixtures/wall-w001-o001-hdr001-king2-text-layer.pdf",
);
const king3Target = path.resolve(
  "tests/fixtures/wall-w001-o001-hdr001-king3-text-layer.pdf",
);

await writeTextLayerPdf(king2Target, [wallOpeningHeaderKingStudFixtureLines(2)]);
await writeTextLayerPdf(king3Target, [wallOpeningHeaderKingStudFixtureLines(3)]);
console.log(`Regenerated ${king2Target}`);
console.log(`Regenerated ${king3Target}`);
