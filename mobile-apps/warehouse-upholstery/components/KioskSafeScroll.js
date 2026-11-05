import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kiosk } from './kioskStyles';
import { kioskFooterBottomPad } from '../lib/kioskLayout';

/**
 * Scrollable kiosk page with bottom padding above Samsung / Android nav bar.
 */
export default function KioskSafeScroll({
  children,
  contentContainerStyle,
  extraBottom = 8,
  keyboardShouldPersistTaps = 'handled',
  ...rest
}) {
  const insets = useSafeAreaInsets();
  const flat = StyleSheet.flatten(contentContainerStyle) || {};
  const userBottom = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : 0;
  const paddingBottom = kioskFooterBottomPad(insets) + extraBottom + userBottom;

  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={[
        kiosk.screen,
        { paddingTop: (insets.top ?? 0) + 8 },
        contentContainerStyle,
        { paddingBottom },
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
