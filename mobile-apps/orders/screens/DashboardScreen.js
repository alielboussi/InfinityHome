import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk, KIOSK_ICON_BLUE } from '../components/kioskStyles';
import { kioskFooterBottomPad } from '../lib/kioskLayout';
import { useProductionDashboardTileLayout } from '../lib/productionDashLayout';
import { theme } from '../shared/theme';
import { isWorkshopOrDeliveryScreenAllowed } from '../shared/mobileAccessManifest';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import ProductionPressableHint from '../lib/ProductionPressableHint';

function DashboardTile({
  icon, title, width, height, onPress, locale, textAlign,
}) {
  const iconSize = Math.round(Math.min(44, height * 0.32));
  return (
    <ProductionPressableHint
      locale={locale}
      textAlign={textAlign}
      onPress={onPress}
      style={({ pressed }) => [
        kiosk.dashTile,
        kiosk.dashTileCard,
        { width, height },
        pressed && kiosk.dashTilePressed,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={iconSize}
        color={KIOSK_ICON_BLUE}
        style={kiosk.dashTileIcon}
      />
      <Text
        style={kiosk.dashBtnText}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {title}
      </Text>
    </ProductionPressableHint>
  );
}

export default function DashboardScreen({
  navigation,
  grant,
  userDisplayName,
  userEmail,
  allowed,
  fullAccess,
  onRefreshAccess,
  accessHint,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, ready, textAlign } = useProductionKioskLocale();

  const allTiles = [
    { key: 'customers', screenId: 'orders_customers', icon: 'account-group', title: tUi('tileCustomers', locale), onPress: () => navigation.navigate('Customers') },
    { key: 'products', screenId: 'orders_products', icon: 'cube-outline', title: tUi('tileProducts', locale), onPress: () => navigation.navigate('Products') },
    { key: 'new', screenId: 'orders_new_order', icon: 'plus-box-outline', title: tUi('tileNewOrder', locale), onPress: () => navigation.navigate('NewOrder') },
    { key: 'orders', screenId: 'orders_list', icon: 'clipboard-text-outline', title: tUi('tileOrders', locale), onPress: () => navigation.navigate('Orders') },
    { key: 'deliveries', screenId: 'orders_deliveries', icon: 'truck-delivery-outline', title: tUi('tileDeliveries', locale), onPress: () => navigation.navigate('Deliveries') },
    { key: 'repairs', screenId: 'orders_repairs', icon: 'wrench-clock', title: tUi('tileRepairs', locale), onPress: () => navigation.navigate('Repairs') },
    { key: 'storage', screenId: 'orders_storage', icon: 'warehouse', title: tUi('tileStorage', locale), onPress: () => navigation.navigate('Storage') },
    { key: 'tracking', screenId: 'orders_tracking', icon: 'map-marker-path', title: tUi('tileTracking', locale), onPress: () => navigation.navigate('Tracking') },
  ];

  const tiles = (fullAccess || !grant)
    ? allTiles
    : allTiles.filter((t) => isWorkshopOrDeliveryScreenAllowed(grant, t.screenId, 'orders_app'));
  const {
    tileWidth, tileHeight, gap, contentWidth,
  } = useProductionDashboardTileLayout(Math.max(1, tiles.length));

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
        <ProductionKioskTopBar
          title={tUi('dashTitle', ready ? locale : 'en')}
          locale={ready ? locale : 'en'}
          onToggleLocale={toggleLocale}
        />
        <Text style={[kiosk.noticeErr, { textAlign: 'center' }]}>{tUi('accessDenied', ready ? locale : 'en')}</Text>
        {userEmail ? (
          <Text style={[styles.user, { textAlign: 'center', marginTop: 12 }]}>Signed in as {userEmail}</Text>
        ) : null}
        {accessHint ? <Text style={[styles.hint, { textAlign: 'center' }]}>{accessHint}</Text> : null}
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
      <ScrollView
        contentContainerStyle={styles.gridScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            kiosk.dashGrid,
            styles.gridArea,
            { gap, width: contentWidth, paddingHorizontal: 0, marginTop: 12 },
          ]}
        >
          {tiles.map((tile) => (
            <DashboardTile
              key={tile.key}
              icon={tile.icon}
              title={tile.title}
              locale={locale}
              textAlign={textAlign}
              width={tileWidth}
              height={tileHeight}
              onPress={tile.onPress}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gridScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  gridArea: {
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },
  user: { color: theme.textMuted, marginBottom: 4, fontSize: 15, fontWeight: '500' },
  hint: { color: theme.textMuted, marginTop: 10, fontSize: 13, lineHeight: 18 },
});
