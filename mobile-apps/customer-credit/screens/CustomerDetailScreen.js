import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { HorizontalMoneyRow, PrimaryButton, ScreenWrap, SecondaryButton } from '../components/ui';
import { deleteCustomer, getCustomer, listCustomerSales, listPayments } from '../db/repository';
import { colors, styles } from '../theme';
import { CURRENCIES, formatAdvanceBalances, formatDate, formatMoney, formatSaleTitle } from '../utils/format';

function formatLedgerTotals(totals) {
  return CURRENCIES
    .map((currency) => formatMoney(totals?.[currency] || 0, currency))
    .join(' · ');
}

export default function CustomerDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const customerId = route.params?.customerId;
  const [customer, setCustomer] = useState(null);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);

  const load = useCallback(async () => {
    const row = await getCustomer(customerId);
    const saleRows = await listCustomerSales(customerId);
    const paymentRows = await listPayments(customerId);
    setCustomer(row);
    setSales(saleRows);
    setPayments(paymentRows);
  }, [customerId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onDelete = () => {
    Alert.alert('Delete customer', `Remove ${customer?.name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCustomer(customerId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!customer) {
    return (
      <ScreenWrap>
        <View style={styles.content}>
          <Text style={styles.empty}>Loading customer…</Text>
        </View>
      </ScreenWrap>
    );
  }

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{customer.name}</Text>
          {customer.phone ? <Text style={styles.cardSub}>{customer.phone}</Text> : null}
          {customer.address ? <Text style={styles.cardSub}>{customer.address}</Text> : null}
          <View style={{ marginTop: 10 }}>
            {customer.hasBalance ? (
              <>
                <Text style={[styles.cardSub, { fontWeight: '700', color: customer.overdue ? colors.danger : colors.primary }]}>
                  Balance due
                </Text>
                <HorizontalMoneyRow
                  balanceByCurrency={customer.balanceByCurrency}
                  amountStyle={{
                    fontSize: 24,
                    fontWeight: '800',
                    color: customer.overdue ? colors.danger : colors.primary,
                  }}
                />
              </>
            ) : customer.hasAdvanceCredit ? (
              <>
                <Text style={[styles.cardSub, { fontWeight: '700', color: colors.success }]}>Advance credit remaining</Text>
                <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>
                  {formatAdvanceBalances(customer.advanceCreditByCurrency)}
                </Text>
              </>
            ) : (
              <Text style={[styles.cardSub, { fontWeight: '700', color: colors.success }]}>Settled — no balance due</Text>
            )}
          </View>
          <Text style={styles.cardSub}>
            Charged {formatLedgerTotals(customer.chargedByCurrency)} · Paid {formatLedgerTotals(customer.paidByCurrency)}
          </Text>
          {customer.hasAdvanceCredit && customer.hasBalance ? (
            <Text style={[styles.cardSub, { color: colors.warning, fontWeight: '600' }]}>
              Advance credit: {formatAdvanceBalances(customer.advanceCreditByCurrency)}
            </Text>
          ) : null}
          <Text style={styles.cardSub}>
            Payment deadline: {customer.paymentDeadlineDays} days
            {customer.hasBalance
              ? customer.overdue
                ? ` · overdue by ${Math.abs(customer.daysRemaining)} days`
                : ` · ${customer.daysRemaining} days remaining`
              : ' · settled'}
          </Text>
        </View>

        <View style={{ gap: 10, marginBottom: 16 }}>
          <PrimaryButton
            title="Add sale / amount due"
            onPress={() => navigation.navigate('AddSale', { customerId })}
          />
          {customer.hasBalance ? (
            <SecondaryButton
              title="Record payment"
              onPress={() => navigation.navigate('AddPayment', { customerId })}
            />
          ) : (
            <SecondaryButton
              title={customer.hasAdvanceCredit ? 'Add more advance' : 'Add advance paid amount'}
              onPress={() => navigation.navigate('AddAdvance', { customerId })}
            />
          )}
          <SecondaryButton title="Edit customer" onPress={() => navigation.navigate('CustomerForm', { customerId })} />
          <Pressable style={styles.btnDanger} onPress={onDelete}>
            <Text style={styles.btnDangerText}>Delete customer</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Products taken</Text>
        {sales.length ? sales.map((sale) => (
          <View key={sale.id} style={styles.card}>
            <Text style={styles.cardTitle}>{formatSaleTitle(sale)}</Text>
            {sale.product_name && sale.description ? <Text style={styles.cardSub}>{sale.description}</Text> : null}
            <Text style={styles.cardSub}>
              {sale.quantity} × {formatMoney(sale.unit_price, sale.currency)} = {formatMoney(sale.quantity * sale.unit_price, sale.currency)}
            </Text>
            <Text style={styles.cardSub}>{formatDate(sale.sale_date)}</Text>
          </View>
        )) : <Text style={styles.empty}>No products recorded yet.</Text>}

        <Text style={styles.sectionTitle}>Payments</Text>
        {payments.length ? payments.map((payment) => (
          <View key={payment.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {formatMoney(payment.amount, payment.currency)}
              {payment.is_advance ? ' · Advance paid' : payment.is_down_payment ? ' · Down payment' : ''}
            </Text>
            <Text style={styles.cardSub}>{formatDate(payment.payment_date)}</Text>
            {payment.notes ? <Text style={styles.cardSub}>{payment.notes}</Text> : null}
          </View>
        )) : <Text style={styles.empty}>No payments yet.</Text>}
      </ScrollView>
    </ScreenWrap>
  );
}
