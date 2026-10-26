/**
 * Raster preview — same row layout as zebraProductionLabelZpl.js.
 */
import { Resvg } from '@resvg/resvg-js';
import bwipjs from 'bwip-js';
import path from 'path';
import sharp from 'sharp';
import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import {
  BARCODE_HEIGHT_MM,
  BARCODE_WIDTH_MM,
  COMPANY_NAME,
  computeProductionLabelLayout,
  FIELD_LABELS,
  FONT_PT,
  HEADER_START_MM,
  LABEL_HEIGHT_MM,
  LABEL_MARGIN_MM,
  LABEL_WIDTH_MM,
  QR_CAPTION_FONT_PT,
  QR_CAPTION_HEIGHT_MM,
  ROW_TEXT_MM,
  rowTextBaselineMm,
} from './warehouseProductionLabelLayout.js';
import { formatBlockDate, formatBlockTime } from './zebraProductionLabelZpl.js';

const PX_PER_MM = 10;
const W = Math.round(LABEL_WIDTH_MM * PX_PER_MM);
const H = Math.round(LABEL_HEIGHT_MM * PX_PER_MM);
const BORDER = '#1e3a5f';

const COMPANY_FONT_PX = 13;
const ROW_FONT_PX = FONT_PT;

export function buildProductionLabelMeta({ name, sku, printedAt } = {}) {
  const at = printedAt ? new Date(printedAt) : new Date();
  if (Number.isNaN(at.getTime())) {
    throw new Error('Invalid printedAt');
  }
  const cleanSku = String(sku || '').trim().toUpperCase();
  const cleanName = String(name || '').trim();
  return {
    sku: cleanSku,
    name: cleanName,
    image_qr_url: buildProductPhotoQrUrl(cleanSku),
    printed_at: at.toISOString(),
    print_date: formatBlockDate(at),
    print_time: formatBlockTime(at),
  };
}

function mmToPx(mm) {
  return Math.round(mm * PX_PER_MM);
}

