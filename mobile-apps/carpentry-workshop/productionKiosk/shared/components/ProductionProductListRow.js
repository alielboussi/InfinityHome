import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import ProductionProductImagePreviewModal from './ProductionProductImagePreviewModal';

/** Pressable wrapper styles for a full-width list row (add marginBottom via listGap). */
export function productionProductRowPressableStyle(listGap = 12) {
  return {
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      minHeight: 88,
      marginBottom: listGap,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    rowPressed: { opacity: 0.92, borderColor: theme.primary },
    rowBusy: { opacity: 0.65 },
  };
}

export const productionProductRowStyles = StyleSheet.create({
  thumb: {
    width: 72,
    height: 72,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.surface,
  },
  thumbHit: {
    borderRadius: theme.radiusSm,
  },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 17, fontWeight: '800', color: theme.text, lineHeight: 22 },
  sku: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
  subtitle: { fontSize: 14, fontWeight: '700', color: theme.primary, marginTop: 4 },
  spinner: { position: 'absolute', right: 36 },
});

/** Thumbnail + text + chevron fragments (parent must use flexDirection: 'row'). */
export default function ProductionProductListRow({
  imageUrl,
  name,
  sku = '',
  subtitle = '',
  busy = false,
  showChevron = true,
  enableImagePreview = true,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const label = String(name || 'Product').trim();

  const openPreview = () => {
    if (!enableImagePreview || !imageUrl || busy) return;
    setPreviewOpen(true);
  };

  return (
    <>
      {imageUrl ? (
        <TouchableOpacity
          style={productionProductRowStyles.thumbHit}
          onPress={openPreview}
          activeOpacity={0.85}
          disabled={!enableImagePreview || busy}
          accessibilityRole="button"
          accessibilityLabel={`View enlarged photo for ${label}`}
        >
          <Image source={{ uri: imageUrl }} style={productionProductRowStyles.thumb} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <View style={productionProductRowStyles.thumbPlaceholder}>
          <MaterialCommunityIcons name="image-off-outline" size={28} color={theme.textMuted} />
        </View>
      )}
      <View style={productionProductRowStyles.body}>
        <Text style={productionProductRowStyles.name} numberOfLines={2}>{name || '—'}</Text>
        {String(sku || '').trim() ? (
          <Text style={productionProductRowStyles.sku} numberOfLines={1}>{sku}</Text>
        ) : null}
        {subtitle ? (
          <Text style={productionProductRowStyles.subtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {showChevron ? (
        <MaterialCommunityIcons name="chevron-right" size={26} color={theme.textMuted} />
      ) : null}
      {busy ? (
        <ActivityIndicator color={theme.primary} size="small" style={productionProductRowStyles.spinner} />
      ) : null}
      <ProductionProductImagePreviewModal
        visible={previewOpen}
        imageUrl={imageUrl}
        title={label}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
