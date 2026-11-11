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
 * Build the Automated Delivery Receipts WhatsApp message:
 *
 * From : ...
 * To: ...
 * Sent By: ...
 * Products:
 * _____________________________________________
 * Main Product * qty
 * -Packet * Qty
 * Main Product * qty
 * -Packet * Qty
 *
 * ______________________________________________
 * Total Delivery Item: ...
 *
 * @param {{
 *   userAlias?: string,
 *   sentBy?: string,
 *   fromName?: string,
 *   toName?: string,
 *   submittedAt?: string,
 *   driverName?: string,
 *   routeLabel?: string,
 *   productGroups: Array<{ assemblyName: string, units?: number, quantity?: number, packetLines?: Array<{ name: string, quantity: number }> }>,
 *   totalPackets?: number,
 *   totalProducts?: number,
 * }} input
 */
export function buildWarehouseDeliveryWhatsAppMessage(input) {
  const title = String(input?.title || '').trim();
  const extraLines = Array.isArray(input?.extraLines)
    ? input.extraLines.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  const fromLabel = String(input?.fromName || 'Warehouse').trim() || 'Warehouse';
  const toLabel = String(input?.toName || 'Kitwe').trim() || 'Kitwe';
  const sentBy = String(input?.sentBy || input?.userAlias || '').trim() || '—';
  const groups = Array.isArray(input?.productGroups) ? input.productGroups : [];

  const productBlocks = [];
  let computedTotalItems = 0;

  for (const group of groups) {
    const assemblyName = String(group?.assemblyName || '').trim() || 'Product';
    const lines = Array.isArray(group?.packetLines) ? group.packetLines : [];
    const finishedOnly = isFinishedUnitProductGroup(assemblyName, lines);
    const mainQty = Math.max(
      1,
      Number(group?.units ?? group?.quantity ?? (finishedOnly ? lines[0]?.quantity : 1)) || 1,
    );
    computedTotalItems += mainQty;
    productBlocks.push(`${assemblyName} * ${mainQty}`);

    if (!finishedOnly) {
      for (const line of lines) {
        const pktName = String(line?.name || '').trim() || '—';
        const pktQty = Math.max(1, Number(line?.quantity ?? line?.qty) || 1);
        productBlocks.push(`-${pktName} * ${pktQty}`);
      }
    }
  }

  const totalDeliveryItems = Number(input?.totalProducts) > 0
    ? Number(input.totalProducts)
    : computedTotalItems;

  const lines = [
    ...(title ? [title] : []),
    `From : ${fromLabel}`,
    `To: ${toLabel}`,
    `Sent By: ${sentBy}`,
    ...extraLines,
    'Products:',
    '_____________________________________________',
    ...(productBlocks.length ? productBlocks : ['—']),
    '',
    '______________________________________________',
    `Total Delivery Item: ${totalDeliveryItems}`,
  ];

  return lines.join('\n');
}
