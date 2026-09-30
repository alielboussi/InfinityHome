/** 5 cm signature box (jsPDF uses pt; 1 cm ≈ 28.35 pt). */
export const SIGNATURE_BOX_PT = 5 * 28.35;

/** Supervisor + stocktake conductor signature blocks (5 cm boxes). */
export function drawStocktakeApprovalSignatures(doc, startY, margin, pageWidth) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const colGap = 32;
  const colWidth = (pageWidth - margin * 2 - colGap) / 2;
  const leftX = margin;
  const rightX = margin + colWidth + colGap;
  const nameLineGap = 4;

  let y = startY;
  const blockHeight = 10 + 18 + SIGNATURE_BOX_PT + 24;
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
    doc.text(nameLabel, x, y);
    const lineY = y + 3;
    doc.line(x + nameW + nameLineGap, lineY, x + colW, lineY);
    const sigY = y + 24;
    doc.text(signatureLabel, x, sigY);
    doc.rect(x, sigY + 10, SIGNATURE_BOX_PT, SIGNATURE_BOX_PT);
  };

  drawColumn(leftX, colWidth, 'Supervisor Name:', 'Supervisor Signature:');
  drawColumn(rightX, colWidth, 'Stocktake Conductor Name:', 'Stocktake Conductor Signature:');

  return y + blockHeight;
}
