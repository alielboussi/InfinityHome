import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  clearKitweDraft,
  enqueueOfflineOp,
  flushOfflineQueue,
} from '../shared/offlineScanQueue';
import {
  isLikelyNetworkError,
  warehouseMobileRequest,
} from '../shared/warehouseMobileApi';

function buildGroups(lines) {
  const byAssembly = new Map();
  (lines || []).forEach((line) => {
    const aid = String(line.assembly_id || 'unlinked');
    if (!byAssembly.has(aid)) {
      byAssembly.set(aid, {
        assembly_id: line.assembly_id,
        label: line.assembly_id ? 'Product group' : 'Unlinked packets',
        units: '1',
        scans: [],
      });
    }
    const g = byAssembly.get(aid);
    const pid = String(line.packet_id);
    const existing = g.scans.find((s) => String(s.packet_id) === pid);
    if (existing) existing.quantity += 1;
    else g.scans.push({ packet_id: pid, quantity: 1 });
  });
  return Array.from(byAssembly.values());
}

export default function KitweTransferReviewScreen({ route, navigation }) {
  const { sessionId, deliveryNumber, lines: initialLines } = route.params || {};
  const [groups, setGroups] = useState(() => buildGroups(initialLines));
  const [validation, setValidation] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const hasUnlinked = useMemo(
    () => groups.some((g) => !g.assembly_id),
    [groups],
  );

  const runValidation = useCallback(async () => {
    const next = {};
    for (const group of groups) {
      if (!group.assembly_id) {
        next.unlinked = { ok: false, message: 'Link packets to a product on web before shipping.' };
        continue;
      }
      const units = Math.max(1, Number(group.units) || 1);
      try {
        const res = await warehouseMobileRequest('bom-validate', {
          assembly_id: group.assembly_id,
          units,
          scans: group.scans,
        });
        next[group.assembly_id] = res;
      } catch (err) {
        next[group.assembly_id] = {
          ok: false,
          message: err?.message || 'Validation failed',
          missing: err?.details?.missing || [],
        };
      }
    }
    setValidation(next);
    return next;
  }, [groups]);

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  const canSubmit = useMemo(() => {
    if (hasUnlinked || !sessionId || done) return false;
    const keys = Object.keys(validation).filter((k) => k !== 'unlinked');
    if (!keys.length) return false;
    return keys.every((k) => validation[k]?.ok);
  }, [validation, hasUnlinked, sessionId, done]);

  const setUnits = (assemblyId, value) => {
    setGroups((prev) => prev.map((g) => (
      String(g.assembly_id) === String(assemblyId) ? { ...g, units: value } : g
    )));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    const v = await runValidation();
    const blocked = Object.values(v).some((row) => row && row.ok === false);
    if (blocked) {
      setError('Complete set required — fix missing packet #s before submit.');
      setBusy(false);
      return;
    }

    const payload = {
      session_id: sessionId,
      groups: groups
        .filter((g) => g.assembly_id)
        .map((g) => ({
          assembly_id: g.assembly_id,
          units: Math.max(1, Number(g.units) || 1),
          scans: g.scans,
        })),
    };

    try {
      await warehouseMobileRequest('delivery-submit', payload);
      await clearKitweDraft();
      setDone(true);
      setError('');
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        await enqueueOfflineOp('delivery-submit', payload);
        setError('Offline — submit queued. Open Review again when online to sync.');
      } else {
        setError(err?.message || 'Submit failed.');
        if (err?.details?.missing) {
          setValidation((prev) => ({
            ...prev,
            [payload.groups[0]?.assembly_id]: err.details,
          }));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    flushOfflineQueue(async (item) => {
      if (item.op !== 'delivery-submit') return false;
      await warehouseMobileRequest('delivery-submit', item.body);
      await clearKitweDraft();
      return true;
    });
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.dn}>{deliveryNumber}</Text>
      <Text style={styles.sub}>Confirm complete sets — missing BOM packets block submit.</Text>

      {groups.map((group) => {
        const key = group.assembly_id || 'unlinked';
        const val = validation[key];
        const missing = val?.missing || [];
        return (
          <View key={key} style={styles.card}>
            <Text style={styles.cardTitle}>{group.label}</Text>
            {group.assembly_id ? (
              <View style={styles.unitsRow}>
                <Text style={styles.label}>Complete units</Text>
                <TextInput
                  style={styles.unitsInput}
                  value={group.units}
                  onChangeText={(t) => setUnits(group.assembly_id, t)}
                  keyboardType="number-pad"
                />
              </View>
            ) : null}
            {val?.message ? (
              <Text style={val.ok ? styles.ok : styles.warn}>{val.message}</Text>
            ) : null}
            {missing.length ? (
              <View style={styles.missingBox}>
                <Text style={styles.missingTitle}>Missing packets</Text>
                {missing.map((m) => (
                  <Text key={m.packet_id} style={styles.missingLine}>
                    #{m.packet_number} {m.name} — need {m.need}, have {m.have}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {done ? (
        <Text style={styles.ok}>Submitted — Hassan portal will be notified.</Text>
      ) : (
        <Pressable style={[styles.btn, !canSubmit && styles.btnDisabled]} onPress={submit} disabled={!canSubmit || busy}>
          <Text style={styles.btnText}>{busy ? 'Submitting…' : 'Submit delivery'}</Text>
        </Pressable>
      )}
      <Pressable style={styles.btnSecondary} onPress={() => navigation.goBack()}>
        <Text style={styles.btnText}>Back to scan</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, backgroundColor: '#0f172a', flexGrow: 1 },
  dn: { color: '#38bdf8', fontSize: 18, fontWeight: '700' },
  sub: { color: '#94a3b8', marginBottom: 16 },
  card: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: { color: '#f8fafc', fontWeight: '700', marginBottom: 8 },
  unitsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  label: { color: '#94a3b8' },
  unitsInput: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 6,
    padding: 8,
    minWidth: 56,
    color: '#f8fafc',
  },
  missingBox: { backgroundColor: '#422006', padding: 8, borderRadius: 8, marginTop: 8 },
  missingTitle: { color: '#fde68a', fontWeight: '700' },
  missingLine: { color: '#fef3c7', marginTop: 4 },
  warn: { color: '#fbbf24' },
  ok: { color: '#4ade80', marginVertical: 8 },
  error: { color: '#f87171', marginVertical: 8 },
  btn: {
    backgroundColor: '#2a9d8f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.45 },
  btnSecondary: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  btnText: { color: '#fff', fontWeight: '700' },
});
