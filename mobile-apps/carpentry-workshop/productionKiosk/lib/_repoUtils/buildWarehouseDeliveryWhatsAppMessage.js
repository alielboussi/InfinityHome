const CAT_TIME_ZONE = 'Africa/Lusaka';

function formatCatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAT_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatCatTime24(iso) {
  const d = iso ? new Date(iso) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

function formatPacketLine(name, quantity) {
  const label = String(name || '').trim() || '—';
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty > 1) return `- ${label} x ${qty}`;
  return `- ${label}`;
}

function normalizeProductLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function isFinishedUnitProductGroup(assemblyName, packetLines) {
  const lines = Array.isArray(packetLines) ? packetLines : [];
  if (lines.length !== 1) return false;
  const assemblyKey = normalizeProductLabel(assemblyName);
  const lineKey = normalizeProductLabel(lines[0]?.name);
  return Boolean(assemblyKey && lineKey && assemblyKey === lineKey);
}

/**
 * @param {{
 *   userAlias: string,
 *   submittedAt?: string,
 *   driverName: string,
 *   routeLabel?: string,
 *   productGroups: Array<{ assemblyName: string, packetLines: Array<{ name: string, quantity: number }> }>,
 *   totalPackets: number,
 *   totalProducts: number,
 * }} input
 */
export function buildWarehouseDeliveryWhatsAppMessage(input) {
  const userAlias = String(input?.userAlias || '').trim() || '—';
  const driverName = String(input?.driverName || '').trim() || '—';
  const routeLabel = String(input?.routeLabel || 'Warehouse To Showroom').trim();
  const submittedAt = input?.submittedAt || new Date().toISOString();
  const groups = Array.isArray(input?.productGroups) ? input.productGroups : [];
  const totalPackets = Math.max(0, Number(input?.totalPackets) || 0);
  const totalProducts = Math.max(0, Number(input?.totalProducts) || 0);

  const productBlocks = [];
  for (const group of groups) {
    const assemblyName = String(group?.assemblyName || '').trim() || 'Product';
    const lines = Array.isArray(group?.packetLines) ? group.packetLines : [];
    if (isFinishedUnitProductGroup(assemblyName, lines)) {
      productBlocks.push(formatPacketLine(assemblyName, lines[0]?.quantity));
      continue;
    }
    productBlocks.push(`- ${assemblyName}`);
    for (const line of lines) {
      productBlocks.push(formatPacketLine(line?.name, line?.quantity));
    }
  }

  const lines = [
    `Alias of user: ${userAlias}`,
    `Date : ${formatCatDate(submittedAt)}`,
    `Time : ${formatCatTime24(submittedAt)}`,
    `Route: ${routeLabel}`,
    '*****Products*****',
    ...productBlocks,
    '',
    `Total Packets = ${totalPackets}`,
    `Total Products = ${totalProducts}`,
    '',
    `Driver Name : ${driverName}`,
    '',
    '****************************************',
  ];

  return lines.join('\n');
}
