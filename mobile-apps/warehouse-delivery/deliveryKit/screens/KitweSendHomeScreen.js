import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DeliveryKioskVirtualList from '../components/DeliveryKioskVirtualList';
import { DeliveryWarehouseGridCard, deliveryWarehouseGridKey } from '../components/DeliveryWarehouseProductGrid';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import DeliveryFarmQtyAddModal from '../components/DeliveryFarmQtyAddModal';
import DeliveryProductPickModal from '../components/DeliveryProductPickModal';
import ProductionQrScanModal from '../components/ProductionQrScanModal';
import { kiosk } from '../components/kioskStyles';
import {
  buildDeliveryPacketChecks,
  refreshDeliveryPacketCheckQty,
} from '../lib/deliveryAssemblyChecks';
import { assembliesUsingPacket, findWarehousePacketByScan } from '../lib/deliveryPacketAssemblies';
import { filterAssembliesForDeliverySearch } from '../lib/deliveryCatalogSearch';
import {
  deliveryWarehouseAssemblyIdSet,
  filterAssembliesForDeliveryFloor1Only,
  filterAssembliesForDeliveryFloor2Farm,
  filterAssembliesForDeliveryWarehouse,
  filterAssembliesToDeliveryWarehouse,
} from '../lib/deliveryWarehouseCatalog';
import { resolveDeliveryCatalogScan } from '../lib/deliveryScanResolve';
import {
  hasIncompletePacketCartonBom,
  isFinishedProductWithoutPacketBom,
  isSetAssembly as isWarehouseSetAssembly,
} from '../shared/warehouseCatalogProductCompleteness';
import {
  assemblyUsesWarehouseBoxLabels,
  deliveryTruckBoxesToFinishedUnits,
  formatDeliveryPackSummary,
} from '../shared/warehouseDeliveryBoxUnits';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { getProductionDispatcherLabelSync } from '../lib/productionDispatcherLabel';

