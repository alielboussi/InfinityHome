import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CurrencyToggle, HorizontalMoneyRow, PrimaryButton, ScreenWrap } from '../components/ui';
import { addPayment, getCustomer } from '../db/repository';
import { colors, styles } from '../theme';
import { DEFAULT_CURRENCY, formatBalances, parseMoney } from '../utils/format';
import { todayIsoDate } from '../utils/ids';

function defaultCurrencyForCustomer(customer) {
  if (!customer?.balanceByCurrency) return DEFAULT_CURRENCY;
  if (Number(customer.balanceByCurrency.$ || 0) > 0.01) return '$';
  if (Number(customer.balanceByCurrency.K || 0) > 0.01) return 'K';
  return DEFAULT_CURRENCY;
}

export default function AddPaymentScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const customerId = route.params?.customerId;
  const [customer, setCustomer] = useState(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [isDownPayment, setIsDownPayment] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      const row = await getCustomer(customerId);
      setCustomer(row);
      if (row) {
        setCurrency(defaultCurrencyForCustomer(row));
        setIsDownPayment(!row.hasBalance);
      }
    })();
  }, [customerId]);

  const onSave = async () => {
    const parsedAmount = parseMoney(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Amount required', 'Enter a payment amount greater than zero.');
      return;
    }
    if (!customerId) {
      Alert.alert('Customer required', 'Open this screen from a customer record.');
      return;
    }

    setSaving(true);
    try {
      await addPayment({
        customer_id: customerId,
        amount: parsedAmount,
        currency,
        payment_date: paymentDate,
        is_down_payment: isDownPayment,
        notes,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
        {customer ? (
          <View style={[styles.card, { marginBottom: 12, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
            <Text style={styles.cardTitle}>{customer.name}</Text>
            <Text style={styles.cardSub}>
              {customer.hasBalance ? 'Outstanding balance' : 'No balance due'}
            </Text>
            <View style={{ marginTop: 8 }}>
              <HorizontalMoneyRow
                balanceByCurrency={customer.balanceByCurrency}
                amountStyle={{ fontSize: 20, fontWeight: '800', color: colors.primary }}
                dividerColor="#bfd3ef"
              />
            </View>
            {customer.hasBalance ? (
              <Text style={[styles.cardSub, { marginTop: 8 }]}>
                You can record another payment against this balance at any time.
              </Text>
            ) : null}
          </View>
        ) : null}

        <CurrencyToggle value={currency} onChange={setCurrency} />
        <Text style={styles.label}>Amount *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Text style={styles.label}>Payment date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={paymentDate} onChangeText={setPaymentDate} />
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardTitle}>Down payment</Text>
            <Text style={styles.cardSub}>
              {customer?.hasBalance
                ? 'Leave off when recording a follow-up payment on an existing balance.'
                : 'Turn on for the first payment before goods are taken.'}
            </Text>
          </View>
          <Switch value={isDownPayment} onValueChange={setIsDownPayment} />
        </View>
        <Text style={styles.label}>Notes</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Optional" />
        <PrimaryButton title={saving ? 'Saving…' : 'Save payment'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
