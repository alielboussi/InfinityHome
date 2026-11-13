import { jsPDF } from 'jspdf';

/** Zebra warehouse production label — same size as server/zebraProductionLabelZpl.js */
export const WAREHOUSE_PRODUCTION_LABEL_WIDTH_MM = 80;
export const WAREHOUSE_PRODUCTION_LABEL_HEIGHT_MM = 68;

/**
 * One PDF page per label copy at true 80×68 mm (landscape page = label sheet).
 * @param {string} pngBase64 — raster from production-label-preview / print response
 * @param {number} [copies]
 * @returns {Blob}
 */
export function buildWarehouseProductionLabelPdfFromPngBase64(pngBase64, copies = 1) {
  const b64 = String(pngBase64 || '').trim();
  if (!b64) throw new Error('Label preview image is missing.');
  const n = Math.max(1, Math.floor(Number(copies) || 1));
  const doc = new jsPDF({
    unit: 'mm',
    format: [WAREHOUSE_PRODUCTION_LABEL_WIDTH_MM, WAREHOUSE_PRODUCTION_LABEL_HEIGHT_MM],
    orientation: 'landscape',
  });
  doc.setProperties({ title: 'Warehouse production label' });
  const dataUri = `data:image/png;base64,${b64}`;
  for (let i = 0; i < n; i += 1) {
    if (i > 0) {
      doc.addPage(
        [WAREHOUSE_PRODUCTION_LABEL_WIDTH_MM, WAREHOUSE_PRODUCTION_LABEL_HEIGHT_MM],
        'landscape',
      );
    }
    doc.addImage(
      dataUri,
      'PNG',
      0,
      0,
      WAREHOUSE_PRODUCTION_LABEL_WIDTH_MM,
      WAREHOUSE_PRODUCTION_LABEL_HEIGHT_MM,
    );
  }
  return doc.output('blob');
}

export function downloadWarehouseProductionLabelPdf(pngBase64, copies = 1, filename = 'warehouse-label.pdf') {
  const blob = buildWarehouseProductionLabelPdfFromPngBase64(pngBase64, copies);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return blob;
}

export function openWarehouseProductionLabelPdfPreview(pngBase64, copies = 1) {
  const blob = buildWarehouseProductionLabelPdfFromPngBase64(pngBase64, copies);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked. Allow pop-ups for this site to open the label PDF.');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  return blob;
}
