const CM_TO_PT = 28.35;

export const SIGNATURE_BOX_WIDTH_PT = 2.1 * CM_TO_PT;
export const SIGNATURE_BOX_HEIGHT_PT = 0.8 * CM_TO_PT;
/** @deprecated use width/height — kept for callers expecting one dimension */
export const SIGNATURE_BOX_PT = SIGNATURE_BOX_HEIGHT_PT;

const MIN_SIGNATURE_BOX_HEIGHT_PT = 0.65 * CM_TO_PT;

const FONT_SIZE = 7;
const NAME_TO_SIG_LABEL = 10;
const SIG_LABEL_TO_BOX = 4;
const COL_GAP = 18;
const TOP_NAME_LINE = 12;
const BOTTOM_PAD = 4;
const NAME_LINE_PAD = 3;

/** Bottom Y for content (inside the stocktake PDF border). */
export function pdfSignatureBottomLimit(doc, margin) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const insideBorder = pageHeight - 14 - 6;
  const withMargin = pageHeight - margin - 4;
  return Math.min(insideBorder, withMargin);
}

export function stocktakeSignatureBlockHeight(boxHeightPt = SIGNATURE_BOX_HEIGHT_PT) {
  return TOP_NAME_LINE + NAME_TO_SIG_LABEL + SIG_LABEL_TO_BOX + boxHeightPt + BOTTOM_PAD;
}

function pickBoxHeightForSpace(availablePt) {
  const overhead = stocktakeSignatureBlockHeight(0);
  const maxH = availablePt - overhead;
  if (maxH >= SIGNATURE_BOX_HEIGHT_PT) return SIGNATURE_BOX_HEIGHT_PT;
  if (maxH >= MIN_SIGNATURE_BOX_HEIGHT_PT) return maxH;
  return null;
}

/** Place signature block on the last page; shrink boxes or add a page so everything fits. */
export function resolveSignatureBlockY(doc, startY, margin) {
  const bottom = pdfSignatureBottomLimit(doc, margin);
  doc.setPage(doc.internal.getNumberOfPages());
  let y = startY;

  let boxHeight = pickBoxHeightForSpace(bottom - y);
  if (boxHeight != null) return { y, boxHeight };

  doc.addPage();
  y = margin + 6;
  boxHeight = pickBoxHeightForSpace(bottom - y);
  if (boxHeight == null) {
    boxHeight = MIN_SIGNATURE_BOX_HEIGHT_PT;
  }
  return { y, boxHeight };
}

/** Supervisor + stocktake conductor signature blocks (two columns, centred on page). */
export function drawStocktakeApprovalSignatures(doc, startY, margin, pageWidth) {
  const usableWidth = pageWidth - margin * 2;
  const colWidth = Math.min(228, (usableWidth - COL_GAP) / 2);
  const blockWidth = colWidth * 2 + COL_GAP;
  const blockLeft = margin + (usableWidth - blockWidth) / 2;
  const leftX = blockLeft;
  const rightX = blockLeft + colWidth + COL_GAP;

  const { y, boxHeight } = resolveSignatureBlockY(doc, startY, margin);
  const blockTotalHeight = stocktakeSignatureBlockHeight(boxHeight);
  const boxWidth = SIGNATURE_BOX_WIDTH_PT;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.4);

  const drawColumn = (x, colW, nameLabel, signatureLabel) => {
    doc.text(nameLabel, x, y);
    const labelW = doc.getTextWidth(nameLabel);
    const lineY = y + 1.5;
    doc.line(x + labelW + NAME_LINE_PAD, lineY, x + colW - NAME_LINE_PAD, lineY);
    const sigY = y + NAME_TO_SIG_LABEL;
    doc.text(signatureLabel, x + colW / 2, sigY, { align: 'center' });
    const boxX = x + (colW - boxWidth) / 2;
    doc.rect(boxX, sigY + SIG_LABEL_TO_BOX, boxWidth, boxHeight);
  };

  drawColumn(leftX, colWidth, 'Supervisor Name:', 'Supervisor Signature:');
  drawColumn(rightX, colWidth, 'Stocktake Conductor Name:', 'Stocktake Conductor Signature:');

  return y + blockTotalHeight;
}
