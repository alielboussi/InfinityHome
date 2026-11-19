import { FlatList } from 'react-native';

/** FlatList tuned for delivery kiosk scroll + taps (same API as RN FlatList). */
export default function DeliveryKioskVirtualList(props) {
  return (
    <FlatList
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator
      {...props}
    />
  );
}