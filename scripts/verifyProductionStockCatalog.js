/**
 * Production Add stock list must exclude packet-BOM products.
 */
import {
  isFinishedProductWithoutPacketBom,
  isSetAssembly,
} from '../src/utils/warehouseCatalogProductCompleteness.js';

const finishedNoBom = { id: 'a1', name: 'Stella Single Seater', family_sku: 'ABC123', inventory_mode: 'finished', packet_count: null };
const finishedWithLinks = { id: 'a2', name: 'Chair', family_sku: 'X', inventory_mode: 'finished', packet_count: null };
const packetBom = { id: 'a3', name: 'Aysa Dining Chair', family_sku: '22AYS', inventory_mode: 'packets', packet_count: 2 };
const finishedWithPacketCount = { id: 'a4', name: 'Bad', family_sku: 'Y', inventory_mode: 'finished', packet_count: 3 };

if (!isFinishedProductWithoutPacketBom(finishedNoBom, [])) {
  console.error('[verifyProductionStockCatalog] expected finished no BOM');
  process.exit(1);
}
if (isFinishedProductWithoutPacketBom(finishedWithLinks, [{ id: 'p1' }])) {
  console.error('[verifyProductionStockCatalog] must reject linked packets');
  process.exit(1);
}
if (isFinishedProductWithoutPacketBom(packetBom, [])) {
  console.error('[verifyProductionStockCatalog] must reject packet inventory_mode');
  process.exit(1);
}
if (isFinishedProductWithoutPacketBom(finishedWithPacketCount, [])) {
  console.error('[verifyProductionStockCatalog] must reject packet_count > 0');
  process.exit(1);
}

const pktByAsm = {
  a2: [{ id: 'p1' }],
};
const assemblies = [finishedNoBom, finishedWithLinks, packetBom, finishedWithPacketCount];
const list = assemblies
  .filter((a) => !isSetAssembly(a))
  .filter((a) => isFinishedProductWithoutPacketBom(a, pktByAsm[String(a.id)] || []));
if (list.length !== 1 || list[0].id !== 'a1') {
  console.error('[verifyProductionStockCatalog] list filter wrong:', list.map((a) => a.id));
  process.exit(1);
}

console.log('[verifyProductionStockCatalog] ok');
