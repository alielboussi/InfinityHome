import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { deleteProduct, listProducts } from '../db/repository';
import { colors, styles } from '../theme';
import { formatMoney } from '../utils/format';

export default function ProductsScreen() {
  const navigation = useNavigation();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await listProducts({ search });
      setRows(data);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to load products.');
    }
  }, [search]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onDelete = (product) => {
    Alert.alert('Delete product', `Remove "${product.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteProduct(product.id);
          await load();
        },
      },
    ]);
  };

  return (
    <ScreenWrap>
      <View style={[styles.content, { flex: 1, paddingBottom: 0 }]}>
        <PrimaryButton title="Add product" onPress={() => navigation.navigate('ProductForm')} />
        <TextInput
          style={styles.input}
          placeholder="Search products…"
          value={search}
          onChangeText={setSearch}
        />
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No products yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('ProductForm', { productId: item.id })}
              onLongPress={() => onDelete(item)}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={{ marginTop: 6, fontWeight: '700', color: colors.primary }}>
                {formatMoney(item.price, item.currency)}
              </Text>
              <Text style={styles.cardSub}>Long-press to delete</Text>
            </Pressable>
          )}
        />
      </View>
    </ScreenWrap>
  );
}
