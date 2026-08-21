import path from "node:path";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.ts";
import {
  realisticPlanStyleBCompactPages,
  realisticResidentialFramingPlanPages,
} from "./realisticResidentialFramingPlan.ts";

const styleA = path.resolve(
  "tests/fixtures/realistic-residential-framing-plan-text-layer.pdf",
);
const styleB = path.resolve(
  "tests/fixtures/realistic-residential-framing-plan-style-b-text-layer.pdf",
);

await writeTextLayerPdf(styleA, realisticResidentialFramingPlanPages());
console.log(`Regenerated ${styleA}`);

await writeTextLayerPdf(styleB, realisticPlanStyleBCompactPages());
console.log(`Regenerated ${styleB}`);
