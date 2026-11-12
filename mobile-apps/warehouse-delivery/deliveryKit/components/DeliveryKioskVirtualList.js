import { FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';
import {
  KIOSK_SCROLL_EXTRA_BOTTOM,
  kioskContentStyleWithoutBottom,
  kioskScrollPaddingBottom,
} from '../lib/kioskLayout';
import { DELIVERY_LIST_PERF } from '../lib/deliveryListPerf';

/**
 * Primary scroll for delivery picker pages — virtualized list + kiosk chrome padding.
 */
export default function DeliveryKioskVirtualList({
  data,
  renderItem,
  keyExtractor,
  numColumns = 1,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  columnWrapperStyle,
  contentContainerStyle,
  extraBottom = KIOSK_SCROLL_EXTRA_BOTTOM,
  extraData,
  keyboardShouldPersistTaps = 'handled',
  style,
  ...rest
}) {
  const insets = useSafeAreaInsets();
  const flat = StyleSheet.flatten(contentContainerStyle) || {};
  const userBottom = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : 0;
  const paddingBottom = kioskScrollPaddingBottom(insets, extraBottom, userBottom);
  const contentRest = kioskContentStyleWithoutBottom(contentContainerStyle);

  return (
    <FlatList
      style={[{ flex: 1, backgroundColor: theme.bg }, style]}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={numColumns}
      key={numColumns > 1 ? `delivery-cols-${numColumns}` : 'delivery-cols-1'}
      columnWrapperStyle={numColumns > 1 ? columnWrapperStyle : undefined}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      extraData={extraData}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      automaticallyAdjustKeyboardInsets
      nestedScrollEnabled
      overScrollMode="always"
      decelerationRate="normal"
      contentContainerStyle={[
        kiosk.screen,
        { paddingTop: (insets.top ?? 0) + 8, paddingBottom },
        contentRest,
      ]}
      {...DELIVERY_LIST_PERF}
      {...rest}
    />
  );
}
