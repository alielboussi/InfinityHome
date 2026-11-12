import { Share } from 'react-native';
import { buildWarehouseDeliveryWhatsAppMessage } from './buildWarehouseDeliveryWhatsAppMessage';
import { formatZambiaDateTimeLine } from './zambiaDateTime';

export function buildFarmReturnWhatsAppText({
  transferRef,
  driverName,
  dispatchedByName,
  submittedAt,
  shareGroups,
}) {
  const productGroups = (shareGroups || []).map((g) => ({
    assemblyName: g.assembly_name || g.assemblyName || 'Product',
    units: g.units ?? g.quantity ?? 1,
    packetLines: [],
  }));
  return buildWarehouseDeliveryWhatsAppMessage({
    title: 'Farm → Warehouse Floor 2',
    fromName: 'Farm Warehouse 1',
    toName: 'Warehouse Floor 2',
    sentBy: dispatchedByName || '—',
    driverName: driverName || '—',
    productGroups,
    extraLines: [
      transferRef ? `Ref: ${transferRef}` : '',
      `Driver: ${String(driverName || '—').trim()}`,
      formatZambiaDateTimeLine(submittedAt || new Date()),
    ].filter(Boolean),
  });
}

export async function shareFarmTransferReceipt(message) {
  const text = String(message || '').trim();
  if (!text) throw new Error('Nothing to share');
  await Share.share({ message: text, title: 'Farm transfer receipt' });
}
