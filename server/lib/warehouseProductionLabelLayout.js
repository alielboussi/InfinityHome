/** Shared mm layout — 80×68 mm production labels (label/value columns, outer border only). */

export const COMPANY_NAME = 'Bestrest Furniture';

export const LABEL_WIDTH_MM = 80;
export const LABEL_HEIGHT_MM = 68;
/** Gap between die-cut labels on the roll (0.3 cm). */
export const LABEL_GAP_MM = 3;
export const LABEL_MARGIN_MM = 2;
/** Inner padding below the top border stroke before company name. */
export const BORDER_TOP_INSET_MM = 1.6;

/** Label pitch for ZPL ^LL (face height + inter-label gap). */
export function labelPitchMm(heightMm = LABEL_HEIGHT_MM, gapMm = LABEL_GAP_MM) {
  return Number(heightMm) + Number(gapMm);
}

export const BARCODE_WIDTH_MM = 40;
export const BARCODE_HEIGHT_MM = 6.5;

/** Left column: field headers (SKU:, Name:, …). */
export const LABEL_COL_MM = 3;
export const VALUE_CENTER_MM = LABEL_WIDTH_MM / 2;

export const QR_SIZE_MM = 9;

export const FONT_PT = 11;
export const COMPANY_FONT_PT = 11;
/** ^FO y is top of glyph box in ZPL — reserve full line height. */
export const COMPANY_TEXT_HEIGHT_MM = 3.8;
export const GAP_AFTER_COMPANY_MM = 1.6;
export const GAP_AFTER_BARCODE_MM = 1.1;
export const ROW_TEXT_MM = 4;
export const NAME_LINE_HEIGHT_MM = 3.6;
export const NAME_VALUE_MAX_LINES = 2;
export const GAP_AFTER_NAME_BLOCK_MM = 2.8;
export const BLOCK_GAP_MM = 0.55;

export const FIELD_LABELS = {
  sku: 'SKU:',
  name: 'Name:',
  color: 'Color:',
  pack: 'Pack:',
  dims: 'Dims:',
  date: 'Date:',
  time: 'Time:',
};

function mmToDots(mm, dpi = 203) {
  return Math.round(Number(mm) * (Number(dpi) / 25.4));
}

function advanceBlock(y, contentHeightMm, gapAfterMm = BLOCK_GAP_MM) {
  const rowY = y;
  const nextY = y + contentHeightMm + gapAfterMm;
  return { rowY, nextY };
}

/** SVG text baseline (y attribute) from row top. */
export function rowTextBaselineMm(rowStartMm, rowContentMm) {
  return rowStartMm + rowContentMm * 0.78;
}

/** ZPL ^FO y — top of single-line field. */
export function rowTextTopMm(rowStartMm, padMm = 0.35) {
  return rowStartMm + padMm;
}

const DEFAULT_QR_PAYLOAD_LENGTH = 110;

export function labelContentBottomMm(layout) {
  return Number(layout?.timeRowMm || 0) + ROW_TEXT_MM;
}

export function assertProductionLabelFits(layout, heightMm = LABEL_HEIGHT_MM, marginMm = LABEL_MARGIN_MM) {
  const maxY = heightMm - marginMm;
  const bottom = labelContentBottomMm(layout);
  if (bottom > maxY + 0.35) {
  throw new Error(`Label layout overflow: content ends at ${bottom.toFixed(2)}mm but max is ${maxY.toFixed(2)}mm`);
  }
}

