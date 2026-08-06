import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CurrencyToggle, PrimaryButton, ScreenWrap } from '../components/ui';
import { addCustomerSale, listCustomers, listProducts, saveProduct } from '../db/repository';
import { colors, styles } from '../theme';
import { DEFAULT_CURRENCY, formatMoney, normalizeCurrency, parseMoney } from '../utils/format';
import { todayIsoDate } from '../utils/ids';

export default function AddSaleScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const initialCustomerId = route.params?.customerId || '';
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [products, setProducts] = useState([]);
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [saleDate, setSaleDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [customerRows, productRows] = await Promise.all([
        listCustomers(),
        listProducts(),
      ]);
      setCustomers(customerRows);
      setProducts(productRows);
      if (!customerId && customerRows.length === 1) {
        setCustomerId(customerRows[0].id);
      }
    })();
  }, []);

  const pickProduct = (product) => {
    setSelectedProductId(product.id);
    setProductName(product.name);
    setDescription(product.description || '');
    setUnitPrice(String(product.price ?? ''));
    setCurrency(normalizeCurrency(product.currency));
    setSaveToCatalog(false);
  };

  const onSave = async () => {
    if (!customerId) {
      Alert.alert('Customer required', 'Select a customer for this sale.');
      return;
    }

    setSaving(true);
    try {
      let productId = selectedProductId;
      if (saveToCatalog && !productId) {
        const saved = await saveProduct({
          name: productName,
          description,
          price: parseMoney(unitPrice),
          currency,
        });
        productId = saved.id;
      }

      await addCustomerSale({
        customer_id: customerId,
        product_id: productId,
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
          </Pressable>
        )) : (
          <Text style={styles.empty}>Add a customer first from the Customers tab.</Text>
        )}

        {selectedCustomer ? (
          <Text style={[styles.cardSub, { marginBottom: 12 }]}>
            Sale will be recorded for {selectedCustomer.name}.
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Pick from catalog (optional)</Text>
        {products.map((product) => (
          <Pressable
            key={product.id}
            style={[
              styles.card,
              selectedProductId === product.id && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
            ]}
            onPress={() => pickProduct(product)}
          >
            <Text style={styles.cardTitle}>{product.name}</Text>
            {product.description ? <Text style={styles.cardSub} numberOfLines={2}>{product.description}</Text> : null}
            <Text style={styles.cardSub}>{formatMoney(product.price, product.currency)}</Text>
          </Pressable>
        ))}

        <Text style={styles.label}>Product name *</Text>
        <TextInput style={styles.input} value={productName} onChangeText={setProductName} placeholder="Product name" />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={setDescription}
          placeholder="Product description (like quotation)"
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

        {!selectedProductId ? (
          <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardTitle}>Save to product catalog</Text>
              <Text style={styles.cardSub}>Creates a reusable product for future sales.</Text>
            </View>
            <Switch value={saveToCatalog} onValueChange={setSaveToCatalog} />
          </View>
        ) : null}

        <PrimaryButton title={saving ? 'Saving…' : 'Record sale'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
