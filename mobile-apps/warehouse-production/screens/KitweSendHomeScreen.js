import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import DeliveryProductPickModal from '../components/DeliveryProductPickModal';
import ProductionQrScanModal from '../components/ProductionQrScanModal';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import {
  buildDeliveryPacketChecks,
  refreshDeliveryPacketCheckQty,
} from '../lib/deliveryAssemblyChecks';
import { assembliesUsingPacket, findWarehousePacketByScan } from '../lib/deliveryPacketAssemblies';
import { filterAssembliesForDeliverySearch } from '../lib/deliveryCatalogSearch';
import { resolveDeliveryCatalogScan } from '../lib/deliveryScanResolve';
import { isFinishedProductWithoutPacketBom } from '../shared/warehouseCatalogProductCompleteness';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { getProductionDispatcherLabelSync } from '../lib/productionDispatcherLabel';
import { tUi } from '../lib/productionKioskI18n';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { fetchWarehouseCatalogCached } from '../shared/warehouseCatalogStore';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';
import {
  readDeliveryWorkspace,
  writeDeliveryWorkspace,
} from '../lib/productionDeliveryWorkspaceCache';

function buildPrintGroupsFromCart(groups, byAssembly, assemblies) {
  return (groups || []).map((g) => {
    const packetRows = byAssembly.get(String(g.assembly_id)) || [];
    const u = Math.max(1, Number(g.units) || 1);
    const assembly = (assemblies || []).find((a) => String(a.id) === String(g.assembly_id));
    if (assembly && isFinishedProductWithoutPacketBom(assembly, packetRows)) {
      return {
        assembly_name: g.assembly_name,
        units: u,
        lines: [{ name: g.assembly_name, packet_number: '', qty: u }],
      };
    }
    return {
      assembly_name: g.assembly_name,
      units: u,
      lines: packetRows.map((p) => ({
        name: p.name,
        packet_number: p.packet_number,
        qty: u * Math.max(1, Number(p.qty_per_unit) || 1),
      })),
    };
  });
}

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

