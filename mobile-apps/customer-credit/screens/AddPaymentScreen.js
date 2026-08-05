import { useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { addPayment } from '../db/repository';
import { styles } from '../theme';
import { parseMoney } from '../utils/format';
import { todayIsoDate } from '../utils/ids';

export default function AddPaymentScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const customerId = route.params?.customerId;
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [isDownPayment, setIsDownPayment] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      await addPayment({
        customer_id: customerId,
        amount: parseMoney(amount),
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
        <Text style={styles.label}>Amount (K) *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Text style={styles.label}>Payment date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={paymentDate} onChangeText={setPaymentDate} />
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={styles.cardTitle}>Down payment</Text>
          <Switch value={isDownPayment} onValueChange={setIsDownPayment} />
        </View>
        <Text style={styles.label}>Notes</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Optional" />
        <PrimaryButton title={saving ? 'Saving…' : 'Save payment'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
