import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  DEFAULT_PRODUCTION_PUSH_PREFS,
  loadProductionPushPrefs,
  saveProductionPushPrefs,
} from '../productionPushPrefs';

function PrefRow({ label, hint, value, onValueChange, disabled, primaryColor }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#334155', true: primaryColor }}
        thumbColor="#f8fafc"
      />
    </View>
  );
}

/**
 * @param {object} props
 * @param {{ goBack?: () => void }} props.navigation
 * @param {(args?: { pushPrefs?: object }) => Promise<unknown>} props.registerProductionPushTokenWithServer
 * @param {string} [props.themePrimary]
 * @param {import('react-native').ViewStyle} [props.screenStyle]
 * @param {number} [props.paddingTop]
 * @param {number} [props.paddingBottom]
 */
export default function ProductionPushSettingsScreen({
  navigation,
  registerProductionPushTokenWithServer,
  themePrimary = '#0ea5e9',
  screenStyle,
  paddingTop = 8,
  paddingBottom = 24,
}) {
  const [prefs, setPrefs] = useState({ ...DEFAULT_PRODUCTION_PUSH_PREFS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let mounted = true;
    loadProductionPushPrefs()
      .then((loaded) => { if (mounted) setPrefs(loaded); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const toggle = useCallback((key) => (next) => {
    setPrefs((prev) => ({ ...prev, [key]: next }));
  }, []);

  const handleSave = useCallback(async () => {
    if (typeof registerProductionPushTokenWithServer !== 'function') {
      setStatus('Push registration is not configured for this app.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const saved = await saveProductionPushPrefs(prefs);
      setPrefs(saved);
      await registerProductionPushTokenWithServer({ pushPrefs: saved });
      setStatus('Saved. Push preferences updated on server.');
    } catch (err) {
      setStatus(err?.message || 'Could not save push settings.');
    } finally {
      setSaving(false);
    }
  }, [prefs, registerProductionPushTokenWithServer]);

  const back = () => navigation?.goBack?.();

  return (
    <View style={[styles.screen, screenStyle, { paddingTop, paddingBottom }]}>
      <Pressable style={styles.backLink} onPress={back} accessibilityRole="button">
        <Text style={[styles.backLinkText, { color: themePrimary }]}>← Dashboard</Text>
      </Pressable>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={themePrimary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            Choose which production alerts this device should receive. Changes apply after you save.
          </Text>
          <PrefRow label="Quote orders" hint="New Hassan quote orders" value={prefs.quotes} onValueChange={toggle('quotes')} disabled={saving} primaryColor={themePrimary} />
          <PrefRow label="Repairs" hint="Repair queue updates" value={prefs.repairs} onValueChange={toggle('repairs')} disabled={saving} primaryColor={themePrimary} />
          <PrefRow label="Jobs" hint="Floor 2 job timers and status" value={prefs.jobs} onValueChange={toggle('jobs')} disabled={saving} primaryColor={themePrimary} />
          <PrefRow label="Painting jobs" hint="Butterfly / painting work" value={prefs.painting_jobs} onValueChange={toggle('painting_jobs')} disabled={saving} primaryColor={themePrimary} />
          {status ? <Text style={styles.status}>{status}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.saveBtn, { backgroundColor: themePrimary }, pressed && styles.saveBtnPressed, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a' },
  backLink: { paddingHorizontal: 20, paddingBottom: 8 },
  backLinkText: { fontSize: 16, fontWeight: '600' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  lead: { color: '#94a3b8', fontSize: 15, lineHeight: 22, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowLabel: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  rowHint: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  status: { color: '#7dd3fc', fontSize: 14, marginTop: 16 },
  saveBtn: {
    marginTop: 24,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnPressed: { opacity: 0.88 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
