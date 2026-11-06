/** Shared jspdf-autotable chrome for stocktake PDFs — grid borders, white body rows. */
export const STOCKTAKE_TABLE_LINE_COLOR = [140, 140, 140];
export const STOCKTAKE_TABLE_BODY_FILL = [255, 255, 255];

export const stocktakePdfTableBaseOptions = {
  theme: 'grid',
  styles: {
    fillColor: STOCKTAKE_TABLE_BODY_FILL,
    textColor: [20, 20, 20],
    lineColor: STOCKTAKE_TABLE_LINE_COLOR,
    lineWidth: 0.4,
    valign: 'middle',
    halign: 'center',
  },
  alternateRowStyles: {
    fillColor: STOCKTAKE_TABLE_BODY_FILL,
  },
};

function isRowSpanMergeCell(raw) {
  return raw && typeof raw === 'object' && Number(raw.rowSpan) > 1;
}

/** Vertically + horizontally centre text in rowSpan cells (e.g. set Price). */
export function chainStocktakeTableCellHooks(userParse, userDraw) {
  const didParseCell = (data) => {
    if (data.section === 'body' || data.section === 'foot') {
      data.cell.styles.fillColor = STOCKTAKE_TABLE_BODY_FILL;
      data.cell.styles.valign = 'middle';
    }
    if (isRowSpanMergeCell(data.cell.raw)) {
      const text = data.cell.raw.content;
      data.cell._stocktakeMergedText = text != null && text !== '' ? String(text) : '';
      data.cell.text = [];
    }
    userParse?.(data);
  };

  const didDrawCell = (data) => {
    if (data.cell._stocktakeMergedText != null && data.cell._stocktakeMergedText !== '') {
      const doc = data.doc;
      const fontSize = data.cell.styles.fontSize || doc.getFontSize();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(20, 20, 20);
      const { x, y, width, height } = data.cell;
      doc.text(
        data.cell._stocktakeMergedText,
        x + width / 2,
        y + height / 2 + fontSize * 0.15,
        { align: 'center' },
      );
    }
    userDraw?.(data);
  };

  return { didParseCell, didDrawCell };
}
