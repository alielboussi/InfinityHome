import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CurrencyToggle, HorizontalMoneyRow, PrimaryButton, ScreenWrap } from '../components/ui';
import { addAdvancePayment, getCustomer } from '../db/repository';
import { colors, styles } from '../theme';
import { DEFAULT_CURRENCY, formatAdvanceBalances, formatBalances, parseMoney } from '../utils/format';
import { todayIsoDate } from '../utils/ids';

export default function AddAdvanceScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const customerId = route.params?.customerId;
  const [customer, setCustomer] = useState(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      const row = await getCustomer(customerId);
      setCustomer(row);
      if (row?.hasBalance) {
        Alert.alert(
          'Balance due',
          'This customer already owes money. Clear the balance before adding a new advance.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
    })();
  }, [customerId, navigation]);

  const onSave = async () => {
    const parsedAmount = parseMoney(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Amount required', 'Enter an advance amount greater than zero.');
      return;
    }
    if (!customerId) {
      Alert.alert('Customer required', 'Open this screen from a customer record.');
      return;
    }

    setSaving(true);
    try {
      await addAdvancePayment({
        customer_id: customerId,
        amount: parsedAmount,
        currency,
        payment_date: paymentDate,
        notes: notes || 'Advance paid amount',
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to record advance payment.');
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
            {customer.hasAdvanceCredit ? (
              <Text style={[styles.cardSub, { marginTop: 6, color: colors.success, fontWeight: '700' }]}>
                Current advance credit: {formatAdvanceBalances(customer.advanceCreditByCurrency)}
              </Text>
            ) : (
              <Text style={styles.cardSub}>No advance credit on file yet.</Text>
            )}
            {customer.hasBalance ? (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.cardSub, { color: colors.danger, fontWeight: '700' }]}>Balance due</Text>
                <HorizontalMoneyRow
                  balanceByCurrency={customer.balanceByCurrency}
                  amountStyle={{ fontSize: 18, fontWeight: '800', color: colors.danger }}
                  dividerColor="#f5c2c2"
                />
              </View>
            ) : (
              <Text style={[styles.cardSub, { marginTop: 8 }]}>
                Sales will deduct from this advance first. Any amount above the advance becomes balance due.
              </Text>
            )}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Advance paid amount</Text>
        <CurrencyToggle value={currency} onChange={setCurrency} />
        <Text style={styles.label}>Amount *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={paymentDate} onChangeText={setPaymentDate} />
        <Text style={styles.label}>Notes</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Optional" />
        <PrimaryButton title={saving ? 'Saving…' : 'Save advance'} onPress={onSave} disabled={saving || customer?.hasBalance} />
      </ScrollView>
    </ScreenWrap>
  );
}
