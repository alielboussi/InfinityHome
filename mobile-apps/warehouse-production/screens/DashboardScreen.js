import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskFooterBottomPad } from '../lib/kioskLayout';
import { useProductionDashboardTileLayout } from '../lib/productionDashLayout';
import { theme } from '../shared/theme';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { isWarehouseProductionKitweDeliveryAllowed } from '../shared/mobileAccessManifest';
import { tUi } from '../lib/productionKioskI18n';

function DashboardTile({ icon, title, width, height, onPress }) {
  const iconSize = Math.round(Math.min(40, height * 0.28));
  const compact = height < 100;
  return (
    <Pressable
      style={({ pressed }) => [
        kiosk.dashTile,
        compact && kiosk.dashTileCompact,
        { width, height },
        pressed && kiosk.dashTilePressed,
      ]}
      onPress={onPress}
    >
      <MaterialCommunityIcons
        name={icon}
        size={iconSize}
        color={theme.primaryDark || '#0369a1'}
        style={[kiosk.dashTileIcon, compact && { marginBottom: 4 }]}
      />
      <Text
        style={[kiosk.dashBtnText, compact && kiosk.dashBtnTextCompact]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default function DashboardScreen({
  navigation,
  grant,
  userDisplayName,
  userEmail,
  allowed,
  onRefreshAccess,
  accessHint,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, ready } = useProductionKioskLocale();
  const canSendDelivery = grant && isWarehouseProductionKitweDeliveryAllowed(grant);
  const tileCount = canSendDelivery ? 3 : 2;
  const { tileWidth, tileHeight, gap } = useProductionDashboardTileLayout(tileCount);

  const tiles = [
    {
      key: 'create',
      icon: 'sofa-outline',
      title: tUi('dashCreate', locale),
      onPress: () => navigation.navigate('Create'),
    },
    {
      key: 'stock',
      icon: 'package-variant-closed-plus',
      title: tUi('dashStock', locale),
      onPress: () => navigation.navigate('Stock'),
    },
    ...(canSendDelivery ? [{
      key: 'delivery',
      icon: 'truck-delivery-outline',
      title: tUi('dashDelivery', locale),
      onPress: () => navigation.navigate('KitweSendHome'),
    }] : []),
  ];

  if (!allowed) {
    return (
      <View style={[
        kiosk.screen,
        styles.root,
        {
          paddingTop: insets.top + 16,
          paddingBottom: kioskFooterBottomPad(insets) + 16,
          paddingHorizontal: 20,
        },
      ]}
      >
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', ready ? locale : 'ar')}</Text>
        {userEmail ? (
          <Text style={[styles.user, { textAlign: 'center', marginTop: 12 }]}>Signed in as {userEmail}</Text>
        ) : (
          <Text style={[styles.user, { textAlign: 'center', marginTop: 12 }]}>Not signed in</Text>
        )}
        {accessHint ? (
          <Text style={[styles.hint, { textAlign: 'center' }]}>{accessHint}</Text>
        ) : null}
        {typeof onRefreshAccess === 'function' ? (
          <Pressable style={[kiosk.btn, { marginTop: 16 }]} onPress={() => onRefreshAccess()}>
            <Text style={kiosk.btnText}>{tUi('retryAccess', ready ? locale : 'en')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        kiosk.screen,
        styles.root,
        {
          paddingTop: insets.top + 8,
          paddingBottom: kioskFooterBottomPad(insets) + 8,
        },
      ]}
    >
      <ProductionKioskTopBar
        title={tUi('dashTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      {(userDisplayName || userEmail) ? (
        <Text style={[styles.user, { textAlign: 'center' }]} numberOfLines={1}>
          {userDisplayName || userEmail}
        </Text>
      ) : null}

      <View style={[styles.gridArea, { gap }]}>
        {tiles.map((tile) => (
          <DashboardTile
            key={tile.key}
            icon={tile.icon}
            title={tile.title}
            width={tileWidth}
            height={tileHeight}
            onPress={tile.onPress}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gridArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  user: { color: theme.textMuted, marginBottom: 4, fontSize: 15, fontWeight: '500' },
  hint: { color: theme.textMuted, marginTop: 10, fontSize: 13, lineHeight: 18 },
});
