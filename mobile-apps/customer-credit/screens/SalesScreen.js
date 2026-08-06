import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { listAllSales } from '../db/repository';
import { colors, styles } from '../theme';
import { formatDate, formatMoney } from '../utils/format';

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
          placeholder="Search customer or product…"
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
                  <Text style={styles.cardTitle}>{item.product_name}</Text>
                  <Text style={styles.cardSub}>{item.customer_name}</Text>
                  {item.description ? <Text style={styles.cardSub} numberOfLines={2}>{item.description}</Text> : null}
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
