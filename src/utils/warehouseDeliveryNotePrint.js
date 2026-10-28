import { buildDeliveryNotePrintHtml } from './buildDeliveryNotePrintHtml';
import { getDeliveryNoteCompanyLogoDataUriWeb } from './deliveryNoteCompanyLogo';
import { groupWarehouseDisplayLines } from './warehouseDelivery';

export const DEFAULT_DELIVERY_NOTE_PRINT_COPIES = 2;

/**
 * Build printGroups for the A4 delivery note from persisted warehouse_delivery_entries.
 */
export function buildDeliveryPrintGroupsFromEntries(entries) {
  const lines = groupWarehouseDisplayLines(entries || []);
  const byAssembly = new Map();

  for (const row of lines) {
    const meta = row.metadata || {};
    const assemblyName = meta.assembly_name || row.name || 'Product';
    const assemblyId = String(meta.assembly_id || assemblyName);
    const units = Math.max(1, Number(meta.units) || 1);
    const key = assemblyId;
    if (!byAssembly.has(key)) {
      byAssembly.set(key, { assembly_name: assemblyName, units, lines: [] });
    }
    const group = byAssembly.get(key);
    group.units = Math.max(group.units, units);
    group.lines.push({
      name: row.name,
      packet_number: meta.packet_number,
      qty: Number(row.quantity) || 0,
    });
  }

  return [...byAssembly.values()];
}

export async function buildWarehouseDeliveryNoteHtml({
  session,
  entries,
  driverSignatureSrc = '',
  copies = DEFAULT_DELIVERY_NOTE_PRINT_COPIES,
}) {
  const meta = session?.metadata || {};
  const printGroups = buildDeliveryPrintGroupsFromEntries(entries);
  const companyLogoSrc = await getDeliveryNoteCompanyLogoDataUriWeb().catch(() => '');
  return buildDeliveryNotePrintHtml({
    deliveryNumber: session?.delivery_number || session?.id || '',
    driverName: meta.driver_name || '',
    dispatchedBy: meta.dispatched_by_name || session?.created_by_name || '',
    driverSignatureSrc: driverSignatureSrc || meta.driver_signature_url || '',
    companyLogoSrc,
    submittedAt: session?.submitted_at || session?.created_at || new Date().toISOString(),
    printGroups,
    copies,
  });
}

/**
 * Opens the browser print dialog (choose Canon MF237w / any printer; PDF includes duplicate copies).
 */
export function printWarehouseDeliveryNoteInBrowser(html) {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = 'none';
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    throw new Error('Print frame unavailable.');
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try {
      document.body.removeChild(frame);
    } catch {
      // ignore
    }
  };

  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(cleanup, 1500);
    }
  };
}

export async function resolveDeliverySignatureSrc(session, fetchAuthenticated) {
  const url = String(session?.metadata?.driver_signature_url || '').trim();
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (typeof fetchAuthenticated !== 'function') return url;
  try {
    const blob = await fetchAuthenticated(url);
    if (!blob) return url;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || url);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}
