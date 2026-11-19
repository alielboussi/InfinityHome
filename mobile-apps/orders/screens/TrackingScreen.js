import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import TrackingJobCard from '../components/TrackingJobCard';
import ProductionTrackingFilterModal, {
  ProductionTrackingFilterButton,
} from '../components/ProductionTrackingFilterModal';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  applyProductionTrackingFilters,
  isProductionTrackingFilterActive,
  partitionProductionTrackingJobs,
} from '../shared/productionTrackingListUi';
import { fetchOrdersTracking } from '../services/ordersApi';

export default function TrackingScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [trackKind, setTrackKind] = useState('all');
  const [progress, setProgress] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const warmedRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!allowed) return;
    const quiet = silent || warmedRef.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const res = await fetchOrdersTracking({
        department: department === 'all' ? undefined : department,
        track_kind: trackKind === 'all' ? undefined : trackKind,
      });
      setRows(Array.isArray(res.jobs) ? res.jobs : []);
      warmedRef.current = true;
    } catch (err) {
      if (!quiet) {
        setError(err?.message || tUi('loadFailed', locale));
        setRows([]);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [allowed, locale, department, trackKind]);

  useFocusEffect(useCallback(() => { void load({ silent: warmedRef.current }); }, [load]));

  useEffect(() => {
    if (warmedRef.current) void load({ silent: false });
  }, [department, trackKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => applyProductionTrackingFilters(rows, {
    search,
    department,
    trackKind,
    progress,
  }), [rows, search, department, trackKind, progress]);

  const { inProgress, completed } = useMemo(
    () => partitionProductionTrackingJobs(filtered),
    [filtered],
  );

  const filterActive = isProductionTrackingFilterActive({ department, trackKind, progress });
  const showProgressSections = progress === 'all' && inProgress.length > 0 && completed.length > 0;

  const clearFilters = () => {
    setDepartment('all');
    setTrackKind('all');
    setProgress('all');
  };

  return (
    <OrdersScreenShell
      title={tUi('tileProductionTracking', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      <Text style={kiosk.hint}>{tUi('productionTrackingIntro', locale)}</Text>
      <View style={styles.toolbar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search product, SKU, status…"
          placeholderTextColor={theme.textDim}
          style={[kiosk.input, styles.search]}
        />
        <ProductionTrackingFilterButton
          active={filterActive}
          locale={locale}
          tUi={tUi}
          onPress={() => setFilterOpen(true)}
        />
      </View>
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading && !rows.length ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {showProgressSections ? (
            <Text style={styles.sectionHeading}>{tUi('trackingSectionInProgress', locale)}</Text>
          ) : null}
          {inProgress.map((row) => (
            <TrackingJobCard
              key={`${row.department}:${row.id}`}
              row={row}
              locale={locale}
              tUi={tUi}
              textAlign={textAlign}
            />
          ))}
          {showProgressSections ? (
            <Text style={styles.sectionHeading}>{tUi('trackingSectionCompleted', locale)}</Text>
          ) : null}
          {completed.map((row) => (
            <TrackingJobCard
              key={`${row.department}:${row.id}`}
              row={row}
              locale={locale}
              tUi={tUi}
              textAlign={textAlign}
            />
          ))}
          {!filtered.length ? <Text style={kiosk.hint}>{tUi('empty', locale)}</Text> : null}
        </ScrollView>
      )}
      <ProductionTrackingFilterModal
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        locale={locale}
        tUi={tUi}
        department={department}
        trackKind={trackKind}
        progress={progress}
        onDepartmentChange={setDepartment}
        onTrackKindChange={setTrackKind}
        onProgressChange={setProgress}
        onClear={clearFilters}
      />
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  search: { flex: 1, marginBottom: 0 },
  sectionHeading: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '800',
    color: theme.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});