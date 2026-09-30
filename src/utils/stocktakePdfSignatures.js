/** 5 cm signature box (jsPDF uses pt; 1 cm ≈ 28.35 pt). */
export const SIGNATURE_BOX_PT = 5 * 28.35;

/** Supervisor + stocktake conductor signature blocks (5 cm boxes). */
export function drawStocktakeApprovalSignatures(doc, startY, margin, pageWidth) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const colGap = 32;
  const colWidth = (pageWidth - margin * 2 - colGap) / 2;
  const leftX = margin;
  const rightX = margin + colWidth + colGap;
  const nameLineW = Math.min(colWidth - 24, 200);

  let y = startY;
  const blockHeight = 12 + 14 + 18 + SIGNATURE_BOX_PT + 24;
  if (y + blockHeight > pageHeight - margin) {
    doc.addPage();
    y = 48;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.5);

  const drawColumn = (x, colW, nameLabel, signatureLabel) => {
    const nameW = doc.getTextWidth(nameLabel);
    doc.text(nameLabel, x + (colW - nameW) / 2, y);
    const lineX = x + (colW - nameLineW) / 2;
    doc.line(lineX, y + 12, lineX + nameLineW, y + 12);
    const sigY = y + 28;
    const sigLabelW = doc.getTextWidth(signatureLabel);
    doc.text(signatureLabel, x + (colW - sigLabelW) / 2, sigY);
    const boxX = x + (colW - SIGNATURE_BOX_PT) / 2;
    doc.rect(boxX, sigY + 10, SIGNATURE_BOX_PT, SIGNATURE_BOX_PT);
  };

  drawColumn(leftX, colWidth, 'Supervisor Name:', 'Supervisor Signature:');
  drawColumn(rightX, colWidth, 'Stocktake Conductor Name:', 'Stocktake Conductor Signature:');

  return y + blockHeight;
}
