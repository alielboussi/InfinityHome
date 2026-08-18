import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { listCustomers } from '../db/repository';
import { colors, styles } from '../theme';
import { formatAdvanceBalances, formatBalances } from '../utils/format';

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

  const openAdvance = (customer) => {
    if (customer.hasBalance) {
      Alert.alert(
        'Balance due',
        `${customer.name} has an outstanding balance of ${formatBalances(customer.balanceByCurrency)}. Clear it before adding a new advance.`,
      );
      return;
    }
    navigation.navigate('AddAdvance', { customerId: customer.id });
  };

  const onLongPressCustomer = (customer) => {
    const options = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add advance paid amount',
        onPress: () => openAdvance(customer),
      },
      {
        text: 'View customer',
        onPress: () => navigation.navigate('CustomerDetail', { customerId: customer.id }),
      },
    ];
    Alert.alert(customer.name, 'Choose an action', options);
  };

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
              onLongPress={() => onLongPressCustomer(item)}
              delayLongPress={400}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.phone ? <Text style={styles.cardSub}>{item.phone}</Text> : null}
              {item.hasAdvanceCredit ? (
                <Text style={{ marginTop: 6, fontWeight: '700', color: colors.success }}>
                  Advance credit: {formatAdvanceBalances(item.advanceCreditByCurrency)}
                </Text>
              ) : null}
              {item.hasBalance ? (
                <Text style={{ marginTop: 6, fontWeight: '700', color: item.overdue ? colors.danger : colors.primary }}>
                  Balance due: {formatBalances(item.balanceByCurrency)}
                </Text>
              ) : !item.hasAdvanceCredit ? (
                <Text style={[styles.cardSub, { marginTop: 6 }]}>Settled · long-press for advance</Text>
              ) : null}
            </Pressable>
          )}
        />
      </View>
    </ScreenWrap>
  );
}
