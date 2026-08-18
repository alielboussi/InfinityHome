import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CurrencyToggle, PrimaryButton, ScreenWrap } from '../components/ui';
import { addCustomerSale, listCustomers } from '../db/repository';
import { colors, styles } from '../theme';
import { DEFAULT_CURRENCY, formatAdvanceBalances, formatBalances, parseMoney } from '../utils/format';
import { todayIsoDate } from '../utils/ids';

export default function AddSaleScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const initialCustomerId = route.params?.customerId || '';
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [saleDate, setSaleDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const customerRows = await listCustomers();
      setCustomers(customerRows);
      if (!customerId && customerRows.length === 1) {
        setCustomerId(customerRows[0].id);
      }
    })();
  }, []);

  const onSave = async () => {
    if (!customerId) {
      Alert.alert('Customer required', 'Select a customer for this sale.');
      return;
    }

    setSaving(true);
    try {
      await addCustomerSale({
        customer_id: customerId,
        product_name: productName,
        description,
        unit_price: parseMoney(unitPrice),
        quantity: parseMoney(quantity) || 1,
        currency,
        sale_date: saleDate,
        notes,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to add sale.');
    } finally {
      setSaving(false);
    }
  };

  const selectedCustomer = customers.find((row) => row.id === customerId);

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Customer *</Text>
        {customers.length ? customers.map((customer) => (
          <Pressable
            key={customer.id}
            style={[
              styles.card,
              customerId === customer.id && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
            ]}
            onPress={() => setCustomerId(customer.id)}
          >
            <Text style={styles.cardTitle}>{customer.name}</Text>
            {customer.phone ? <Text style={styles.cardSub}>{customer.phone}</Text> : null}
            {customer.hasBalance ? (
              <Text style={{ marginTop: 6, fontWeight: '700', color: customer.overdue ? colors.danger : colors.primary }}>
                Balance due: {formatBalances(customer.balanceByCurrency)}
              </Text>
            ) : customer.hasAdvanceCredit ? (
              <Text style={{ marginTop: 6, fontWeight: '700', color: colors.success }}>
                Advance credit: {formatAdvanceBalances(customer.advanceCreditByCurrency)}
              </Text>
            ) : null}
          </Pressable>
        )) : (
          <Text style={styles.empty}>Add a customer first from the Customers tab.</Text>
        )}

        {selectedCustomer ? (
          <Text style={[styles.cardSub, { marginBottom: 12 }]}>
            {selectedCustomer.hasBalance
              ? `This sale will increase ${selectedCustomer.name}'s balance due of ${formatBalances(selectedCustomer.balanceByCurrency)}.`
              : selectedCustomer.hasAdvanceCredit
                ? `This sale will deduct from ${selectedCustomer.name}'s advance credit (${formatAdvanceBalances(selectedCustomer.advanceCreditByCurrency)}). Any excess becomes balance due.`
                : `Sale will be recorded for ${selectedCustomer.name}.`}
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Sale details</Text>
        <Text style={styles.label}>Product name (optional)</Text>
        <TextInput
          style={styles.input}
          value={productName}
          onChangeText={setProductName}
          placeholder="Leave blank if not applicable"
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={setDescription}
          placeholder="What was sold or taken (optional)"
          multiline
          textAlignVertical="top"
        />

        <CurrencyToggle value={currency} onChange={setCurrency} />

        <Text style={styles.label}>Unit price</Text>
        <TextInput style={styles.input} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
        <Text style={styles.label}>Quantity</Text>
        <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={saleDate} onChangeText={setSaleDate} />
        <Text style={styles.label}>Notes</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Optional" />

        <PrimaryButton title={saving ? 'Saving…' : 'Record sale'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
