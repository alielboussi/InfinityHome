/**
 * Write sample set-hierarchy delivery note PDF for review.
 * Usage: node scripts/previewWarehouseSetDeliveryNotePdf.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildSetDeliveryPrintLines } from '../src/utils/warehouseDeliverySetHierarchy.js';
import { DELIVERY_NOTE_DISCLAIMER } from '../src/utils/buildDeliveryNotePrintHtml.js';
import { DELIVERY_NOTE_LOGO_DATA_URI } from '../src/utils/deliveryNoteCompanyLogoEmbedded.js';
import { formatZambiaDate, formatZambiaTime } from '../src/utils/zambiaDateTime.js';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outFile = path.join(root, 'docs', 'previews', 'warehouse-set-delivery-note-preview.pdf');

function formatPrintLineLabel(line, assemblyName = '') {
  const depth = Number(line.depth) || 0;
  const namePart = String(line.name || line.reason || 'Packet').trim();
  if (depth === 2) return `-- ${namePart}`;
  if (depth === 1) return `- ${namePart}`;
  return `- ${namePart}`;
}

function tableBodyFromPrintGroups(printGroups) {
  const body = [];
  for (const group of printGroups || []) {
    const title = String(group.set_name || group.assembly_name || 'Product');
    const units = Math.max(1, Number(group.units) || 1);
    body.push([title, String(units)]);
    for (const line of group.lines || []) {
      body.push([formatPrintLineLabel(line, title), String(line.qty ?? '')]);
    }
  }
  return body;
}

const hierarchy = buildSetDeliveryPrintLines({
  setAssembly: { id: 'set-1', name: 'Living Room Package A' },
  setUnits: 2,
  recipeLocationId: '39ffaa82-8aee-4a33-8de8-06584cbaffcf',
  setItems: [
    {
      set_assembly_id: 'set-1',
      component_assembly_id: 'prod-sofa',
      location_id: '39ffaa82-8aee-4a33-8de8-06584cbaffcf',
      quantity: 1,
    },
    {
      set_assembly_id: 'set-1',
      component_assembly_id: 'prod-table',
      location_id: '39ffaa82-8aee-4a33-8de8-06584cbaffcf',
      quantity: 1,
    },
  ],
  assemblies: [
    { id: 'prod-sofa', name: 'Amara 3 Seater', item_kind: 'product' },
    { id: 'prod-table', name: 'Amara Coffee Table', item_kind: 'product' },
  ],
  assemblyPackets: [
    { assembly_id: 'prod-sofa', packet_id: 'pkt-1', qty_per_unit: 1 },
    { assembly_id: 'prod-sofa', packet_id: 'pkt-1b', qty_per_unit: 1 },
    { assembly_id: 'prod-table', packet_id: 'pkt-2', qty_per_unit: 1 },
  ],
  packets: [
    { id: 'pkt-1', name: 'Amara 3 Seater Carton A', packet_number: 1, qty_per_unit: 1 },
    { id: 'pkt-1b', name: 'Amara 3 Seater Carton B', packet_number: 2, qty_per_unit: 1 },
    { id: 'pkt-2', name: 'Amara Coffee Table Carton', packet_number: 1, qty_per_unit: 1 },
  ],
});

const printGroups = [{
  set_name: hierarchy.set_name,
  assembly_name: hierarchy.set_name,
  units: hierarchy.units,
  lines: hierarchy.lines,
}];

const at = new Date().toISOString();
const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
const pageW = doc.internal.pageSize.getWidth();
const margin = 12;
let y = margin;

doc.setFont('helvetica', 'bold');
doc.setFontSize(16);
doc.text('Delivery Note', pageW / 2, y + 6, { align: 'center' });
doc.setFontSize(10);
doc.setFont('helvetica', 'normal');
doc.text('Bestrest Furniture', pageW / 2, y + 12, { align: 'center' });
y += 22;

doc.text('Delivery #: WHD-SET-PREVIEW', margin, y);
y += 5;
doc.text(`Date: ${formatZambiaDate(at)}    Time: ${formatZambiaTime(at)}`, margin, y);
y += 5;
doc.text('Dispatched by: Warehouse Catalog', margin, y);
y += 5;
doc.text('Driver: Preview Driver', margin, y);
y += 4;

doc.autoTable({
  startY: y + 2,
  margin: { left: margin, right: margin },
  head: [['Product Name', 'Qty']],
  body: tableBodyFromPrintGroups(printGroups),
  styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
  headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
  theme: 'grid',
});

doc.setFontSize(7);
const disclaimer = doc.splitTextToSize(DELIVERY_NOTE_DISCLAIMER, pageW - 2 * margin);
doc.text(disclaimer, margin, Math.min((doc.lastAutoTable?.finalY || y + 40) + 8, 270));

const pdfOut = doc.output('arraybuffer');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(pdfOut));
console.log(`Wrote ${outFile}`);
