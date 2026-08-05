import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { DEFAULT_PAYMENT_DEADLINE_DAYS } from '../db/constants';
import { getCustomer, saveCustomer } from '../db/repository';
import { styles } from '../theme';

export default function CustomerFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const customerId = route.params?.customerId;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState(String(DEFAULT_PAYMENT_DEADLINE_DAYS));
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
        <PrimaryButton title={saving ? 'Saving…' : 'Save customer'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
