import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kiosk } from './kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';

/**
 * Scrollable kiosk page with bottom padding above Samsung / Android nav bar.
 */
export default function KioskSafeScroll({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  ...rest
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={[
        kiosk.screen,
        kioskScreenEdgesSafe(insets, 8),
        contentContainerStyle,
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
