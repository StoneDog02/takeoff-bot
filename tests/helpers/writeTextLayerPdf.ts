import { writeFile } from "node:fs/promises";

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPageStream(lines: readonly string[]): string {
  const commands = ["BT", "/F1 12 Tf", "16 TL", "72 720 Td"];
  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      commands.push("T*");
    }
    commands.push(`(${escapePdfText(line)}) Tj`);
  }
  commands.push("ET");
  return commands.join("\n");
}

/**
 * Writes a minimal text-layer PDF (Helvetica, 1+ pages) without a PDF library.
 */
export async function writeTextLayerPdf(
  filePath: string,
  pages: readonly (readonly string[])[],
): Promise<void> {
  if (pages.length < 1) {
    throw new Error("A text-layer PDF fixture must contain at least one page.");
  }

  const objectCount = 3 + pages.length * 2;
  const fontObjectNumber = objectCount;
  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2);
  const contentObjectNumbers = pages.map((_, index) => 4 + index * 2);

  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((objectNumber) => `${objectNumber} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`,
  );

  for (const [index, lines] of pages.entries()) {
    const pageObjectNumber = pageObjectNumbers[index];
    const contentObjectNumber = contentObjectNumbers[index];
    const stream = buildPageStream(lines);
    const streamLength = Buffer.byteLength(stream, "latin1");

    objects.set(
      pageObjectNumber,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjectNumber} 0 R /Resources << /ProcSet [/PDF /Text] /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`,
    );
    objects.set(
      contentObjectNumber,
      `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
    );
  }

  objects.set(
    fontObjectNumber,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    offsets[objectNumber] = Buffer.byteLength(body, "latin1");
    body += `${objectNumber} 0 obj\n${objects.get(objectNumber)}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, "latin1");
  const xrefEntries = ["xref", `0 ${objectCount + 1}`, "0000000000 65535 f "];
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    xrefEntries.push(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n `);
  }

  const pdf = `${body}${xrefEntries.join("\n")}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  await writeFile(filePath, pdf, { encoding: "latin1" });
}