export default function KitweSendHomeScreen({ navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const restored = readDeliveryWorkspace();
  const [sessionId, setSessionId] = useState(restored?.sessionId || '');
  const [deliveryNumber, setDeliveryNumber] = useState(restored?.deliveryNumber || '');
  const [groups, setGroups] = useState(restored?.groups || []);
  const [error, setError] = useState('');

  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState('');
  const [draftAssemblyId, setDraftAssemblyId] = useState('');
  const [units, setUnits] = useState('1');
  const [draftChecks, setDraftChecks] = useState({});
  const [draftFinishedConfirmed, setDraftFinishedConfirmed] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pickModal, setPickModal] = useState(null);

  const assemblies = catalog?.assemblies || [];
  const packets = catalog?.packets || [];
  const links = catalog?.assemblyPackets || [];

  const byAssembly = useMemo(
    () => buildPacketsByAssembly(links, packets),
    [links, packets],
  );

  const filtered = useMemo(
    () => filterAssembliesForDeliverySearch(assemblies, search, { limit: 25 }),
    [assemblies, search],
  );

  const draftPacketRows = draftAssemblyId
    ? (byAssembly.get(String(draftAssemblyId)) || [])
    : [];
  const draftAssembly = assemblies.find((a) => String(a.id) === String(draftAssemblyId));
  const draftIsFinishedOnly = draftAssembly
    ? isFinishedProductWithoutPacketBom(draftAssembly, draftPacketRows)
    : false;
  const unitsNum = Math.max(1, Number(units) || 1);
  const inputAlign = { textAlign: locale === 'ar' ? 'right' : 'left' };

  const boot = useCallback(async () => {
    if (sessionId) return;
    setError('');
    try {
      const sess = await warehouseMobileRequest('delivery-session-open');
      setSessionId(sess.session_id);
      setDeliveryNumber(sess.delivery_number);
    } catch (err) {
      setError(err?.message || 'deliverySessionFailed');
    }
  }, [sessionId]);

  useEffect(() => {
    boot();
    fetchWarehouseCatalogCached({ force: false }).then(setCatalog).catch(() => {});
  }, [boot]);

  useEffect(() => {
    if (sessionId) {
      writeDeliveryWorkspace({ sessionId, deliveryNumber, groups });
    }
  }, [sessionId, deliveryNumber, groups]);

  const clearDraft = useCallback(() => {
    setDraftAssemblyId('');
    setDraftChecks({});
    setDraftFinishedConfirmed(false);
    setUnits('1');
  }, []);

  const selectAssemblyForDraft = useCallback((a) => {
    const rows = byAssembly.get(String(a.id)) || [];
    setDraftAssemblyId(a.id);
    setDraftChecks(buildDeliveryPacketChecks(rows, unitsNum, {}));
    setDraftFinishedConfirmed(false);
    setError('');
  }, [byAssembly, unitsNum]);

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

  const handleScanValue = useCallback((raw) => {
    const value = String(raw || '').trim();
    if (!value) return;
    if (!packets.length && !assemblies.length) {
      setError(tUi('loading', locale));
      return;
    }

    const resolved = resolveDeliveryCatalogScan(value, {
      assemblies,
      packets,
      assemblyPackets: links,
    });
    if (resolved?.kind === 'assembly') {
      setError('');
      setSearch(resolved.assembly.name || value);
      selectAssemblyForDraft(resolved.assembly);
      if (resolved.assembly) {
        setDraftFinishedConfirmed(true);
      }
      return;
    }
    if (resolved?.kind === 'assembly_sku_needs_carton') {
      setError(tUi('deliveryScanProductSkuUseCarton', locale));
      return;
    }

    const packet = findWarehousePacketByScan(value, packets);
    if (!packet) {
      setError(tUi('deliveryScanNoPacket', locale));
      return;
    }
    const candidates = assembliesUsingPacket(packet.id, links, assemblies);
    if (!candidates.length) {
      setError(tUi('deliveryScanNoProduct', locale));
      return;
    }
    setError('');
    if (candidates.length === 1) {
      applyAssemblyWithPacket(candidates[0], packet);
      return;
    }
    const label = `#${packet.packet_number || ''} ${packet.name || ''}`.trim();
    setPickModal({ packet, assemblies: candidates, packetLabel: label });
  }, [packets, links, assemblies, locale, applyAssemblyWithPacket, selectAssemblyForDraft]);

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

  const addDraftToCart = () => {
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

  const confirmRemoveFromCart = (assemblyId, assemblyName) => {
    const name = String(assemblyName || '').trim() || '—';
    Alert.alert(
      tUi('deliveryDeleteConfirmTitle', locale),
      tUi('deliveryDeleteConfirmMessage', locale).replace('{name}', name),
      [
        { text: tUi('deliveryAlertCancel', locale), style: 'cancel' },
        {
          text: tUi('deliveryRemoveProduct', locale),
          style: 'destructive',
          onPress: () => {
            setGroups((prev) => prev.filter((g) => String(g.assembly_id) !== String(assemblyId)));
          },
        },
      ],
    );
  };

  const confirmDiscardDraft = () => {
    if (!draftAssembly) return;
    const name = String(draftAssembly.name || '').trim() || '—';
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
      const asm = assemblies.find((a) => String(a.id) === String(g.assembly_id));
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

  const goToSignature = () => {
    if (!sessionId || !groups.length) {
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
    navigation.navigate('KitweSendSignature', {
      sessionId,
      deliveryNumber,
      dispatchedByName: getProductionDispatcherLabelSync(),
      groups: groups.map((g) => ({
        assembly_id: g.assembly_id,
        units: g.units,
        scans: g.scans,
        finished_driver_checked: g.finished_driver_checked,
        finished_driver_checked_at: g.finished_driver_checked_at,
      })),
      printGroups: buildPrintGroupsFromCart(groups, byAssembly, assemblies),
    });
  };

  return (
    <>
      <KioskSafeScroll contentContainerStyle={styles.wrap}>
        <ProductionKioskTopBar
          title={tUi('deliveryTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>

        <View style={kiosk.card}>
          <Text style={[kiosk.heroNumber, { textAlign }]}>{deliveryNumber || '…'}</Text>
          <Text style={[kiosk.metaLine, { textAlign, marginBottom: 0 }]}>
            {tUi('deliverySubtitle', locale)}
          </Text>
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

        {!draftAssemblyId && filtered.length > 0 ? (
          <View style={kiosk.listGroup}>
            {filtered.map((a, index) => (
              <Pressable
                key={a.id}
                style={[kiosk.listItem, index === filtered.length - 1 && kiosk.listItemLast]}
                onPress={() => selectAssemblyForDraft(a)}
              >
                <Text style={[kiosk.listItemText, { textAlign }]}>{a.name}</Text>
              </Pressable>
            ))}
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
              <Text style={[kiosk.label, { textAlign }]}>{tUi('deliverySetsLabel', locale)}</Text>
              <TextInput
                style={[kiosk.input, inputAlign]}
                keyboardType="number-pad"
                value={units}
                onChangeText={setUnits}
              />
            </View>
            <Text style={[kiosk.label, { textAlign, marginTop: 4 }]}>
              {draftIsFinishedOnly
                ? tUi('deliveryFinishedUnitsTick', locale)
                : tUi('deliveryPacketsTick', locale)}
            </Text>
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
          const packetRows = byAssembly.get(String(g.assembly_id)) || [];
          const asm = assemblies.find((a) => String(a.id) === String(g.assembly_id));
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
          disabled={!groups.length}
        >
          <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliverySendBtn', locale)}</Text>
        </Pressable>
      </KioskSafeScroll>

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
          setPickModal(null);
          applyAssemblyWithPacket(asm, packet);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  changeProduct: { marginBottom: 12 },
  addToCartBtn: { marginTop: 12 },
  cartTitleCol: { flex: 1 },
  sendBtn: { marginTop: 12 },
  sendBtnBusy: { opacity: 0.65 },
  sendBtnDisabled: { opacity: 0.5 },
  flowHint: { marginTop: 10, marginBottom: 4, lineHeight: 20, color: theme.muted },
});
