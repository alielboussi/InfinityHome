import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CurrencyToggle, PrimaryButton, ScreenWrap } from '../components/ui';
import { DEFAULT_PAYMENT_DEADLINE_DAYS } from '../db/constants';
import { addAdvancePayment, getCustomer, saveCustomer } from '../db/repository';
import { styles } from '../theme';
import { DEFAULT_CURRENCY, parseMoney } from '../utils/format';

export default function CustomerFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const customerId = route.params?.customerId;
  const isNew = !customerId;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState(String(DEFAULT_PAYMENT_DEADLINE_DAYS));
  const [includeAdvance, setIncludeAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceCurrency, setAdvanceCurrency] = useState(DEFAULT_CURRENCY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      const row = await getCustomer(customerId);
      if (!row) return;
      setName(row.name || '');
      setPhone(row.phone || '');
      setAddress(row.address || '');
      setNotes(row.notes || '');
      setPaymentDeadlineDays(String(row.payment_deadline_days || DEFAULT_PAYMENT_DEADLINE_DAYS));
    })();
  }, [customerId]);

  const onSave = async () => {
    setSaving(true);
    try {
      const saved = await saveCustomer({
        id: customerId,
        name,
        phone,
        address,
        notes,
        payment_deadline_days: paymentDeadlineDays,
      });

      if (isNew && includeAdvance) {
        const amount = parseMoney(advanceAmount);
        if (amount > 0) {
          await addAdvancePayment({
            customer_id: saved.id,
            amount,
            currency: advanceCurrency,
            notes: 'Advance paid amount',
          });
        }
      }

      navigation.replace('CustomerDetail', { customerId: saved.id });
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Customer name" />
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" keyboardType="phone-pad" />
        <Text style={styles.label}>Address</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Address" />
        <Text style={styles.label}>Payment deadline (days)</Text>
        <TextInput
          style={styles.input}
          value={paymentDeadlineDays}
          onChangeText={setPaymentDeadlineDays}
          placeholder="45"
          keyboardType="number-pad"
        />
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          multiline
        />

        {isNew ? (
          <View style={[styles.card, { marginBottom: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Advance paid amount</Text>
                <Text style={styles.cardSub}>
                  Optional prepaid credit. Goods taken later will deduct from this amount first.
                </Text>
              </View>
              <Switch value={includeAdvance} onValueChange={setIncludeAdvance} />
            </View>
            {includeAdvance ? (
              <View style={{ marginTop: 12 }}>
                <CurrencyToggle value={advanceCurrency} onChange={setAdvanceCurrency} />
                <Text style={styles.label}>Advance amount</Text>
                <TextInput
                  style={styles.input}
                  value={advanceAmount}
                  onChangeText={setAdvanceAmount}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 20000"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        <PrimaryButton title={saving ? 'Saving…' : 'Save customer'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
