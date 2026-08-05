import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CustomerBalanceCard, PrimaryButton, ScreenWrap, StatCard } from '../components/ui';
import { acknowledgeMonthlyReport, getDashboardData } from '../db/repository';
import { colors, styles } from '../theme';
import { formatDate, formatMoney } from '../utils/format';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 12 }}>
          Dashboard
        </Text>

        <View style={[styles.row, { marginBottom: 8 }]}>
          <StatCard label="Pending" value={String(stats.pendingCount || 0)} tone="warning" />
          <StatCard label="Overdue" value={String(stats.overdueCount || 0)} tone="danger" />
        </View>
        <View style={[styles.card, { marginBottom: 16 }]}>
          <Text style={styles.cardSub}>Total outstanding</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>
            {formatMoney(stats.totalOutstanding || 0)}
          </Text>
        </View>

        {data?.monthlyReport?.due ? (
          <View style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Monthly dues report</Text>
            <Text style={styles.cardSub}>
              Generated {formatDate(data.monthlyReport.generatedAt)}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary, marginVertical: 8 }}>
              {formatMoney(data.monthlyReport.totalOutstanding)}
            </Text>
            {data.monthlyReport.rows.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => navigation.navigate('CustomerDetail', { customerId: row.id })}
                style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Text style={{ fontWeight: '700', color: colors.text }}>{row.name}</Text>
                <Text style={styles.cardSub}>
                  {formatMoney(row.balance)}
                  {row.overdue ? ` · overdue ${Math.abs(row.daysRemaining)}d` : ` · ${row.daysRemaining}d left`}
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