/** Invisible FlatList row so Floor 1 send uses one scroll surface (header/footer), not ScrollView + list. */
const KITWE_SEND_SCROLL_STUB = [{ id: '__kitwe_send_scroll__' }];
import { tUi } from '../lib/productionKioskI18n';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { fetchWarehouseCatalogCached, loadPersistedWarehouseCatalog } from '../shared/warehouseCatalogStore';
import { mapFarmWarehouseSetupError, warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';
import { showKitweSendScopeHints } from 'delivery-app-ui-config';
import {
  readDeliveryWorkspace,
  writeDeliveryWorkspace,
} from '../lib/productionDeliveryWorkspaceCache';
import { buildPrintGroupsFromCart } from '../lib/deliveryPrintGroups';
import { prefetchDeliveryDrivers } from '../../lib/deliveryDriversStore';
import {
  buildSetComponentScans,
  initSetDraftComponents,
  refreshSetDraftComponentQty,
  serializeSetGroupForSubmit,
  validateSetDraftForCart,
  validateSetGroupInCart,
} from '../lib/deliverySetCart';
import { isWarehouseSetDeliveryGroup } from '../lib/deliveryPrintGroups';
import { uuid } from '../shared/uuid';

function buildScansFromChecks(packetRows, unitsNum, checks) {
  const scans = [];
  for (const packet of packetRows) {
    const req = unitsNum * Math.max(1, Number(packet.qty_per_unit) || 1);
    const row = checks[packet.id];
    if (!row?.driver_checked) return { ok: false, packet };
    scans.push({ ...row, quantity: req });
  }
  return { ok: true, scans };
}

export default function KitweSendHomeScreen({ navigation, hubEmbedded = false, deliveryFlow = 'kitwe' }) {
  const isFarmFlow = deliveryFlow === 'farm';
  const sessionOpenOp = isFarmFlow ? 'farm-delivery-session-open' : 'delivery-session-open';
  const signatureRoute = isFarmFlow ? 'FarmSendSignature' : 'KitweSendSignature';
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const restored = readDeliveryWorkspace();
  const [sessionId, setSessionId] = useState(restored?.sessionId || '');
  const [deliveryNumber, setDeliveryNumber] = useState(restored?.deliveryNumber || '');
  const [groups, setGroups] = useState(restored?.groups || []);
  const [error, setError] = useState('');

  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState('');
  const [draftAssemblyId, setDraftAssemblyId] = useState('');
  const [draftSetId, setDraftSetId] = useState('');
  const [draftSetComponents, setDraftSetComponents] = useState([]);
  const [units, setUnits] = useState('1');
  const [draftChecks, setDraftChecks] = useState({});
  const [draftFinishedConfirmed, setDraftFinishedConfirmed] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pickModal, setPickModal] = useState(null);
  const [farmQtyModal, setFarmQtyModal] = useState(null);
  const [sessionOpening, setSessionOpening] = useState(false);
  const sessionIdRef = useRef(sessionId);
  const groupsRef = useRef(groups);
  sessionIdRef.current = sessionId;
  groupsRef.current = groups;

  const allAssemblies = catalog?.assemblies || [];
  const deliveryAssemblies = useMemo(
    () => (isFarmFlow
      ? filterAssembliesForDeliveryFloor2Farm(catalog)
      : filterAssembliesForDeliveryFloor1Only(catalog)),
    [catalog, isFarmFlow],
  );
  const deliveryAssemblyIds = useMemo(
    () => new Set(deliveryAssemblies.map((a) => String(a.id))),
    [deliveryAssemblies],
  );
  const packets = catalog?.packets || [];
  const links = catalog?.assemblyPackets || [];
  const setItems = catalog?.setItems || [];

  const byAssembly = useMemo(
    () => buildPacketsByAssembly(links, packets),
    [links, packets],
  );

  const filtered = useMemo(() => {
    const limit = isFarmFlow ? 80 : 25;
    const q = String(search || '').trim();
    if (isFarmFlow && !q) {
      return deliveryAssemblies.slice(0, limit);
    }
    return filterAssembliesForDeliverySearch(deliveryAssemblies, search, { limit });
  }, [deliveryAssemblies, search, isFarmFlow]);

  const draftPacketRows = draftAssemblyId
    ? (byAssembly.get(String(draftAssemblyId)) || [])
    : [];
  const draftAssembly = allAssemblies.find((a) => String(a.id) === String(draftAssemblyId));
  const draftSetAssembly = allAssemblies.find((a) => String(a.id) === String(draftSetId));
  const draftIsFinishedOnly = draftAssembly
    ? isFinishedProductWithoutPacketBom(draftAssembly, draftPacketRows)
    : false;
  const draftUsesBoxUnits = draftAssembly
    ? assemblyUsesWarehouseBoxLabels(draftAssembly, draftPacketRows)
    : false;
  const unitsNum = Math.max(1, Number(units) || 1);
  const inputAlign = { textAlign: locale === 'ar' ? 'right' : 'left' };

  useEffect(() => {
    let cancelled = false;
    prefetchDeliveryDrivers();
    (async () => {
      const persisted = await loadPersistedWarehouseCatalog();
      if (persisted && !cancelled) setCatalog(persisted);
      try {
        if (isFarmFlow) {
          const farmCat = await warehouseMobileRequest('farm-delivery-catalog', {});
          if (!cancelled) setCatalog(farmCat);
        } else {
          const fresh = await fetchWarehouseCatalogCached({ fullPackets: true });
          if (!cancelled) setCatalog(fresh);
        }
      } catch {
        // keep persisted catalog if any
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFarmFlow]);

  const syncDeliverySession = useCallback(async ({ alertIfRenewed = false } = {}) => {
    const sid0 = String(sessionIdRef.current || '').trim();
    setSessionOpening(true);
    setError('');
    try {
      const sess = await warehouseMobileRequest(sessionOpenOp, {
        ...(sid0 ? { session_id: sid0 } : {}),
      });
      const sid = String(sess.session_id || '').trim();
      const dnum = String(sess.delivery_number || '').trim();
      if (!sid || !dnum) {
        throw new Error(tUi('deliverySessionFailed', locale));
      }
      setSessionId(sid);
      setDeliveryNumber(dnum);
      if (sess.replaced_stale_session && alertIfRenewed) {
        Alert.alert(tUi('deliveryTitle', locale), tUi('deliverySessionRenewed', locale));
      }
    } catch (err) {
      const raw = err?.message || tUi('deliverySessionFailed', locale);
      setError(mapFarmWarehouseSetupError(raw, locale, tUi));
    } finally {
      setSessionOpening(false);
    }
  }, [locale, sessionOpenOp]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (cancelled) return;
        await syncDeliverySession({
          alertIfRenewed: (groupsRef.current || []).length > 0,
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [syncDeliverySession]),
  );

  useEffect(() => {
    if (!draftAssemblyId || !draftAssembly) return;
    if (draftIsFinishedOnly || draftUsesBoxUnits) return;
    if (draftPacketRows.length > 0) return;
    if (catalog?.catalog_meta?.packet_load === 'all') return;
    fetchWarehouseCatalogCached({ force: true, fullPackets: true }).then(setCatalog).catch(() => {});
  }, [
    draftAssemblyId,
    draftAssembly,
    draftIsFinishedOnly,
    draftUsesBoxUnits,
    draftPacketRows.length,
    catalog?.catalog_meta?.packet_load,
  ]);

  useEffect(() => {
    if (sessionId) {
      writeDeliveryWorkspace({ sessionId, deliveryNumber, groups });
    }
  }, [sessionId, deliveryNumber, groups]);

  const clearDraft = useCallback(() => {
    setDraftAssemblyId('');
    setDraftSetId('');
    setDraftSetComponents([]);
    setDraftChecks({});
    setDraftFinishedConfirmed(false);
    setUnits('1');
  }, []);

  const selectSetForDraft = useCallback((setAssembly) => {
    if (!deliveryAssemblyIds.has(String(setAssembly?.id))) {
      setError(tUi('deliveryScanNotInWarehouse', locale));
      return;
    }
    setSearch('');
    Keyboard.dismiss();
    setDraftAssemblyId('');
    setDraftSetId(setAssembly.id);
    setDraftSetComponents(
      initSetDraftComponents(setAssembly.id, unitsNum, setItems, allAssemblies, byAssembly),
    );
    setDraftChecks({});
    setDraftFinishedConfirmed(false);
    setError('');
  }, [allAssemblies, byAssembly, deliveryAssemblyIds, locale, setItems, unitsNum]);

  const selectAssemblyForDraft = useCallback((a) => {
    if (!a?.id || !deliveryAssemblyIds.has(String(a.id))) {
      setError(tUi('deliveryScanNotInWarehouse', locale));
      return;
    }
    if (isWarehouseSetAssembly(a)) {
      selectSetForDraft(a);
      return;
    }
    const rows = byAssembly.get(String(a.id)) || [];
    setSearch('');
    Keyboard.dismiss();
    setDraftAssemblyId(a.id);
    setDraftChecks(buildDeliveryPacketChecks(rows, unitsNum, {}));
    setDraftFinishedConfirmed(false);
    setError('');
  }, [byAssembly, unitsNum, selectSetForDraft, deliveryAssemblyIds, locale]);

  useEffect(() => {
    if (!draftSetId) return;
    setDraftSetComponents((prev) => refreshSetDraftComponentQty(prev, byAssembly, unitsNum));
  }, [unitsNum, draftSetId, byAssembly]);

  const applyAssemblyWithPacket = useCallback((nextAssembly, packet) => {
    if (!nextAssembly?.id) return;
    setError('');
    setSearch('');
    const rows = byAssembly.get(String(nextAssembly.id)) || [];
    setDraftAssemblyId(nextAssembly.id);
    setDraftFinishedConfirmed(false);
    if (!rows.length) {
      setDraftChecks({});
      return;
    }
    setDraftChecks(buildDeliveryPacketChecks(rows, unitsNum, { checkedPacketId: packet?.id }));
  }, [byAssembly, unitsNum]);

  useEffect(() => {
    if (!draftAssemblyId) return;
    const rows = byAssembly.get(String(draftAssemblyId)) || [];
    if (!rows.length) return;
    setDraftChecks((prev) => refreshDeliveryPacketCheckQty(prev, rows, unitsNum));
  }, [unitsNum, draftAssemblyId, byAssembly]);

  const openFarmQtyModal = useCallback((assembly, extra = {}) => {
    if (!assembly?.id) return;
    const id = String(assembly.id);
    const maxQty = Math.max(0, Math.floor(Number(catalog?.assemblyWarehouseQty?.[id] ?? 0) || 0));
    setError('');
    setFarmQtyModal({
      assembly,
      maxQty,
      packet: extra.packet || null,
    });
  }, [catalog]);

  const confirmFarmQtyAdd = useCallback((qtyRaw) => {
    const modal = farmQtyModal;
    if (!modal?.assembly?.id) return;
    const assembly = modal.assembly;
    const id = String(assembly.id);
    const qty = Math.max(1, Math.floor(Number(qtyRaw) || 0));
    const maxQty = modal.maxQty ?? 0;
    if (maxQty > 0 && qty > maxQty) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertAvailable', locale).replace('{n}', String(maxQty)),
      );
      return;
    }
    const rows = byAssembly.get(id) || [];

    if (isWarehouseSetAssembly(assembly)) {
      setFarmQtyModal(null);
      selectSetForDraft(assembly);
      setUnits(String(qty));
      return;
    }

    if (isFinishedProductWithoutPacketBom(assembly, rows)) {
      const checkedAt = new Date().toISOString();
      setGroups((prev) => {
        const rest = prev.filter((g) => String(g.assembly_id) !== id);
        return [
          ...rest,
          {
            assembly_id: assembly.id,
            assembly_name: assembly.name,
            units: qty,
            scans: [],
            finished_driver_checked: true,
            finished_driver_checked_at: checkedAt,
          },
        ];
      });
      setFarmQtyModal(null);
      setError('');
      return;
    }

    if (!rows.length) {
      Alert.alert(
        tUi('deliveryFarmTitle', locale),
        tUi('deliveryScanProductSkuUseCarton', locale),
      );
      setFarmQtyModal(null);
      return;
    }

    const checks = {};
    for (const p of rows) {
      const req = qty * Math.max(1, Number(p.qty_per_unit) || 1);
      checks[p.id] = {
        packet_id: p.id,
        quantity: req,
        driver_checked: true,
        driver_checked_at: new Date().toISOString(),
      };
    }
    const built = buildScansFromChecks(rows, qty, checks);
    if (!built.ok) {
      setFarmQtyModal(null);
      selectAssemblyForDraft(assembly);
      setUnits(String(qty));
      setError(tUi('deliveryCheckAllPackets', locale).replace('{name}', assembly.name || id));
      return;
    }
    setGroups((prev) => {
      const rest = prev.filter((g) => String(g.assembly_id) !== id);
      return [
        ...rest,
        {
          assembly_id: assembly.id,
          assembly_name: assembly.name,
          units: qty,
          scans: built.scans,
        },
      ];
    });
    setFarmQtyModal(null);
    setError('');
  }, [
    byAssembly,
    farmQtyModal,
    locale,
    selectAssemblyForDraft,
    selectSetForDraft,
  ]);

  const handleFarmFlowScan = useCallback((value) => {
    const resolved = resolveDeliveryCatalogScan(value, {
      assemblies: deliveryAssemblies,
      packets,
      assemblyPackets: links,
    });
    if (resolved?.kind === 'assembly_sku_needs_carton') {
      if (!deliveryAssemblyIds.has(String(resolved.assembly?.id))) {
        setError(tUi('deliveryScanNotInWarehouse', locale));
        return;
      }
      setError(tUi('deliveryScanProductSkuUseCarton', locale));
      return;
    }
    if (resolved?.kind === 'assembly' || resolved?.kind === 'assembly_box') {
      if (!deliveryAssemblyIds.has(String(resolved.assembly?.id))) {
        setError(tUi('deliveryScanNotInWarehouse', locale));
        return;
      }
      openFarmQtyModal(resolved.assembly);
      return;
    }
    if (resolved?.kind === 'packet' && resolved.packet) {
      const packet = resolved.packet;
      const productCandidates = filterAssembliesToDeliveryWarehouse(
        catalog,
        assembliesUsingPacket(packet.id, links, allAssemblies, packets),
      ).filter((a) => deliveryAssemblyIds.has(String(a.id)));
      if (!productCandidates.length) {
        setError(tUi('deliveryScanNotInWarehouse', locale));
        return;
      }
      setError('');
      if (productCandidates.length === 1) {
        openFarmQtyModal(productCandidates[0], { packet });
        return;
      }
      const label = `#${packet.packet_number || ''} ${packet.name || ''}`.trim();
      setPickModal({ packet, assemblies: productCandidates, packetLabel: label, farmQtyAfterPick: true });
      return;
    }

    const packet = findWarehousePacketByScan(value, packets);
    if (packet) {
      const candidates = filterAssembliesToDeliveryWarehouse(
        catalog,
        assembliesUsingPacket(packet.id, links, allAssemblies, packets),
      ).filter((a) => deliveryAssemblyIds.has(String(a.id)));
      if (!candidates.length) {
        setError(tUi('deliveryScanNotInWarehouse', locale));
        return;
      }
      setError('');
      if (candidates.length === 1) {
        openFarmQtyModal(candidates[0], { packet });
        return;
      }
      const label = `#${packet.packet_number || ''} ${packet.name || ''}`.trim();
      setPickModal({ packet, assemblies: candidates, packetLabel: label, farmQtyAfterPick: true });
      return;
    }

    const nameHits = filterAssembliesForDeliverySearch(deliveryAssemblies, value, { limit: 1 });
    if (nameHits.length === 1) {
      setError('');
      openFarmQtyModal(nameHits[0]);
      return;
    }
    setError(tUi('deliveryScanNoProduct', locale));
  }, [
    allAssemblies,
    catalog,
    deliveryAssemblyIds,
    deliveryAssemblies,
    links,
    locale,
    openFarmQtyModal,
    packets,
  ]);

  const handleScanValue = useCallback((raw) => {
    const value = String(raw || '').trim();
    if (!value) return;
    if (!packets.length && !deliveryAssemblies.length) {
      setError(tUi('loading', locale));
      return;
    }
    if (isFarmFlow) {
      handleFarmFlowScan(value);
      return;
    }

    const resolved = resolveDeliveryCatalogScan(value, {
      assemblies: deliveryAssemblies,
      packets,
      assemblyPackets: links,
    });
    if (resolved?.kind === 'assembly' || resolved?.kind === 'assembly_box') {
      if (!deliveryAssemblyIds.has(String(resolved.assembly?.id))) {
        setError(tUi('deliveryScanNotInWarehouse', locale));
        return;
      }
      setError('');
      setSearch(resolved.assembly.name || value);
      selectAssemblyForDraft(resolved.assembly);
      if (resolved.kind === 'assembly_box') {
        setUnits('1');
        setDraftFinishedConfirmed(true);
      }
      return;
    }
    if (resolved?.kind === 'packet' && resolved.packet) {
      const packet = resolved.packet;
      const productCandidates = filterAssembliesToDeliveryWarehouse(
        catalog,
        assembliesUsingPacket(packet.id, links, allAssemblies, packets),
      );
      if (!productCandidates.length) {
        setError(tUi('deliveryScanNotInWarehouse', locale));
        return;
      }
      setError('');
      if (productCandidates.length === 1) {
        applyAssemblyWithPacket(productCandidates[0], packet);
        return;
      }
      const label = `#${packet.packet_number || ''} ${packet.name || ''}`.trim();
      setPickModal({ packet, assemblies: productCandidates, packetLabel: label });
      return;
    }
    if (resolved?.kind === 'assembly_sku_needs_carton') {
      if (!deliveryAssemblyIds.has(String(resolved.assembly?.id))) {
        setError(tUi('deliveryScanNotInWarehouse', locale));
        return;
      }
      setError('');
      setSearch(resolved.assembly.name || value);
      selectAssemblyForDraft(resolved.assembly);
      return;
    }

    const packet = findWarehousePacketByScan(value, packets);
    if (!packet) {
      const nameHits = filterAssembliesForDeliverySearch(deliveryAssemblies, value, { limit: 1 });
      if (nameHits.length === 1) {
        setError('');
        selectAssemblyForDraft(nameHits[0]);
        return;
      }
      setError(tUi('deliveryScanNoPacket', locale));
      return;
    }
    const candidates = filterAssembliesToDeliveryWarehouse(
      catalog,
      assembliesUsingPacket(packet.id, links, allAssemblies, packets),
    );
    if (!candidates.length) {
      setError(tUi('deliveryScanNotInWarehouse', locale));
      return;
    }
    setError('');
    if (candidates.length === 1) {
      applyAssemblyWithPacket(candidates[0], packet);
      return;
    }
    const label = `#${packet.packet_number || ''} ${packet.name || ''}`.trim();
    setPickModal({ packet, assemblies: candidates, packetLabel: label });
  }, [
    allAssemblies,
    applyAssemblyWithPacket,
    catalog,
    deliveryAssemblies,
    deliveryAssemblyIds,
    links,
    locale,
    packets,
    selectAssemblyForDraft,
    isFarmFlow,
    handleFarmFlowScan,
  ]);

  const toggleDraftPacket = (packetId, requiredQty) => {
    setDraftChecks((prev) => {
      const next = { ...prev };
      const wasChecked = Boolean(next[packetId]?.driver_checked);
      next[packetId] = {
        packet_id: packetId,
        quantity: requiredQty,
        driver_checked: !wasChecked,
        driver_checked_at: !wasChecked ? new Date().toISOString() : null,
      };
      return next;
    });
  };

  const toggleDraftSetPacket = (componentAssemblyId, packetId, requiredQty) => {
    setDraftSetComponents((prev) => prev.map((comp) => {
      if (String(comp.assembly_id) !== String(componentAssemblyId)) return comp;
      const nextChecks = { ...(comp.checks || {}) };
      const wasChecked = Boolean(nextChecks[packetId]?.driver_checked);
      nextChecks[packetId] = {
        packet_id: packetId,
        quantity: requiredQty,
        driver_checked: !wasChecked,
        driver_checked_at: !wasChecked ? new Date().toISOString() : null,
      };
      return { ...comp, checks: nextChecks };
    }));
  };

  const toggleDraftSetFinished = (componentAssemblyId) => {
    setDraftSetComponents((prev) => prev.map((comp) => {
      if (String(comp.assembly_id) !== String(componentAssemblyId)) return comp;
      const on = !comp.finished_driver_checked;
      return {
        ...comp,
        finished_driver_checked: on,
        finished_driver_checked_at: on ? new Date().toISOString() : null,
      };
    }));
  };

  const addDraftToCart = () => {
    if (draftSetAssembly) {
      const validation = validateSetDraftForCart(draftSetComponents, draftSetAssembly.name);
      if (!validation.ok) {
        setError(
          tUi('deliveryCheckAllPackets', locale).replace('{name}', validation.message || draftSetAssembly.name),
        );
        return;
      }
      const components = draftSetComponents.map((comp) => {
        if (comp.finishedOnly) {
          return {
            assembly_id: comp.assembly_id,
            assembly_name: comp.assembly_name,
            quantity_per_set: comp.quantity_per_set,
            product_qty: comp.product_qty,
            finished_driver_checked: true,
            finished_driver_checked_at: new Date().toISOString(),
            scans: [],
          };
        }
        const built = buildSetComponentScans(comp.packetRows, comp.product_qty, comp.checks);
        return {
          assembly_id: comp.assembly_id,
          assembly_name: comp.assembly_name,
          quantity_per_set: comp.quantity_per_set,
          product_qty: comp.product_qty,
          scans: built.scans,
        };
      });
      const groupId = uuid();
      setError('');
      setGroups((prev) => [
        ...prev.filter((g) => String(g.group_id) !== groupId),
        {
          kind: 'set',
          group_id: groupId,
          set_assembly_id: draftSetAssembly.id,
          set_name: draftSetAssembly.name,
          units: unitsNum,
          components,
        },
      ]);
      clearDraft();
      return;
    }

    if (!draftAssembly) {
      setError(tUi('deliverySelectProduct', locale));
      return;
    }
    if (draftIsFinishedOnly) {
      if (!draftFinishedConfirmed) {
        setError(tUi('deliveryFinishedConfirmRequired', locale));
        return;
      }
      const checkedAt = new Date().toISOString();
      setError('');
      setGroups((prev) => {
        const rest = prev.filter((g) => String(g.assembly_id) !== String(draftAssembly.id));
        return [
          ...rest,
          {
            assembly_id: draftAssembly.id,
            assembly_name: draftAssembly.name,
            units: unitsNum,
            scans: [],
            finished_driver_checked: true,
            finished_driver_checked_at: checkedAt,
          },
        ];
      });
      clearDraft();
      return;
    }
    const built = buildScansFromChecks(draftPacketRows, unitsNum, draftChecks);
    if (!built.ok) {
      setError(
        tUi('deliveryCheckAllPackets', locale).replace('{name}', draftAssembly.name),
      );
      return;
    }
    setError('');
    setGroups((prev) => {
      const rest = prev.filter((g) => String(g.assembly_id) !== String(draftAssembly.id));
      return [
        ...rest,
        {
          assembly_id: draftAssembly.id,
          assembly_name: draftAssembly.name,
          units: unitsNum,
          scans: built.scans,
        },
      ];
    });
    clearDraft();
  };

  const confirmRemoveFromCart = (groupKey, displayName) => {
    const name = String(displayName || '').trim() || '—';
    Alert.alert(
      tUi('deliveryDeleteConfirmTitle', locale),
      tUi('deliveryDeleteConfirmMessage', locale).replace('{name}', name),
      [
        { text: tUi('deliveryAlertCancel', locale), style: 'cancel' },
        {
          text: tUi('deliveryRemoveProduct', locale),
          style: 'destructive',
          onPress: () => {
            setGroups((prev) => prev.filter((g) => {
              if (isWarehouseSetDeliveryGroup(g)) {
                return String(g.group_id) !== String(groupKey);
              }
              return String(g.assembly_id) !== String(groupKey);
            }));
          },
        },
      ],
    );
  };

  const confirmDiscardDraft = () => {
    if (!draftAssembly && !draftSetAssembly) return;
    const name = String(draftAssembly?.name || draftSetAssembly?.name || '').trim() || '—';
    Alert.alert(
      tUi('deliveryDiscardDraftTitle', locale),
      tUi('deliveryDiscardDraftMessage', locale).replace('{name}', name),
      [
        { text: tUi('deliveryAlertCancel', locale), style: 'cancel' },
        {
          text: tUi('deliveryRemoveProduct', locale),
          style: 'destructive',
          onPress: () => clearDraft(),
        },
      ],
    );
  };

  const toggleCartSetPacket = (groupId, componentAssemblyId, packetId, requiredQty) => {
    setGroups((prev) => prev.map((g) => {
      if (String(g.group_id) !== String(groupId)) return g;
      const components = (g.components || []).map((comp) => {
        if (String(comp.assembly_id) !== String(componentAssemblyId)) return comp;
        const scans = [...(comp.scans || [])];
        const idx = scans.findIndex((s) => String(s.packet_id) === String(packetId));
        const wasChecked = idx >= 0 && scans[idx]?.driver_checked;
        const nextLine = {
          packet_id: packetId,
          quantity: requiredQty,
          driver_checked: !wasChecked,
          driver_checked_at: !wasChecked ? new Date().toISOString() : null,
        };
        if (idx >= 0) scans[idx] = { ...scans[idx], ...nextLine };
        else scans.push(nextLine);
        return { ...comp, scans };
      });
      return { ...g, components };
    }));
  };

  const toggleCartSetFinished = (groupId, componentAssemblyId) => {
    setGroups((prev) => prev.map((g) => {
      if (String(g.group_id) !== String(groupId)) return g;
      const components = (g.components || []).map((comp) => {
        if (String(comp.assembly_id) !== String(componentAssemblyId)) return comp;
        const on = !comp.finished_driver_checked;
        return {
          ...comp,
          finished_driver_checked: on,
          finished_driver_checked_at: on ? new Date().toISOString() : null,
        };
      });
      return { ...g, components };
    }));
  };

  const toggleCartPacket = (assemblyId, packetId, requiredQty) => {
    setGroups((prev) => prev.map((g) => {
      if (String(g.assembly_id) !== String(assemblyId)) return g;
      const scans = [...(g.scans || [])];
      const idx = scans.findIndex((s) => String(s.packet_id) === String(packetId));
      const wasChecked = idx >= 0 && scans[idx]?.driver_checked;
      const nextLine = {
        packet_id: packetId,
        quantity: requiredQty,
        driver_checked: !wasChecked,
        driver_checked_at: !wasChecked ? new Date().toISOString() : null,
      };
      if (idx >= 0) scans[idx] = { ...scans[idx], ...nextLine };
      else scans.push(nextLine);
      return { ...g, scans };
    }));
  };

  const toggleCartFinished = (assemblyId) => {
    setGroups((prev) => prev.map((g) => {
      if (String(g.assembly_id) !== String(assemblyId)) return g;
      const on = !g.finished_driver_checked;
      return {
        ...g,
        finished_driver_checked: on,
        finished_driver_checked_at: on ? new Date().toISOString() : null,
      };
    }));
  };

  const validateCartForSubmit = () => {
    for (const g of groups) {
      if (isWarehouseSetDeliveryGroup(g)) {
        const setErr = validateSetGroupInCart(g, allAssemblies, byAssembly);
        if (setErr) {
          return tUi('deliveryCheckAllPackets', locale).replace('{name}', setErr);
        }
        continue;
      }
      const asm = allAssemblies.find((a) => String(a.id) === String(g.assembly_id));
      const rows = byAssembly.get(String(g.assembly_id)) || [];
      if (asm && isFinishedProductWithoutPacketBom(asm, rows)) {
        if (!g.finished_driver_checked) {
          return tUi('deliveryFinishedConfirmRequired', locale).replace('{name}', g.assembly_name);
        }
        continue;
      }
      const u = Math.max(1, Number(g.units) || 1);
      for (const packet of rows) {
        const req = u * Math.max(1, Number(packet.qty_per_unit) || 1);
        const scan = (g.scans || []).find((s) => String(s.packet_id) === String(packet.id));
        if (!scan?.driver_checked) {
          return tUi('deliveryCheckAllPackets', locale).replace('{name}', g.assembly_name);
        }
      }
    }
    return '';
  };

  const displayError = error === 'deliverySessionFailed'
    ? tUi('deliverySessionFailed', locale)
    : error;

  const goToSignature = async () => {
    if (!groups.length) {
      const msg = tUi('deliveryNeedProduct', locale);
      setError(msg);
      Alert.alert(tUi('deliveryTitle', locale), msg);
      return;
    }
    const cartErr = validateCartForSubmit();
    if (cartErr) {
      setError(cartErr);
      Alert.alert(tUi('deliveryTitle', locale), cartErr);
      return;
    }
    setError('');
    setSessionOpening(true);
    try {
      let sid = String(sessionId || '').trim();
      let dnum = String(deliveryNumber || '').trim();
      if (!sid || !dnum) {
        const sess = await warehouseMobileRequest('delivery-session-open', {
          ...(sid ? { session_id: sid } : {}),
        });
        sid = String(sess.session_id || '').trim();
        dnum = String(sess.delivery_number || '').trim();
        if (!sid || !dnum) throw new Error(tUi('deliverySessionFailed', locale));
        setSessionId(sid);
        setDeliveryNumber(dnum);
      }
      navigation.navigate(signatureRoute, {
        sessionId: sid,
        deliveryNumber: dnum,
        dispatchedByName: getProductionDispatcherLabelSync(),
        documentKind: isFarmFlow ? 'farm_delivery' : 'delivery',
        groups: groups.map((g) => {
          if (isWarehouseSetDeliveryGroup(g)) return serializeSetGroupForSubmit(g);
          return {
            assembly_id: g.assembly_id,
            units: g.units,
            scans: g.scans,
            finished_driver_checked: g.finished_driver_checked,
            finished_driver_checked_at: g.finished_driver_checked_at,
          };
        }),
        printGroups: buildPrintGroupsFromCart(groups, byAssembly, allAssemblies, setItems),
      });
    } catch (err) {
      const msg = err?.message || tUi('deliverySessionFailed', locale);
      setError(msg);
      Alert.alert(tUi('deliveryTitle', locale), msg);
    } finally {
      setSessionOpening(false);
    }
  };

  const farmGridData = useMemo(() => {
    if (!isFarmFlow || draftAssemblyId || draftSetId) return [];
    return filtered;
  }, [draftAssemblyId, draftSetId, filtered, isFarmFlow]);

  const farmGridImageUrl = useCallback(
    (a) => resolveProductImageUrl(
      a?.floor2_image_url
      || a?.image_url
      || a?.metadata?.warehouse_floor2_wip_image_url
      || a?.metadata?.floor2_wip_image_url
      || '',
    ),
    [],
  );

  const renderFarmGridItem = useCallback(({ item }) => {
    const id = deliveryWarehouseGridKey(item);
    const selected = draftAssemblyId && id === String(draftAssemblyId);
    return (
      <DeliveryWarehouseGridCard
        item={item}
        selected={selected}
        onSelect={selectAssemblyForDraft}
        getImageUrl={farmGridImageUrl}
      />
    );
  }, [draftAssemblyId, farmGridImageUrl, selectAssemblyForDraft]);

  const kitweListHeader = (
          <>
        {hubEmbedded ? null : (
          <>
            <ProductionKioskTopBar
              title={
                isFarmFlow
                  ? tUi('deliveryFarmTitle', locale)
                  : tUi('dashFloor1Deliveries', locale)
              }
              locale={locale}
              onToggleLocale={toggleLocale}
            />
            <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
              <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
            </Pressable>
          </>
        )}

        <View style={kiosk.card}>
          <Text style={[kiosk.heroNumber, { textAlign }]}>
            {deliveryNumber || (sessionOpening ? '…' : '—')}
          </Text>
          {showKitweSendScopeHints ? (
            <>
              <Text style={[kiosk.metaLine, { textAlign, marginBottom: 0 }]}>
                {tUi('deliverySubtitle', locale)}
              </Text>
              <Text style={[kiosk.metaLine, { textAlign, marginTop: 6, opacity: 0.88 }]}>
                {tUi('deliveryScopeHint', locale)}
              </Text>
            </>
          ) : null}
        </View>

        {displayError ? (
          <Text style={[kiosk.errText, { textAlign }]}>{displayError}</Text>
        ) : null}

        <Text style={[kiosk.sectionTitle, { textAlign }]}>{tUi('deliveryAddSection', locale)}</Text>
        <View style={kiosk.searchRow}>
          <TextInput
            style={[kiosk.input, kiosk.searchRowInput, inputAlign]}
            placeholder={tUi('deliverySearchPlaceholder', locale)}
            placeholderTextColor={theme.textDim}
            value={search}
            onChangeText={setSearch}
          />
          <Pressable
            style={kiosk.scanChipBtn}
            onPress={() => setScanOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={tUi('deliveryScanBtn', locale)}
          >
            <MaterialCommunityIcons name="barcode-scan" size={28} color="#0f172a" />
          </Pressable>
        </View>

        {!draftAssemblyId && !draftSetId && !isFarmFlow && search.trim().length > 0 && filtered.length > 0 ? (
          <View style={kiosk.listGroup}>
            {filtered.map((a, index) => (
              <Pressable
                key={a.id}
                style={[kiosk.listItem, index === filtered.length - 1 && kiosk.listItemLast]}
                onPress={() => selectAssemblyForDraft(a)}
              >
                <Text style={[kiosk.listItemText, { textAlign }]}>
                  {String(a?.name || '').trim() || '—'}
                  {isWarehouseSetAssembly(a) ? ' (Set)' : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
          </>
        );

  const kitweListFooter = (
          <>
        {draftSetAssembly ? (
          <View style={kiosk.panelCard}>
            <Pressable onPress={clearDraft}>
              <Text style={[kiosk.backText, styles.changeProduct, { textAlign }]}>
                {tUi('back', locale)} — {draftSetAssembly.name} (Set)
              </Text>
            </Pressable>
            <View style={kiosk.field}>
              <Text style={[kiosk.label, { textAlign }]}>{tUi('deliverySetsLabel', locale)}</Text>
              <TextInput
                style={[kiosk.input, inputAlign]}
                keyboardType="number-pad"
                value={units}
                onChangeText={setUnits}
              />
            </View>
            {draftSetComponents.map((comp) => (
              <View key={comp.assembly_id} style={styles.setComponentBlock}>
                <Text style={[kiosk.label, { textAlign }]}>- {comp.assembly_name}</Text>
                {comp.finishedOnly ? (
                  <Pressable
                    style={[kiosk.checkRow, comp.finished_driver_checked && kiosk.checkRowOn]}
                    onPress={() => toggleDraftSetFinished(comp.assembly_id)}
                  >
                    <Text style={kiosk.checkMark}>{comp.finished_driver_checked ? '☑' : '☐'}</Text>
                    <Text style={[kiosk.checkLabel, { textAlign }]}>
                      {tUi('deliveryFinishedUnitLine', locale)
                        .replace('{name}', comp.assembly_name)
                        .replace('{req}', String(comp.product_qty))}
                    </Text>
                  </Pressable>
                ) : (
                  (comp.packetRows || []).map((p) => {
                    const req = comp.product_qty * Math.max(1, Number(p.qty_per_unit) || 1);
                    const on = Boolean(comp.checks?.[p.id]?.driver_checked);
                    const line = tUi('deliveryPacketLine', locale)
                      .replace('{num}', String(p.packet_number))
                      .replace('{name}', String(p.name || ''))
                      .replace('{req}', String(req));
                    return (
                      <Pressable
                        key={p.id}
                        style={[kiosk.checkRow, on && kiosk.checkRowOn]}
                        onPress={() => toggleDraftSetPacket(comp.assembly_id, p.id, req)}
                      >
                        <Text style={kiosk.checkMark}>{on ? '☑' : '☐'}</Text>
                        <Text style={[kiosk.checkLabel, { textAlign }]}>{line}</Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ))}
            <Pressable style={[kiosk.btnOutlinePrimary, styles.addToCartBtn]} onPress={addDraftToCart}>
              <Text style={kiosk.btnOutlinePrimaryText}>{tUi('deliveryAddToDelivery', locale)}</Text>
            </Pressable>
            <Pressable style={kiosk.draftDeleteBtn} onPress={confirmDiscardDraft}>
              <Text style={kiosk.draftDeleteBtnText}>{tUi('deliveryRemoveProduct', locale)}</Text>
            </Pressable>
          </View>
        ) : null}

        {draftAssembly ? (
          <View style={kiosk.panelCard}>
            <Pressable onPress={clearDraft}>
              <Text style={[kiosk.backText, styles.changeProduct, { textAlign }]}>
                {tUi('back', locale)} — {draftAssembly.name}
              </Text>
            </Pressable>
            <View style={kiosk.field}>
              <Text style={[kiosk.label, { textAlign }]}>
                {draftUsesBoxUnits ? tUi('deliveryBoxesOnTruck', locale) : tUi('deliverySetsLabel', locale)}
              </Text>
              <TextInput
                style={[kiosk.input, inputAlign]}
                keyboardType="number-pad"
                value={units}
                onChangeText={setUnits}
              />
            </View>
            {draftUsesBoxUnits ? (
              <Text style={[kiosk.metaLine, { textAlign }]}>
                {formatDeliveryPackSummary(
                  draftAssembly,
                  draftPacketRows,
                  deliveryTruckBoxesToFinishedUnits(draftAssembly, draftPacketRows, unitsNum),
                  unitsNum,
                )}
              </Text>
            ) : null}
            <Text style={[kiosk.label, { textAlign, marginTop: 4 }]}>
              {draftIsFinishedOnly
                ? tUi('deliveryFinishedUnitsTick', locale)
                : tUi('deliveryPacketsTick', locale)}
            </Text>
            {!draftIsFinishedOnly && draftPacketRows.length === 0 ? (
              <Text style={[kiosk.errText, { textAlign, marginBottom: 8 }]}>
                {hasIncompletePacketCartonBom(draftAssembly, draftPacketRows)
                  ? tUi('deliveryIncompleteBom', locale)
                  : tUi('deliveryNoPacketLines', locale)}
              </Text>
            ) : null}
            {draftIsFinishedOnly ? (
              <Pressable
                style={[kiosk.checkRow, draftFinishedConfirmed && kiosk.checkRowOn]}
                onPress={() => setDraftFinishedConfirmed((v) => !v)}
              >
                <Text style={kiosk.checkMark}>{draftFinishedConfirmed ? '☑' : '☐'}</Text>
                <Text style={[kiosk.checkLabel, { textAlign }]}>
                  {tUi('deliveryFinishedUnitLine', locale)
                    .replace('{name}', draftAssembly.name)
                    .replace('{req}', String(unitsNum))}
                </Text>
              </Pressable>
            ) : (
              draftPacketRows.map((p) => {
                const req = unitsNum * Math.max(1, Number(p.qty_per_unit) || 1);
                const on = Boolean(draftChecks[p.id]?.driver_checked);
                const line = tUi('deliveryPacketLine', locale)
                  .replace('{num}', String(p.packet_number))
                  .replace('{name}', String(p.name || ''))
                  .replace('{req}', String(req));
                return (
                  <Pressable
                    key={p.id}
                    style={[kiosk.checkRow, on && kiosk.checkRowOn]}
                    onPress={() => toggleDraftPacket(p.id, req)}
                  >
                    <Text style={kiosk.checkMark}>{on ? '☑' : '☐'}</Text>
                    <Text style={[kiosk.checkLabel, { textAlign }]}>{line}</Text>
                  </Pressable>
                );
              })
            )}
            <Text style={[kiosk.metaLine, { textAlign, marginTop: 4 }]}>
              {tUi('deliveryAddToCartHint', locale)}
            </Text>
            <Pressable style={[kiosk.btnOutlinePrimary, styles.addToCartBtn]} onPress={addDraftToCart}>
              <Text style={kiosk.btnOutlinePrimaryText}>{tUi('deliveryAddToDelivery', locale)}</Text>
            </Pressable>
            <Pressable style={kiosk.draftDeleteBtn} onPress={confirmDiscardDraft}>
              <Text style={kiosk.draftDeleteBtnText}>{tUi('deliveryRemoveProduct', locale)}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[kiosk.sectionTitle, { textAlign }]}>{tUi('deliveryCartTitle', locale)}</Text>
        {!groups.length ? (
          <Text style={[kiosk.metaLine, { textAlign, marginBottom: 8 }]}>
            {tUi('deliveryCartEmpty', locale)}
          </Text>
        ) : null}
        {groups.map((g) => {
          if (isWarehouseSetDeliveryGroup(g)) {
            const u = Math.max(1, Number(g.units) || 1);
            return (
              <View key={g.group_id} style={kiosk.cartCard}>
                <View style={kiosk.cartProductHeader}>
                  <View style={styles.cartTitleCol}>
                    <Text style={[kiosk.cartProductTitle, { textAlign }]}>{g.set_name} (Set)</Text>
                    <Text style={[kiosk.cartMeta, { textAlign }]}>
                      {tUi('deliverySetsOnTruck', locale).replace('{n}', String(u))}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmRemoveFromCart(g.group_id, g.set_name)}
                    hitSlop={8}
                  >
                    <Text style={kiosk.cartRemoveText}>{tUi('deliveryRemoveProduct', locale)}</Text>
                  </Pressable>
                </View>
                <View style={kiosk.cartPacketList}>
                  {(g.components || []).map((comp) => {
                    const rows = byAssembly.get(String(comp.assembly_id)) || [];
                    const asm = allAssemblies.find((a) => String(a.id) === String(comp.assembly_id));
                    const finishedOnly = asm && isFinishedProductWithoutPacketBom(asm, rows);
                    const productQty = Math.max(
                      1,
                      Number(comp.product_qty) || u * Math.max(1, Number(comp.quantity_per_set) || 1),
                    );
                    return (
                      <View key={comp.assembly_id} style={styles.setComponentBlock}>
                        <Text style={[kiosk.label, { textAlign }]}>- {comp.assembly_name}</Text>
                        {finishedOnly ? (
                          <Pressable
                            style={[kiosk.checkRow, comp.finished_driver_checked && kiosk.checkRowOn]}
                            onPress={() => toggleCartSetFinished(g.group_id, comp.assembly_id)}
                          >
                            <Text style={kiosk.checkMark}>{comp.finished_driver_checked ? '☑' : '☐'}</Text>
                            <Text style={[kiosk.checkLabel, { textAlign }]}>
                              {tUi('deliveryFinishedUnitLine', locale)
                                .replace('{name}', comp.assembly_name)
                                .replace('{req}', String(productQty))}
                            </Text>
                          </Pressable>
                        ) : (
                          rows.map((p) => {
                            const req = productQty * Math.max(1, Number(p.qty_per_unit) || 1);
                            const scan = (comp.scans || []).find((s) => String(s.packet_id) === String(p.id));
                            const on = Boolean(scan?.driver_checked);
                            const line = tUi('deliveryPacketLine', locale)
                              .replace('{num}', String(p.packet_number))
                              .replace('{name}', String(p.name || ''))
                              .replace('{req}', String(req));
                            return (
                              <Pressable
                                key={p.id}
                                style={[kiosk.checkRow, on && kiosk.checkRowOn]}
                                onPress={() => toggleCartSetPacket(g.group_id, comp.assembly_id, p.id, req)}
                              >
                                <Text style={kiosk.checkMark}>{on ? '☑' : '☐'}</Text>
                                <Text style={[kiosk.checkLabel, { textAlign }]}>{line}</Text>
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          }

          const packetRows = byAssembly.get(String(g.assembly_id)) || [];
          const asm = allAssemblies.find((a) => String(a.id) === String(g.assembly_id));
          const finishedOnly = asm && isFinishedProductWithoutPacketBom(asm, packetRows);
          const u = Math.max(1, Number(g.units) || 1);
          const checkedCount = finishedOnly
            ? (g.finished_driver_checked ? 1 : 0)
            : (g.scans || []).filter((s) => s.driver_checked).length;
          return (
            <View key={g.assembly_id} style={kiosk.cartCard}>
              <View style={kiosk.cartProductHeader}>
                <View style={styles.cartTitleCol}>
                  <Text style={[kiosk.cartProductTitle, { textAlign }]}>{g.assembly_name}</Text>
                  <Text style={[kiosk.cartMeta, { textAlign }]}>
                    {tUi('deliverySetsOnTruck', locale).replace('{n}', String(u))}
                    {!finishedOnly ? (
                      <>
                        {' · '}
                        {tUi('deliveryPacketsChecked', locale).replace('{n}', String(checkedCount))}
                      </>
                    ) : null}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmRemoveFromCart(g.assembly_id, g.assembly_name)}
                  hitSlop={8}
                >
                  <Text style={kiosk.cartRemoveText}>{tUi('deliveryRemoveProduct', locale)}</Text>
                </Pressable>
              </View>
              <View style={kiosk.cartPacketList}>
                {finishedOnly ? (
                  <Pressable
                    style={[kiosk.checkRow, g.finished_driver_checked && kiosk.checkRowOn]}
                    onPress={() => toggleCartFinished(g.assembly_id)}
                  >
                    <Text style={kiosk.checkMark}>{g.finished_driver_checked ? '☑' : '☐'}</Text>
                    <Text style={[kiosk.checkLabel, { textAlign }]}>
                      {tUi('deliveryFinishedUnitLine', locale)
                        .replace('{name}', g.assembly_name)
                        .replace('{req}', String(u))}
                    </Text>
                  </Pressable>
                ) : (
                  packetRows.map((p) => {
                    const req = u * Math.max(1, Number(p.qty_per_unit) || 1);
                    const scan = (g.scans || []).find((s) => String(s.packet_id) === String(p.id));
                    const on = Boolean(scan?.driver_checked);
                    const line = tUi('deliveryPacketLine', locale)
                      .replace('{num}', String(p.packet_number))
                      .replace('{name}', String(p.name || ''))
                      .replace('{req}', String(req));
                    return (
                      <Pressable
                        key={p.id}
                        style={[kiosk.checkRow, on && kiosk.checkRowOn]}
                        onPress={() => toggleCartPacket(g.assembly_id, p.id, req)}
                      >
                        <Text style={kiosk.checkMark}>{on ? '☑' : '☐'}</Text>
                        <Text style={[kiosk.checkLabel, { textAlign }]}>{line}</Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          );
        })}

        <Text style={[kiosk.metaLine, styles.flowHint, { textAlign }]}>
          {tUi('deliverySignFlowHint', locale)}
        </Text>

        <Pressable
          style={[
            kiosk.btnPrimaryBlock,
            styles.sendBtn,
            !groups.length && styles.sendBtnDisabled,
          ]}
          onPress={goToSignature}
          disabled={!groups.length || sessionOpening}
        >
          <Text style={kiosk.btnPrimaryBlockText}>
            {sessionOpening ? '…' : tUi('deliverySendBtn', locale)}
          </Text>
        </Pressable>
          </>
        );

  return (
    <>
      {isFarmFlow ? (
        <DeliveryKioskVirtualList
          data={farmGridData}
          renderItem={renderFarmGridItem}
          keyExtractor={deliveryWarehouseGridKey}
          numColumns={2}
          columnWrapperStyle={styles.farmGridRow}
          extraData={draftAssemblyId}
          contentContainerStyle={styles.wrap}
          ListHeaderComponent={kitweListHeader}
          ListFooterComponent={kitweListFooter}
        />
      ) : (
        <DeliveryKioskVirtualList
          data={KITWE_SEND_SCROLL_STUB}
          renderItem={() => <View style={styles.scrollStub} />}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.wrap}
          ListHeaderComponent={kitweListHeader}
          ListFooterComponent={kitweListFooter}
        />
      )}

      <ProductionQrScanModal
        visible={scanOpen}
        locale={locale}
        onClose={() => setScanOpen(false)}
        onScan={(value) => {
          setScanOpen(false);
          handleScanValue(value);
        }}
      />

      <DeliveryProductPickModal
        visible={Boolean(pickModal)}
        locale={locale}
        packetLabel={pickModal?.packetLabel}
        assemblies={pickModal?.assemblies}
        onClose={() => setPickModal(null)}
        onPick={(asm) => {
          const packet = pickModal?.packet;
          const farmAfter = pickModal?.farmQtyAfterPick;
          setPickModal(null);
          if (isFarmFlow && farmAfter) {
            openFarmQtyModal(asm, { packet });
            return;
          }
          applyAssemblyWithPacket(asm, packet);
        }}
      />

      <DeliveryFarmQtyAddModal
        visible={Boolean(farmQtyModal?.assembly)}
        locale={locale}
        textAlign={textAlign}
        productName={farmQtyModal?.assembly?.name || ''}
        productSku={farmQtyModal?.assembly?.family_sku || ''}
        maxQty={Math.max(0, Number(farmQtyModal?.maxQty) || 0)}
        onClose={() => setFarmQtyModal(null)}
        onConfirm={confirmFarmQtyAdd}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  scrollStub: { height: 0, overflow: 'hidden' },
  changeProduct: { marginBottom: 12 },
  addToCartBtn: { marginTop: 12 },
  cartTitleCol: { flex: 1 },
  sendBtn: { marginTop: 12 },
  sendBtnBusy: { opacity: 0.65 },
  sendBtnDisabled: { opacity: 0.5 },
  flowHint: { marginTop: 10, marginBottom: 4, lineHeight: 20, color: theme.muted },
  setComponentBlock: { marginTop: 8 },
  farmGridRow: { gap: 8, marginBottom: 8, alignItems: 'flex-start' },
});
