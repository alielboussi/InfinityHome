import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../deliveryKit/components/ProductionKioskTopBar';
import { kiosk, KIOSK_ICON_BLUE } from '../deliveryKit/components/kioskStyles';
import { kioskFooterBottomPad } from '../deliveryKit/lib/kioskLayout';
import { useProductionDashboardTileLayout } from '../deliveryKit/lib/productionDashLayout';
import { useProductionKioskLocale } from '../deliveryKit/hooks/useProductionKioskLocale';
import { tUi } from '../deliveryKit/lib/productionKioskI18n';
import { isWorkshopOrDeliveryScreenAllowed } from '../shared/mobileAccessManifest';
import { theme } from '../shared/theme';

function DashboardTile({ icon, title, width, height, onPress }) {
  const iconSize = Math.round(Math.min(44, height * 0.32));
  return (
    <Pressable
      style={({ pressed }) => [
        kiosk.dashTile,
        kiosk.dashTileCard,
        { width, height },
        pressed && kiosk.dashTilePressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
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

  const allTiles = [
    {
      key: 'send',
      screenId: 'delivery_send_kitwe',
      icon: 'truck-delivery-outline',
      title: tUi('dashDelivery', locale),
      onPress: () => navigation.navigate('KitweSendHome'),
    },
    {
      key: 'sent',
      screenId: 'delivery_sent_list',
      icon: 'clipboard-text-clock-outline',
      title: tUi('dashSentDeliveries', locale),
      onPress: () => navigation.navigate('KitweSentDeliveries'),
    },
    {
      key: 'sold',
      screenId: 'delivery_sold_orders',
      icon: 'package-variant-closed',
      title: tUi('dashSold', locale),
      onPress: () => navigation.navigate('SoldOrders'),
    },
  ];

  const tiles = grant
    ? allTiles.filter((t) => isWorkshopOrDeliveryScreenAllowed(grant, t.screenId, 'warehouse_delivery_app'))
    : allTiles;
  const tileCount = Math.max(1, tiles.length);
  const {
    tileWidth, tileHeight, gap, contentWidth,
  } = useProductionDashboardTileLayout(tileCount);

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
          title={tUi('dashDeliveryAppTitle', ready ? locale : 'en')}
          locale={ready ? locale : 'en'}
          onToggleLocale={toggleLocale}
        />
        <Text style={[kiosk.noticeErr, { textAlign: 'center' }]}>{tUi('accessDenied', ready ? locale : 'ar')}</Text>
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
        title={tUi('dashDeliveryAppTitle', locale)}
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
            {
              gap,
              width: contentWidth,
              paddingHorizontal: 0,
              marginTop: 8,
            },
          ]}
        >
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gridScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  gridArea: {
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },
  user: { color: theme.textMuted, marginBottom: 4, fontSize: 15, fontWeight: '500' },
  hint: { color: theme.textMuted, marginTop: 10, fontSize: 13, lineHeight: 18 },
});
