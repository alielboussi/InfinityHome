import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { addCustomerSale, listProducts } from '../db/repository';
import { colors, styles } from '../theme';
import { formatMoney, parseMoney } from '../utils/format';
import { todayIsoDate } from '../utils/ids';

export default function AddSaleScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const customerId = route.params?.customerId;
  const [products, setProducts] = useState([]);
  const [productName, setProductName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [saleDate, setSaleDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await listProducts();
      setProducts(rows);
    })();
  }, []);

  const pickProduct = (product) => {
    setSelectedProductId(product.id);
    setProductName(product.name);
    setUnitPrice(String(product.price ?? ''));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await addCustomerSale({
        customer_id: customerId,
        product_id: selectedProductId,
        product_name: productName,
        unit_price: parseMoney(unitPrice),
        quantity: parseMoney(quantity) || 1,
        sale_date: saleDate,
        notes,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to add products.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
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
            <Text style={styles.cardSub}>{formatMoney(product.price, product.currency)}</Text>
          </Pressable>
        ))}

        <Text style={styles.label}>Product name *</Text>
        <TextInput style={styles.input} value={productName} onChangeText={setProductName} placeholder="Product name" />
        <Text style={styles.label}>Unit price</Text>
        <TextInput style={styles.input} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
        <Text style={styles.label}>Quantity</Text>
        <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={saleDate} onChangeText={setSaleDate} />
        <Text style={styles.label}>Notes</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Optional" />
        <PrimaryButton title={saving ? 'Saving…' : 'Add to customer'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
