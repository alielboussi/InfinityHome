import { Share } from 'react-native';

export function buildFarmReturnWhatsAppText({
  transferRef = '',
  driverName = '',
  dispatchedByName = '',
  submittedAt = '',
  shareGroups = [],
} = {}) {
  const lines = [];
  const ref = String(transferRef || '').trim();
  if (ref) lines.push(`Farm → Warehouse ${ref}`);
  if (submittedAt) lines.push(`Date: ${submittedAt}`);
  if (driverName) lines.push(`Driver: ${driverName}`);
  if (dispatchedByName) lines.push(`Dispatched by: ${dispatchedByName}`);
  if (lines.length) lines.push('');
  (shareGroups || []).forEach((g) => {
    const name = String(g?.assembly_name || g?.name || 'Product').trim();
    const units = Math.max(0, Math.floor(Number(g?.units ?? g?.quantity) || 0));
    lines.push(`• ${name} × ${units}`);
  });
  return lines.join('\n').trim();
}

export async function shareFarmTransferReceipt(text) {
  const message = String(text || '').trim();
  if (!message) throw new Error('Nothing to share');
  await Share.share({ message });
}