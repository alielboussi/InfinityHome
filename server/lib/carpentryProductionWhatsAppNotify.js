import { buildWorkshopProductionWhatsAppText } from './workshopProductionWhatsAppMessage.js';
import { sendWarehouseProductionWhatsApp } from './sendWarehouseProductionWhatsApp.js';
import { hassanOrderSourceFromMeta, resolveUpholsteryWhatsAppAlias } from './upholsteryProductionWhatsAppNotify.js';

export { hassanOrderSourceFromMeta, resolveUpholsteryWhatsAppAlias as resolveCarpentryWhatsAppAlias };

function notifyKind(kind) {
  if (kind === 'sentToPainting') return 'carpentrySentToPainting';
  if (kind === 'orderComplete') return 'carpentryOrderComplete';
  if (kind === 'floor2Credit') return 'carpentryFloor2Credit';
  return 'carpentryFloor2Debit';
}

export function queueCarpentryProductionWhatsApp(input = {}) {
  try {
    const kind = input.kind === 'sentToPainting'
      ? 'sentToPainting'
      : (input.kind === 'orderComplete'
        ? 'orderComplete'
        : (input.kind === 'floor2Credit' ? 'floor2Credit' : 'floor2Debit'));
    const message = buildWorkshopProductionWhatsAppText({ ...input, kind });
    if (!message) return;
    sendWarehouseProductionWhatsApp({
      kind: notifyKind(kind),
      message,
      whatsappKind: 'productionCarpentry',
      presetGroup: 'carpentry',
    }).catch((err) => {
      console.warn('[carpentry-whatsapp]', err?.message || err);
    });
  } catch (err) {
    console.warn('[carpentry-whatsapp] build failed:', err?.message || err);
  }
}
