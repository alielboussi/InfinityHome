/**
 * Sample A4 delivery note HTML for set → product → packet hierarchy.
 * Usage: node scripts/previewWarehouseSetDeliveryNote.js
 * Open docs/previews/warehouse-set-delivery-note-preview.html in a browser.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDeliveryNotePrintHtml } from '../src/utils/buildDeliveryNotePrintHtml.js';
import { buildSetDeliveryPrintLines } from '../src/utils/warehouseDeliverySetHierarchy.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'docs', 'previews');
const outFile = path.join(outDir, 'warehouse-set-delivery-note-preview.html');

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

const html = buildDeliveryNotePrintHtml({
  deliveryNumber: 'WHD-SET-PREVIEW',
  driverName: 'Preview Driver',
  printGroups: [{
    set_name: hierarchy.set_name,
    assembly_name: hierarchy.set_name,
    units: hierarchy.units,
    lines: hierarchy.lines,
  }],
  documentKind: 'delivery',
  dispatchedBy: 'Warehouse Catalog',
  printedAt: new Date().toISOString(),
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Wrote ${outFile}`);
