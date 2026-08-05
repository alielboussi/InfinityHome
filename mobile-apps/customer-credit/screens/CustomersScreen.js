import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { listCustomers } from '../db/repository';
import { colors, styles } from '../theme';
import { formatMoney } from '../utils/format';

export default function CustomersScreen() {
  const navigation = useNavigation();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await listCustomers({ search });
      setRows(data);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to load customers.');
    }
  }, [search]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  return (
    <ScreenWrap>
      <View style={[styles.content, { flex: 1, paddingBottom: 0 }]}>
        <PrimaryButton title="Add customer" onPress={() => navigation.navigate('CustomerForm')} />
        <TextInput
          style={styles.input}
          placeholder="Search name or phone…"
          value={search}
          onChangeText={setSearch}
        />
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No customers yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.phone ? <Text style={styles.cardSub}>{item.phone}</Text> : null}
              <Text style={{ marginTop: 6, fontWeight: '700', color: item.overdue ? colors.danger : colors.primary }}>
                Balance: {formatMoney(item.balance)}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </ScreenWrap>
  );
}
