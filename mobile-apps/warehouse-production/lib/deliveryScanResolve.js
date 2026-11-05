import {
  expandWarehouseSkuMatchKeys,
  isWarehousePacketCartonSku,
  normalizeWarehouseProductSku,
  resolvePacketFromScan,
} from '../shared/warehouseScanResolver';
import { isFinishedProductWithoutPacketBom } from '../shared/warehouseCatalogProductCompleteness';
import {
  assemblyUsesWarehouseBoxLabels,
} from '../shared/warehouseDeliveryBoxUnits';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { productionScanResolveCandidates } from './productionLabelQrScan';

function resolveAssemblyFromScanCandidates(candidates, assemblies) {
  for (const candidate of candidates) {
    const productKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(candidate));
    const assembly = (Array.isArray(assemblies) ? assemblies : [])
      .filter((a) => a && typeof a === 'object')
      .find((a) => {
        const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(a.family_sku));
        for (const key of productKeys) {
          if (key && stored.has(key)) return true;
        }
        return false;
      });
    if (assembly) return assembly;
  }
  return null;
}

function packetRowsForAssembly(assemblyId, assemblyPackets, packets) {
  const byAssembly = buildPacketsByAssembly(assemblyPackets, packets);
  return byAssembly.get(String(assemblyId)) || [];
}

function classifyAssemblyScan(assembly, pktList) {
  if (isFinishedProductWithoutPacketBom(assembly, pktList)) {
    return { kind: 'assembly', assembly, pktList };
  }
  if (assemblyUsesWarehouseBoxLabels(assembly, pktList)) {
    return { kind: 'assembly_box', assembly, pktList, truckBoxes: 1 };
  }
  if ((pktList || []).length > 0) {
    return { kind: 'assembly', assembly, pktList };
  }
  return { kind: 'assembly_sku_needs_carton', assembly };
}

/**
 * @returns {{ kind: 'packet', packet } | { kind: 'assembly', assembly, pktList? } | { kind: 'assembly_box', assembly, pktList } | { kind: 'assembly_sku_needs_carton', assembly } | null}
 */
export function resolveDeliveryCatalogScan(scan, { assemblies, packets, assemblyPackets }) {
  const value = String(scan || '').trim();
  if (!value) return null;

  const candidates = productionScanResolveCandidates(value);
  const productNorm = normalizeWarehouseProductSku(value);
  const preferProductFirst = Boolean(
    productNorm && !isWarehousePacketCartonSku(productNorm),
  );

  if (preferProductFirst) {
    const assembly = resolveAssemblyFromScanCandidates(candidates, assemblies);
    if (assembly) {
      const pktList = packetRowsForAssembly(assembly.id, assemblyPackets, packets);
      return classifyAssemblyScan(assembly, pktList);
    }
  }

  for (const candidate of candidates) {
    const packet = resolvePacketFromScan(candidate, packets || []);
    if (packet) return { kind: 'packet', packet };
  }

  if (!preferProductFirst) {
    const assembly = resolveAssemblyFromScanCandidates(candidates, assemblies);
    if (assembly) {
      const pktList = packetRowsForAssembly(assembly.id, assemblyPackets, packets);
      return classifyAssemblyScan(assembly, pktList);
    }
  }

  return null;
}