async function makeCode128Png(sku) {
  const targetW = Math.round(BARCODE_WIDTH_MM * PX_PER_MM);
  const targetH = Math.round(BARCODE_HEIGHT_MM * PX_PER_MM);
  const raw = await bwipjs.toBuffer({
    bcid: 'code128',
    text: String(sku || '').toUpperCase(),
    scale: 3,
    height: 12,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
  return sharp(raw)
    .resize(targetW, targetH, { fit: 'fill' })
    .png()
    .toBuffer();
}

async function makeQrPng(text, sizePx) {
  const qr = await bwipjs.toBuffer({
    bcid: 'qrcode',
    text: String(text || '').trim(),
    scale: 4,
    paddingwidth: 0,
    paddingheight: 0,
  });
  return sharp(qr)
    .resize(sizePx, sizePx, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

function dejavuSansFontPath() {
  return path.join(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
}

function rasterizeLabelSvg(textSvg) {
  const resvg = new Resvg(textSvg, {
    fitTo: { mode: 'width', value: W },
    font: {
      fontFiles: [dejavuSansFontPath()],
      loadSystemFonts: false,
      defaultFontFamily: 'DejaVu Sans',
    },
  });
  return Buffer.from(resvg.render().asPng());
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hrSvg(marginPx, mainWidthPx, lineYpx) {
  return `<line x1="${marginPx}" y1="${lineYpx}" x2="${marginPx + mainWidthPx}" y2="${lineYpx}" stroke="#333" stroke-width="1"/>`;
}

function rowSvg({
  headerXpx,
  centerXpx,
  rowYpx,
  label,
  value,
}) {
  return `
  <text x="${headerXpx}" y="${rowYpx}" text-anchor="start" font-family="DejaVu Sans, sans-serif" font-size="${ROW_FONT_PX}" font-weight="700" fill="#111">${escapeXml(label)}</text>
  <text x="${centerXpx}" y="${rowYpx}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${ROW_FONT_PX}" font-weight="600" fill="#000">${escapeXml(value)}</text>
  `;
}

export async function buildWarehouseProductionLabelPngBuffer({ name, sku, printedAt } = {}) {
  const meta = buildProductionLabelMeta({ name, sku, printedAt });
  const layout = computeProductionLabelLayout({
    heightMm: LABEL_HEIGHT_MM,
    marginMm: LABEL_MARGIN_MM,
  });

  const marginPx = mmToPx(layout.marginMm);
  const mainWidthPx = mmToPx(layout.mainWidthMm);
  const centerXPx = mmToPx(layout.centerXMm);
  const headerXpx = mmToPx(HEADER_START_MM);

  const textBaseline = (rowMm, rowHeightMm) => mmToPx(rowTextBaselineMm(rowMm, rowHeightMm));

  const companyY = mmToPx(layout.companyMm) + 4;
  const underlineY = mmToPx(layout.companyUnderlineMm);
  const barcodeTop = mmToPx(layout.barcodeTopMm);
  const barcodeLeft = mmToPx(layout.barcodeLeftMm);

  const barcodeResized = await makeCode128Png(meta.sku);
  const qrSizePx = mmToPx(layout.qrPairSizeMm);
  const [imageQrPng, nameQrPng] = await Promise.all([
    makeQrPng(meta.image_qr_url, qrSizePx),
    makeQrPng(meta.name, qrSizePx),
  ]);
  const imageQrLeft = mmToPx(layout.imageQrLeftMm);
  const nameQrLeft = mmToPx(layout.nameQrLeftMm);
  const qrTop = mmToPx(layout.qrBlockYMm);
  const captionY = textBaseline(layout.qrCaptionYMm, QR_CAPTION_HEIGHT_MM);
  const captionUlY = mmToPx(layout.qrCaptionYMm + QR_CAPTION_HEIGHT_MM - 0.4);
  const imageLabelX = mmToPx(layout.imageQrLabelLeftMm) + Math.floor(mmToPx(layout.qrColumnWidthMm) / 2);
  const nameLabelX = mmToPx(layout.nameQrLabelLeftMm) + Math.floor(mmToPx(layout.qrColumnWidthMm) / 2);
  const captionW = mmToPx(layout.qrColumnWidthMm);

  const textSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="${marginPx}" y="${marginPx}" width="${mainWidthPx}" height="${H - marginPx * 2}" fill="none" stroke="${BORDER}" stroke-width="3"/>
  <text x="${centerXPx}" y="${companyY}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${COMPANY_FONT_PX}" font-weight="700" fill="#1e3a5f" text-decoration="underline">${escapeXml(COMPANY_NAME)}</text>
  ${hrSvg(marginPx, mainWidthPx, underlineY)}
  ${hrSvg(marginPx, mainWidthPx, mmToPx(layout.afterBarcodeLineMm))}
  ${rowSvg({ headerXpx, centerXpx: centerXPx, rowYpx: textBaseline(layout.skuRowMm, ROW_TEXT_MM), label: FIELD_LABELS.sku, value: meta.sku })}
  ${hrSvg(marginPx, mainWidthPx, mmToPx(layout.skuLineMm))}
  ${rowSvg({ headerXpx, centerXpx: centerXPx, rowYpx: textBaseline(layout.nameRowMm, ROW_TEXT_MM), label: FIELD_LABELS.name, value: meta.name })}
  ${hrSvg(marginPx, mainWidthPx, mmToPx(layout.nameLineMm))}
  <text x="${imageLabelX}" y="${captionY}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${QR_CAPTION_FONT_PT}" font-weight="700" fill="#111" text-decoration="underline">${escapeXml(FIELD_LABELS.imageQr)}</text>
  <line x1="${imageLabelX - captionW / 2}" y1="${captionUlY}" x2="${imageLabelX + captionW / 2}" y2="${captionUlY}" stroke="#111" stroke-width="1"/>
  <text x="${nameLabelX}" y="${captionY}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${QR_CAPTION_FONT_PT}" font-weight="700" fill="#111" text-decoration="underline">${escapeXml(FIELD_LABELS.nameQr)}</text>
  <line x1="${nameLabelX - captionW / 2}" y1="${captionUlY}" x2="${nameLabelX + captionW / 2}" y2="${captionUlY}" stroke="#111" stroke-width="1"/>
  ${hrSvg(marginPx, mainWidthPx, mmToPx(layout.photoLineMm))}
  ${rowSvg({ headerXpx, centerXpx: centerXPx, rowYpx: textBaseline(layout.dateRowMm, ROW_TEXT_MM), label: FIELD_LABELS.date, value: meta.print_date })}
  ${hrSvg(marginPx, mainWidthPx, mmToPx(layout.dateLineMm))}
  ${rowSvg({ headerXpx, centerXpx: centerXPx, rowYpx: textBaseline(layout.timeRowMm, ROW_TEXT_MM), label: FIELD_LABELS.time, value: meta.print_time })}
</svg>`;

  const base = rasterizeLabelSvg(textSvg);

  return sharp(base)
    .composite([
      { input: barcodeResized, left: barcodeLeft, top: barcodeTop },
      { input: imageQrPng, left: imageQrLeft, top: qrTop },
      { input: nameQrPng, left: nameQrLeft, top: qrTop },
    ])
    .png()
    .toBuffer();
}

export async function buildWarehouseProductionLabelPngBase64(opts) {
  const buf = await buildWarehouseProductionLabelPngBuffer(opts);
  return buf.toString('base64');
}
