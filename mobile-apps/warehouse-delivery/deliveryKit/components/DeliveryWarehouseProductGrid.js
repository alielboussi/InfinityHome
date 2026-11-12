import React, { useCallback, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../shared/theme';
import DeliveryKioskVirtualList from './DeliveryKioskVirtualList';

function defaultImageUrl(item) {
  const direct = String(
    item?.floor2_image_url
    || item?.image_url
    || item?.metadata?.warehouse_floor2_wip_image_url
    || item?.metadata?.floor2_wip_image_url
    || '',
  ).trim();
  return direct || '';
}

export const DeliveryWarehouseGridCard = React.memo(function DeliveryWarehouseGridCard({
  item,
  selected,
  onSelect,
  getImageUrl,
  getQtyLabel,
}) {
  const name = String(item?.name || '—').trim();
  const sku = String(item?.family_sku || item?.sku || '').trim();
  const imageUrl = getImageUrl(item);
  const qtyLine = typeof getQtyLabel === 'function' ? getQtyLabel(item) : '';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.gridCard,
        selected && styles.gridCardSelected,
        pressed && styles.gridCardPressed,
      ]}
      onPress={() => onSelect?.(item)}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      <View style={styles.thumbWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.thumb}
            resizeMode="contain"
            fadeDuration={0}
          />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <MaterialCommunityIcons name="sofa-outline" size={32} color={theme.textMuted} />
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{name}</Text>
      {sku ? <Text style={styles.cardSku} numberOfLines={1}>{sku}</Text> : null}
      {qtyLine ? (
        <Text style={styles.qtyFooter} numberOfLines={1}>{qtyLine}</Text>
      ) : null}
    </Pressable>
  );
});

export function deliveryWarehouseGridKey(item) {
  return String(item?.assembly_id || item?.id || '');
}

/**
 * Virtualized 2-column picker (single FlatList scroll — use with ListHeader/Footer on parent).
 */
export function DeliveryWarehouseVirtualGrid({
  items,
  selectedId = '',
  onSelect,
  getImageUrl = defaultImageUrl,
  getQtyLabel,
  ListHeaderComponent,
  ListFooterComponent,
  contentContainerStyle,
  emptyComponent = null,
}) {
  const data = useMemo(
    () => (Array.isArray(items) ? items : []),
    [items],
  );

  const renderItem = useCallback(({ item }) => {
    const id = deliveryWarehouseGridKey(item);
    const selected = selectedId && id === String(selectedId);
    return (
      <DeliveryWarehouseGridCard
        item={item}
        selected={selected}
        onSelect={onSelect}
        getImageUrl={getImageUrl}
        getQtyLabel={getQtyLabel}
      />
    );
  }, [getImageUrl, getQtyLabel, onSelect, selectedId]);

  const keyExtractor = useCallback((item) => deliveryWarehouseGridKey(item), []);

  return (
    <DeliveryKioskVirtualList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={data.length ? null : emptyComponent}
      extraData={selectedId}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

export default DeliveryWarehouseVirtualGrid;

const styles = StyleSheet.create({
  gridRow: { gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  gridCard: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: '48%',
    maxWidth: '48%',
    minWidth: 0,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    padding: 8,
    paddingBottom: 6,
  },
  gridCardSelected: {
    borderColor: theme.primary,
    borderWidth: 2,
  },
  gridCardPressed: { opacity: 0.92 },
  thumbWrap: { marginBottom: 6 },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  thumbPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
    lineHeight: 18,
  },
  cardSku: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    marginTop: 2,
  },
  qtyFooter: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    fontSize: 13,
    fontWeight: '700',
    color: theme.primary,
    textAlign: 'center',
  },
});
