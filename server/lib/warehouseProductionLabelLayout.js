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

export const BARCODE_WIDTH_MM = 62;
export const BARCODE_HEIGHT_MM = 6.2;

/** Left column: field headers (SKU:, Name:, …). */
export const LABEL_COL_MM = 3;
export const VALUE_CENTER_MM = LABEL_WIDTH_MM / 2;

export const QR_SIZE_MM = 22;

export const FONT_PT = 10;
export const COMPANY_FONT_PT = 10;
/** ^FO y is top of glyph box in ZPL — reserve full line height. */
export const COMPANY_TEXT_HEIGHT_MM = 3.2;
export const GAP_AFTER_COMPANY_MM = 1.15;
export const GAP_AFTER_BARCODE_MM = 1.15;
export const ROW_TEXT_MM = 3.4;
export const NAME_LINE_HEIGHT_MM = 3.4;
export const NAME_VALUE_MAX_LINES = 2;
export const GAP_AFTER_NAME_BLOCK_MM = 1.55;
export const BLOCK_GAP_MM = 1.15;
/** Clearance between header rows so 10pt glyphs never overlap. */
export const HEADER_CLEARANCE_MM = 1.15;
export const MAX_QR_FOOTPRINT_MM = 34;
export const MIN_QR_FOOTPRINT_MM = 24;
/** Photo QR sits after Name (and optional rows), Date/Time below the QR. */
export const GAP_BEFORE_QR_MM = 1.2;
export const GAP_AFTER_QR_MM = 2.0;
/** Zebra ^BQ draws a 4-module quiet zone on each side; layout must reserve it. */
export const QR_QUIET_ZONE_MODULES = 4;

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
  const timeBottom = Number(layout?.timeRowMm || 0) + ROW_TEXT_MM;
  const qrBottom = Number(layout?.qrBlockYMm || 0) + Number(layout?.qrFootprintMm || 0);
  return Math.max(timeBottom, qrBottom);
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

  const nameValueMaxLines = 1;
  const gapAfterNameMm = Math.max(GAP_AFTER_NAME_BLOCK_MM, HEADER_CLEARANCE_MM);
  const rowTextMm = ROW_TEXT_MM;
  const blockGapMm = Math.max(BLOCK_GAP_MM, HEADER_CLEARANCE_MM);

  const nameBlockTopMm = y;
  const nameBlockHeightMm = NAME_LINE_HEIGHT_MM * nameValueMaxLines;
  y = nameBlockTopMm + nameBlockHeightMm + gapAfterNameMm;

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

  const qrDataLen = Math.max(1, Math.floor(Number(imageQrDataLength) || DEFAULT_QR_PAYLOAD_LENGTH));
  const footerMm = rowTextMm * 2 + blockGapMm + 0.35;
  const qrBlockYMm = y + Math.max(HEADER_CLEARANCE_MM, GAP_BEFORE_QR_MM);
  const remainingMm = heightMm - marginMm - qrBlockYMm - footerMm - GAP_AFTER_QR_MM;
  const capMm = Math.min(MAX_QR_FOOTPRINT_MM, Math.max(16, remainingMm));
  const mag = zebraQrMagnification(mmToDots(capMm, dpi), qrDataLen);
  const symbolModules = zebraQrSymbolModules(qrDataLen);
  const qrFootprintMm = (symbolModules * mag * 25.4) / Number(dpi);
  const imageQrCenterMm = centerXMm;
  const imageQrLeftMm = centerXMm - qrFootprintMm / 2;

  y = qrBlockYMm + qrFootprintMm + Math.max(blockGapMm, GAP_AFTER_QR_MM);
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
    qrSizeMm: qrFootprintMm,
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
      qrSize: symbolModules * mag,
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

/** QR version modules (model 2, byte mode, EC M) — URLs need more modules than alphanumeric. */
export function estimateZebraQrModules(dataLength = 40) {
  const n = Math.max(1, Number(dataLength) || 1);
  const byteCapM = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 374, 425];
  let version = byteCapM.length;
  for (let i = 0; i < byteCapM.length; i += 1) {
    if (n <= byteCapM[i]) {
      version = i + 1;
      break;
    }
  }
  return 21 + 4 * (version - 1);
}

/** Dark modules plus Zebra quiet zone (4 modules per side). */
export function zebraQrSymbolModules(dataLength = 40) {
  return estimateZebraQrModules(dataLength) + QR_QUIET_ZONE_MODULES * 2;
}

/** Largest Zebra ^BQ magnification (2–10) that fits targetDots including quiet zone. */
export function zebraQrMagnification(targetDots, dataLength = 40) {
  const modules = zebraQrSymbolModules(dataLength);
  const maxDots = Math.max(48, Math.floor(Number(targetDots) || mmToDots(QR_SIZE_MM)));
  let mag = 10;
  while (mag > 2 && modules * mag > maxDots) mag -= 1;
  return mag;
}

/** Code 128 module width in dots — as wide as the barcode box allows (min 2). */
export function zebraCode128ModuleDots(sku, barcodeWidthDots) {
  const n = Math.max(4, String(sku || 'X').trim().length);
  const units = n * 11 + 35;
  const fit = Math.floor(Number(barcodeWidthDots) / Math.max(1, units));
  return Math.max(2, Math.min(4, fit || 2));
}

/** Printed QR side length in dots (^BQ model 2) — layout must reserve this, not the target box alone. */
export function zebraQrPrintedDots(targetDots, dataLength = 40) {
  const mag = zebraQrMagnification(targetDots, dataLength);
  return zebraQrSymbolModules(dataLength) * mag;
}

export function zebraQrPrintedMm(targetWidthMm, dataLength = 40, dpi = 203) {
  const dots = zebraQrPrintedDots(mmToDots(targetWidthMm, dpi), dataLength);
  return (dots * 25.4) / Number(dpi);
}

export { mmToDots };
