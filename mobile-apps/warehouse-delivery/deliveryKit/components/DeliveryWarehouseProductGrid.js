import { useCallback } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../shared/theme';

export function deliveryWarehouseGridKey(item) {
  return String(item?.assembly_id || item?.id || item?.name || 'row');
}

export function DeliveryWarehouseGridCard({
  item,
  selected = false,
  disabled = false,
  onSelect,
  getImageUrl,
  getQtyLabel,
  getSku,
}) {
  const id = deliveryWarehouseGridKey(item);
  const name = String(item?.name || item?.assembly_name || id);
  const imageUrl = typeof getImageUrl === 'function' ? getImageUrl(item) : '';
  const qtyText = typeof getQtyLabel === 'function'
    ? getQtyLabel(item)
    : '';
  const sku = typeof getSku === 'function' ? getSku(item) : '';

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        if (typeof onSelect === 'function') onSelect(item);
      }}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        pressed && !disabled && styles.cardPressed,
      ]}
    >
      <View style={styles.photoWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.photo} resizeMode="contain" />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name="image-off-outline" size={36} color={theme.textMuted} />
          </View>
        )}
        {qtyText ? (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyText} numberOfLines={2}>{qtyText}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      {sku ? <Text style={styles.sku} numberOfLines={1}>{sku}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  cardSelected: { borderColor: '#047857', borderWidth: 2 },
  cardDisabled: { opacity: 0.45 },
  cardPressed: { opacity: 0.92 },
  photoWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  photo: { width: '100%', height: '100%', backgroundColor: '#ffffff' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  qtyBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    maxWidth: '90%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(4, 120, 87, 0.92)',
  },
  qtyText: { color: '#ffffff', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  name: {
    paddingHorizontal: 10,
    paddingTop: 8,
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
    lineHeight: 18,
  },
  sku: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  row: { gap: 10, marginBottom: 10, alignItems: 'flex-start' },
});

export default function DeliveryWarehouseProductGrid({
  items = [],
  selectedId = '',
  onSelect,
  getImageUrl,
  getQtyLabel,
  getSku,
  isItemDisabled,
  extraData,
  ListHeaderComponent,
  ListFooterComponent,
  contentContainerStyle,
}) {
  const renderItem = useCallback(({ item }) => {
    const key = deliveryWarehouseGridKey(item);
    const selected = selectedId && key === String(selectedId);
    const disabled = typeof isItemDisabled === 'function' ? isItemDisabled(item) : false;
    return (
      <DeliveryWarehouseGridCard
        item={item}
        selected={selected}
        disabled={disabled}
        onSelect={onSelect}
        getImageUrl={getImageUrl}
        getQtyLabel={getQtyLabel}
        getSku={getSku}
      />
    );
  }, [getImageUrl, getQtyLabel, getSku, isItemDisabled, onSelect, selectedId]);

  return (
    <FlatList
      data={items}
      keyExtractor={deliveryWarehouseGridKey}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.row}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={contentContainerStyle}
      extraData={extraData ?? selectedId}
    />
  );
}