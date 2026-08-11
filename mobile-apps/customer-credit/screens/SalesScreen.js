import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { listAllSales } from '../db/repository';
import { colors, styles } from '../theme';
import { formatDate, formatMoney, formatSaleTitle } from '../utils/format';

export default function SalesScreen() {
  const navigation = useNavigation();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await listAllSales({ search });
      setRows(data);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to load sales.');
    }
  }, [search]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  return (
    <ScreenWrap>
      <View style={[styles.content, { flex: 1, paddingBottom: 0 }]}>
        <PrimaryButton title="New sale" onPress={() => navigation.navigate('AddSale')} />
        <TextInput
          style={styles.input}
          placeholder="Search customer, product, or description…"
          value={search}
          onChangeText={setSearch}
        />
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(item) => `${item.customer_id}-${item.id}`}
          ListEmptyComponent={<Text style={styles.empty}>No sales recorded yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('CustomerDetail', { customerId: item.customer_id })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{formatSaleTitle(item)}</Text>
                  <Text style={styles.cardSub}>{item.customer_name}</Text>
                  {item.product_name && item.description ? (
                    <Text style={[styles.cardSub, { marginTop: 4 }]} numberOfLines={3}>{item.description}</Text>
                  ) : null}
                  {item.notes ? (
                    <Text style={[styles.cardSub, { fontStyle: 'italic' }]} numberOfLines={2}>Note: {item.notes}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '800', color: colors.primary }}>
                    {formatMoney(item.line_total, item.currency)}
                  </Text>
                  <Text style={styles.cardSub}>{formatDate(item.sale_date)}</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      </View>
    </ScreenWrap>
  );
}
