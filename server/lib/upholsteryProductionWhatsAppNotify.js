import { buildWorkshopProductionWhatsAppText as buildUpholsteryProductionWhatsAppText } from './workshopProductionWhatsAppMessage.js';
import { sendWarehouseProductionWhatsApp } from './sendWarehouseProductionWhatsApp.js';
import { getLoginAccessRecord } from './loginAccess.js';
import { resolveWarehouseMobileDisplayName } from '../../src/utils/warehouseMobileDisplayName.js';

export async function resolveUpholsteryWhatsAppAlias(user, userId = null) {
  try {
    const uid = user?.id || user?.uid || userId;
    const record = await getLoginAccessRecord(uid, user?.email);
    return resolveWarehouseMobileDisplayName(user || { id: uid }, record) || '—';
  } catch {
    return '—';
  }
}

export function queueUpholsteryProductionWhatsApp(input = {}) {
  try {
    const kind = input.kind === 'orderComplete' ? 'orderComplete' : 'floor2Debit';
    const message = buildUpholsteryProductionWhatsAppText({ ...input, kind });
    if (!message) return;
    sendWarehouseProductionWhatsApp({
      kind: kind === 'orderComplete' ? 'upholsteryOrderComplete' : 'upholsteryFloor2Debit',
      message,
      whatsappKind: 'production',
    }).catch((err) => {
      console.warn('[upholstery-whatsapp]', err?.message || err);
    });
  } catch (err) {
    console.warn('[upholstery-whatsapp] build failed:', err?.message || err);
  }
}

export function hassanOrderSourceFromMeta(meta = {}) {
  if (meta?.showroom_order === true) return 'manufacture';
  if (meta?.customer_order === true) return 'hassan';
  if (String(meta?.customer_name || '').trim()) return 'hassan';
  if (String(meta?.customer_phone || '').trim()) return 'hassan';
  return 'manufacture';
}
