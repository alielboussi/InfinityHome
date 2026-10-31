import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
  resolvePacketFromScan,
} from '../shared/warehouseScanResolver';
import { isFinishedProductWithoutPacketBom } from '../shared/warehouseCatalogProductCompleteness';
import {
  assemblyUsesWarehouseBoxLabels,
  deliveryTruckBoxesToFinishedUnits,
} from '../shared/warehouseDeliveryBoxUnits';

/**
 * @returns {{ kind: 'packet', packet } | { kind: 'assembly', assembly } | null}
 */
export function resolveDeliveryCatalogScan(scan, { assemblies, packets, assemblyPackets }) {
  const value = String(scan || '').trim();
  if (!value) return null;

  const packet = resolvePacketFromScan(value, packets || []);
  if (packet) return { kind: 'packet', packet };

  const productKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(value));
  const assembly = (assemblies || []).find((a) => {
    const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(a.family_sku));
    for (const key of productKeys) {
      if (key && stored.has(key)) return true;
    }
    return false;
  });
  if (!assembly) return null;

  const links = assemblyPackets || [];
  const pktList = links
    .filter((l) => String(l.assembly_id) === String(assembly.id))
    .map((l) => (packets || []).find((p) => String(p.id) === String(l.packet_id)))
    .filter(Boolean);

  if (isFinishedProductWithoutPacketBom(assembly, pktList)) {
    return { kind: 'assembly', assembly, pktList };
  }
  if (assemblyUsesWarehouseBoxLabels(assembly, pktList)) {
    return { kind: 'assembly_box', assembly, pktList, truckBoxes: 1 };
  }
  return { kind: 'assembly_sku_needs_carton', assembly };
}
