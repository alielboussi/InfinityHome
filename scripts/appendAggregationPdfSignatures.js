/**
 * Append supervisor / stocktake conductor sign-off page to an existing aggregation PDF.
 * Usage: node scripts/appendAggregationPdfSignatures.js <input.pdf> [output.pdf]
 */
import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const SIGNATURE_BOX_PT = 1.5 * 28.35;
const MARGIN = 28;

function drawSignatures(page, { font, fontBold, pageWidth, pageHeight }) {
  const colGap = 32;
  const colWidth = (pageWidth - MARGIN * 2 - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + colGap;
  const nameLineGap = 4;

  let yFromTop = 72;
  const toY = (yTop) => pageHeight - yTop;

  page.drawText('Sign-off', {
    x: MARGIN,
    y: toY(yFromTop),
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  yFromTop += 14;
  page.drawText('Supervisor and stocktake conductor: print name, then sign in the boxes below.', {
    x: MARGIN,
    y: toY(yFromTop),
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
  yFromTop += 28;

  const drawColumn = (x, colW, nameLabel, signatureLabel) => {
    const nameSize = 9;
    const nameWidth = font.widthOfTextAtSize(nameLabel, nameSize);
    page.drawText(nameLabel, { x, y: toY(yFromTop), size: nameSize, font, color: rgb(0, 0, 0) });
    const lineY = toY(yFromTop + 3);
    page.drawLine({
      start: { x: x + nameWidth + nameLineGap, y: lineY },
      end: { x: x + colW, y: lineY },
      thickness: 0.5,
      color: rgb(0.16, 0.16, 0.16),
    });
    const sigYTop = yFromTop + 24;
    page.drawText(signatureLabel, { x, y: toY(sigYTop), size: nameSize, font, color: rgb(0, 0, 0) });
    const boxY = toY(sigYTop + 10 + SIGNATURE_BOX_PT);
    page.drawRectangle({
      x,
      y: boxY,
      width: SIGNATURE_BOX_PT,
      height: SIGNATURE_BOX_PT,
      borderColor: rgb(0.16, 0.16, 0.16),
      borderWidth: 0.5,
    });
  };

  drawColumn(leftX, colWidth, 'Supervisor Name:', 'Supervisor Signature:');
  drawColumn(rightX, colWidth, 'Stocktake Conductor Name:', 'Stocktake Conductor Signature:');
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/appendAggregationPdfSignatures.js <input.pdf> [output.pdf]');
    process.exit(1);
  }
  const resolvedIn = path.resolve(inputPath);
  if (!fs.existsSync(resolvedIn)) {
    console.error('File not found:', resolvedIn);
    process.exit(1);
  }
  const parsed = path.parse(resolvedIn);
  const defaultOut = path.join(parsed.dir, `${parsed.name}_signed${parsed.ext}`);
  const outputPath = path.resolve(process.argv[3] || defaultOut);

  const pdfDoc = await PDFDocument.load(fs.readFileSync(resolvedIn));
  const refPage = pdfDoc.getPages()[0];
  const { width, height } = refPage.getSize();
  const page = pdfDoc.addPage([width, height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  drawSignatures(page, { font, fontBold, pageWidth: width, pageHeight: height });

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, outBytes);
  console.log('Wrote', outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
