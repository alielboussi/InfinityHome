import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

const CLIENT_SOURCE = 'warehouse_production_app';

async function productionOp(op, body = {}) {
  return warehouseMobileRequest(op, body);
}

export async function fetchProductionAccess() {
  const payload = await productionOp('production-access-self');
  const grant = payload?.grant || null;
  return {
    allowed: Boolean(payload.allowed),
    displayName: payload.display_name || null,
    productionApp: grant?.warehouse_production_app || null,
  };
}

export async function fetchProductionCatalog() {
  return productionOp('catalog-list');
}

async function suggestProductionBaseNameLocally(preset) {
  const {
    buildProductionItemName,
    fetchUniqueRandomProductionBaseName,
    pickRandomProductionBaseName,
  } = await import('../lib/productionItemName');
  const p = String(preset || '').trim();
  const baseName = p
    ? await fetchUniqueRandomProductionBaseName((candidate) => isProductionPacketNameTaken(
      buildProductionItemName(candidate, p),
    ))
    : pickRandomProductionBaseName();
  return {
    baseName,
    productName: p ? buildProductionItemName(baseName, p) : baseName,
  };
}

export async function fetchProductionSuggestedBaseName({ preset } = {}) {
  const p = String(preset || '').trim();
  const { buildProductionItemName, matchProductionGirlNameFromPool } = await import('../lib/productionItemName');
  try {
    const payload = await productionOp('production-suggest-base-name', {
      preset: p || undefined,
    });
    const baseName = matchProductionGirlNameFromPool(payload.base_name || '');
    if (baseName) {
      return {
        baseName,
        productName: p ? buildProductionItemName(baseName, p) : baseName,
      };
    }
  } catch {
    // use local pool below
  }
  return suggestProductionBaseNameLocally(p);
}

export async function isProductionPacketNameTaken(name, options = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  const payload = await productionOp('packet-name-check', {
    name: trimmed,
    exclude_packet_id: options.excludePacketId,
  });
  return Boolean(payload.taken);
}

function parseCreateProductionPacketResponse(payload) {
  const packet = payload?.packet || null;
  const labelCopies = Number(payload?.label_copies);
  return {
    packet,
    labelCopies: Number.isFinite(labelCopies) ? labelCopies : 0,
    labelJobId: payload?.label_job_id || null,
    labelPrintWarning: payload?.label_print_warning || null,
    label: payload?.label || null,
    labelPreviewPngBase64: payload?.label_preview_png_base64 || '',
  };
}

export async function createProductionPacket({
  name,
  warehouseLocationId,
  initialQuantity,
  imageBase64,
}) {
  const payload = await productionOp('production-packet-create', {
    name,
    warehouse_location_id: warehouseLocationId,
    initial_quantity: initialQuantity,
    packet_number: 1,
    qty_per_unit: 1,
    client_source: CLIENT_SOURCE,
    require_product_photo: true,
    image_base64: imageBase64,
  });
  return parseCreateProductionPacketResponse(payload);
}

export async function increaseProductionStock({ packetId, assemblyId, warehouseLocationId, delta }) {
  const body = {
    warehouse_location_id: warehouseLocationId,
    delta,
    client_source: CLIENT_SOURCE,
  };
  if (assemblyId) {
    body.assembly_id = assemblyId;
  } else {
    body.packet_id = packetId;
  }
  return productionOp('production-stock-increase', body);
}

export async function fetchProductionLabelPreview({ name, sku, printedAt }) {
  return productionOp('production-label-preview', {
    name,
    sku,
    printed_at: printedAt,
  });
}

export async function resolveProductionScan(scan) {
  return productionOp('scan-resolve', { scan });
}
