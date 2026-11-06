/** Blue frame matching stocktake report letterhead (all pages). */
export function drawStocktakePageBorder(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(30, 90, 180);
  doc.setLineWidth(2.5);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28);
}

/** Border on every page + footer page numbers (e.g. "Page 1 of 3"). */
export function appendStocktakePageNumbers(doc) {
  const total = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawStocktakePageBorder(doc);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    doc.text(`Page ${page} of ${total}`, pageWidth / 2, pageHeight - 20, { align: 'center' });
  }
}