export function computeProductionLabelLayout({
  heightMm = LABEL_HEIGHT_MM,
  marginMm = LABEL_MARGIN_MM,
  dpi = 203,
  includeColorRow = false,
  includeBoxRow = false,
  includeDimensionsRow = false,
  imageQrDataLength = DEFAULT_QR_PAYLOAD_LENGTH,
} = {}) {
  const mainWidthMm = LABEL_WIDTH_MM - marginMm * 2;
  const centerXMm = LABEL_WIDTH_MM / 2;
  const barcodeLeftMm = (LABEL_WIDTH_MM - BARCODE_WIDTH_MM) / 2;

  const companyTextTopMm = marginMm + BORDER_TOP_INSET_MM;
  const barcodeTopMm = companyTextTopMm + COMPANY_TEXT_HEIGHT_MM + GAP_AFTER_COMPANY_MM;

  let y = barcodeTopMm + BARCODE_HEIGHT_MM + GAP_AFTER_BARCODE_MM;

  let block = advanceBlock(y, ROW_TEXT_MM);
  const skuRowMm = block.rowY;
  y = block.nextY;

  const optionalDetailRows = [includeColorRow, includeBoxRow, includeDimensionsRow].filter(Boolean).length;
  const nameValueMaxLines = optionalDetailRows >= 2 ? 1 : NAME_VALUE_MAX_LINES;
  const gapAfterNameMm = optionalDetailRows >= 1 ? Math.min(GAP_AFTER_NAME_BLOCK_MM, 2.4) : GAP_AFTER_NAME_BLOCK_MM;
  const rowTextMm = optionalDetailRows >= 3 ? 3.85 : ROW_TEXT_MM;
  const blockGapMm = optionalDetailRows >= 2 ? 0.45 : BLOCK_GAP_MM;

  const nameBlockTopMm = y;
  const nameBlockHeightMm = NAME_LINE_HEIGHT_MM * nameValueMaxLines;
  y = nameBlockTopMm + nameBlockHeightMm + gapAfterNameMm;

  const qrBlockYMm = y;
  const imageQrLeftMm = centerXMm - QR_SIZE_MM / 2;
  const imageQrCenterMm = centerXMm;
  const qrFootprintMm = Math.max(
    QR_SIZE_MM,
    zebraQrPrintedMm(QR_SIZE_MM, Math.max(1, Math.floor(Number(imageQrDataLength) || DEFAULT_QR_PAYLOAD_LENGTH)), dpi),
  );
  y = qrBlockYMm + qrFootprintMm + blockGapMm + 0.2;

  let colorRowMm = null;
  if (includeColorRow) {
    block = advanceBlock(y, rowTextMm, blockGapMm);
    colorRowMm = block.rowY;
    y = block.nextY;
  }

  let boxRowMm = null;
  if (includeBoxRow) {
    block = advanceBlock(y, rowTextMm, blockGapMm);
    boxRowMm = block.rowY;
    y = block.nextY;
  }

  let dimensionsRowMm = null;
  if (includeDimensionsRow) {
    block = advanceBlock(y, rowTextMm, blockGapMm);
    dimensionsRowMm = block.rowY;
    y = block.nextY;
  }

  block = advanceBlock(y, rowTextMm, blockGapMm);
  const dateRowMm = block.rowY;
  y = block.nextY;

  block = advanceBlock(y, rowTextMm, blockGapMm);
  const timeRowMm = block.rowY;

  const zplFont = Math.round(FONT_PT * (dpi / 72));
  const companyFont = Math.round(COMPANY_FONT_PT * (dpi / 72));
  const toDots = (mm) => mmToDots(mm, dpi);
  const textTopDots = (rowStartMm, padMm = 0.35) => toDots(rowTextTopMm(rowStartMm, padMm));
  const baselineDots = (rowStartMm, rowContentMm) => toDots(rowTextBaselineMm(rowStartMm, rowContentMm));

  return {
    marginMm,
    mainWidthMm,
    centerXMm,
    valueCenterMm: VALUE_CENTER_MM,
    labelColMm: LABEL_COL_MM,
    barcodeLeftMm,
    barcodeTopMm,
    barcodeWidthMm: BARCODE_WIDTH_MM,
    barcodeHeightMm: BARCODE_HEIGHT_MM,
    companyTextTopMm,
    skuRowMm,
    nameBlockTopMm,
    nameBlockHeightMm,
    nameValueMaxLines,
    qrBlockYMm,
    qrFootprintMm,
    imageQrLeftMm,
    imageQrCenterMm,
    qrSizeMm: QR_SIZE_MM,
    colorRowMm,
    includeColorRow: Boolean(includeColorRow),
    boxRowMm,
    includeBoxRow: Boolean(includeBoxRow),
    dimensionsRowMm,
    includeDimensionsRow: Boolean(includeDimensionsRow),
    dateRowMm,
    timeRowMm,
    fontPt: FONT_PT,
    dots: {
      margin: toDots(marginMm),
      mainWidth: toDots(mainWidthMm),
      centerX: toDots(centerXMm),
      labelX: toDots(LABEL_COL_MM),
      labelWidth: toDots(LABEL_WIDTH_MM),
      barcodeLeft: toDots(barcodeLeftMm),
      barcodeTop: toDots(barcodeTopMm),
      barcodeWidth: toDots(BARCODE_WIDTH_MM),
      barcodeHeight: toDots(BARCODE_HEIGHT_MM),
      companyTextTop: toDots(companyTextTopMm),
      skuRowY: textTopDots(skuRowMm),
      nameBlockTop: textTopDots(nameBlockTopMm),
      nameValueHeight: toDots(nameBlockHeightMm),
      qrBlockY: toDots(qrBlockYMm),
      imageQrX: toDots(imageQrLeftMm),
      qrSize: toDots(QR_SIZE_MM),
      colorRowY: colorRowMm != null ? textTopDots(colorRowMm) : null,
      boxRowY: boxRowMm != null ? textTopDots(boxRowMm) : null,
      dimensionsRowY: dimensionsRowMm != null ? textTopDots(dimensionsRowMm) : null,
      dateRowY: textTopDots(dateRowMm),
      timeRowY: textTopDots(timeRowMm),
      boxW: toDots(mainWidthMm),
      boxH: toDots(heightMm - marginMm * 2),
      headerFont: zplFont,
      valueFont: zplFont,
      companyFont,
      companySvgBaseline: baselineDots(companyTextTopMm, COMPANY_TEXT_HEIGHT_MM),
    },
  };
}

/** QR version proxy (model 2) from payload length — matches `zebraQrMagnification` sizing. */
export function estimateZebraQrModules(dataLength = 40) {
  return Math.max(21, Math.min(57, Math.ceil(Math.sqrt(Math.max(1, dataLength) * 12))));
}

/** Zebra ^BQ magnification so QR prints ~targetDots wide (model 2). */
export function zebraQrMagnification(targetDots, dataLength = 40) {
  const modules = estimateZebraQrModules(dataLength);
  const mag = Math.round(Number(targetDots) / modules);
  return Math.max(3, Math.min(10, mag));
}

/** Printed QR side length in dots (^BQ model 2) — layout must reserve this, not the target box alone. */
export function zebraQrPrintedDots(targetDots, dataLength = 40) {
  const modules = estimateZebraQrModules(dataLength);
  const mag = zebraQrMagnification(targetDots, dataLength);
  return modules * mag;
}

export function zebraQrPrintedMm(targetWidthMm, dataLength = 40, dpi = 203) {
  const dots = zebraQrPrintedDots(mmToDots(targetWidthMm, dpi), dataLength);
  return (dots * 25.4) / Number(dpi);
}

export { mmToDots };
