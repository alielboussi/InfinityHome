import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CustomerBalanceCard, HorizontalMoneyRow, PrimaryButton, ScreenWrap, StatCard } from '../components/ui';
import { acknowledgeMonthlyReport, getDashboardData } from '../db/repository';
import { signOutFirebase } from '../../shared/firebase';
import { useFirebaseUser } from '../../shared/AuthGate';
import { colors, styles } from '../theme';
import { displayNameForUser } from '../utils/displayName';
import { formatBalances, formatDate } from '../utils/format';

function SummaryStat({ label, value, tone = 'default' }) {
  return (
    <View style={{ flex: 1, minWidth: 100 }}>
      <StatCard label={label} value={value} tone={tone} />
    </View>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation();
  const user = useFirebaseUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getDashboardData();
      setData(next);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const dismissMonthlyReport = async () => {
    await acknowledgeMonthlyReport();
    await load();
  };

  const onLogout = () => {
    Alert.alert('Log out', 'Sign out of Ledger?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await signOutFirebase();
          } catch (err) {
            Alert.alert('Error', err?.message || 'Could not sign out.');
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  if (loading && !data) {
    return (
      <ScreenWrap>
        <View style={styles.content}>
          <Text style={styles.empty}>Loading dashboard…</Text>
        </View>
      </ScreenWrap>
    );
  }

  const stats = data?.stats || {};
  const outstanding = stats.totalOutstandingByCurrency || { K: 0, $: 0 };
  const displayName = displayNameForUser(user);

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.primary, borderColor: colors.primary, marginBottom: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#dbeafe', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>
                Welcome back
              </Text>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 }}>{displayName}</Text>
            </View>
            <Pressable
              onPress={onLogout}
              disabled={loggingOut}
              style={{
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{loggingOut ? '…' : 'Log out'}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
          <SummaryStat label="Pending" value={String(stats.pendingCount || 0)} tone="warning" />
          <SummaryStat label="Overdue" value={String(stats.overdueCount || 0)} tone="danger" />
          <View style={[styles.card, { minWidth: 220, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' }}>
              Outstanding
            </Text>
            <View style={{ marginTop: 8 }}>
              <HorizontalMoneyRow
                balanceByCurrency={outstanding}
                amountStyle={{ fontSize: 18, fontWeight: '800', color: colors.primary }}
                dividerColor="#bfd3ef"
              />
            </View>
          </View>
        </ScrollView>

        <View style={[styles.card, { marginTop: 12, marginBottom: 16 }]}>
          <Text style={styles.sectionTitle}>Total outstanding</Text>
          <HorizontalMoneyRow
            balanceByCurrency={outstanding}
            amountStyle={{ fontSize: 26, fontWeight: '800', color: colors.text }}
          />
        </View>

        {data?.monthlyReport?.due ? (
          <View style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.primarySoft, marginBottom: 16 }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Monthly dues report</Text>
            <Text style={styles.cardSub}>Generated {formatDate(data.monthlyReport.generatedAt)}</Text>
            <View style={{ marginVertical: 10 }}>
              <HorizontalMoneyRow
                balanceByCurrency={data.monthlyReport.totalOutstandingByCurrency}
                amountStyle={{ fontSize: 18, fontWeight: '800', color: colors.primary }}
                dividerColor="#bfd3ef"
              />
            </View>
            {data.monthlyReport.rows.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => navigation.navigate('CustomerDetail', { customerId: row.id })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>{row.name}</Text>
                <Text style={styles.cardSub}>
                  {formatBalances(row.balanceByCurrency)}
                  {row.overdue ? ` · ${Math.abs(row.daysRemaining)}d overdue` : ` · ${row.daysRemaining}d left`}
                </Text>
              </Pressable>
            ))}
            <View style={{ marginTop: 12 }}>
              <PrimaryButton title="Mark report as seen" onPress={dismissMonthlyReport} />
            </View>
          </View>
        ) : null}

        {data?.overdue?.length ? (
          <>
            <Text style={styles.sectionTitle}>Overdue warnings</Text>
            {data.overdue.map((customer) => (
              <CustomerBalanceCard
                key={customer.id}
                customer={customer}
                compact
                onPress={() => navigation.navigate('CustomerDetail', { customerId: customer.id })}
              />
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Pending balances</Text>
        {data?.withBalance?.length ? (
          data.withBalance.map((customer) => (
            <CustomerBalanceCard
              key={customer.id}
              customer={customer}
              compact
              onPress={() => navigation.navigate('CustomerDetail', { customerId: customer.id })}
            />
          ))
        ) : (
          <Text style={styles.empty}>No customers with outstanding balances.</Text>
        )}
      </ScrollView>
    </ScreenWrap>
  );
}
