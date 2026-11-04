import { buildWarehouseDeliveryWhatsAppMessage } from './buildWarehouseDeliveryWhatsAppMessage';
import { deliverySenderName } from './warehouseDelivery';
import { buildDeliveryPrintGroupsFromEntries } from './warehouseDeliveryPrintGroups';
import { createWarehouseDeliveryNameFormatter } from './warehouseDeliveryDisplayName';

export function buildWarehouseDeliveryWhatsAppProductGroups(entries, assemblyColorContext) {
  const formatter = assemblyColorContext
    ? createWarehouseDeliveryNameFormatter(assemblyColorContext)
    : null;
  const printGroups = buildDeliveryPrintGroupsFromEntries(entries, formatter);
  return printGroups.map((g) => ({
    assemblyName: g.assembly_name,
    packetLines: (g.lines || []).map((line) => ({
      name: line.name,
      quantity: Number(line.qty) || 0,
    })),
  }));
}

/** Same text as production app submit → Automated Delivery Receipts group. */
export function buildKitweDeliveryWhatsAppText(session, entries, usersById, assemblyColorContext = null) {
  const productGroups = buildWarehouseDeliveryWhatsAppProductGroups(entries, assemblyColorContext);
  const formatter = assemblyColorContext
    ? createWarehouseDeliveryNameFormatter(assemblyColorContext)
    : null;
  const printGroups = buildDeliveryPrintGroupsFromEntries(entries, formatter);
  const totalProducts = printGroups.reduce(
    (sum, g) => sum + Math.max(1, Number(g.units) || 1),
    0,
  );
  const totalPackets = (entries || []).reduce(
    (sum, row) => sum + Math.max(0, Number(row.quantity) || 0),
    0,
  );
  const meta = session?.metadata || {};
  return buildWarehouseDeliveryWhatsAppMessage({
    userAlias: meta.dispatched_by_name || deliverySenderName(session, usersById) || '—',
    submittedAt: session?.submitted_at || session?.created_at,
    driverName: meta.driver_name || '—',
    routeLabel: 'Warehouse To Showroom',
    productGroups,
    totalPackets,
    totalProducts,
  });
}
