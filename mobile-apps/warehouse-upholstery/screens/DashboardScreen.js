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
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { useDashboardNotificationBadges } from '../shared/hooks/useDashboardNotificationBadges';
import DashboardTileBadge from '../shared/components/DashboardTileBadge';
import {
  UPHOLSTERY_ORDERS_HUB_SCREEN_IDS,
  isWorkshopOrdersHubAllowed,
  sumDashboardBadgeCounts,
} from '../shared/lib/workshopOrdersHubAccess';

function DashboardTile({
  icon, title, width, height, onPress, badgeCount = 0,
}) {
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
      <DashboardTileBadge count={badgeCount} />
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
        {textForDisplay(title, '')}
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
  const { counts, clearBadge } = useDashboardNotificationBadges();

  const allTiles = [
    {
      key: 'create',
      screenId: 'upholstery_create',
      icon: 'sofa-outline',
      title: tUi('dashCreate', locale),
      onPress: () => navigation.navigate('Create'),
    },
    {
      key: 'manufacture',
      screenId: 'upholstery_manufacture',
      icon: 'factory',
      title: tUi('dashManufacture', locale),
      onPress: () => navigation.navigate('Manufacture'),
    },
    {
      key: 'floor1',
      screenId: 'upholstery_floor1_products',
      icon: 'view-grid-outline',
      title: tUi('dashFloor1Products', locale),
      onPress: () => navigation.navigate('Floor1Products'),
    },
    {
      key: 'orders',
      screenId: 'upholstery_orders',
      hubScreenIds: UPHOLSTERY_ORDERS_HUB_SCREEN_IDS,
      icon: 'clipboard-list-outline',
      title: tUi('dashUnifiedOrders', locale),
      badgeKeys: ['jobs', 'quotes', 'repairs'],
      onPress: () => {
        ['jobs', 'quotes', 'repairs'].forEach((k) => clearBadge(k));
        navigation.navigate('Jobs');
      },
    },
  ];

  const tiles = grant
    ? allTiles.filter((t) => (
      t.hubScreenIds
        ? isWorkshopOrdersHubAllowed(grant, 'warehouse_production_app', t.hubScreenIds)
        : isWorkshopOrDeliveryScreenAllowed(grant, t.screenId, 'warehouse_production_app')
    ))
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
          title={tUi('dashTitle', ready ? locale : 'en')}
          locale={ready ? locale : 'en'}
          onToggleLocale={toggleLocale}
        />
        <Text style={[kiosk.noticeErr, { textAlign: 'center' }]}>{tUi('accessDenied', ready ? locale : 'ar')}</Text>
        {userEmail ? (
          <Text style={[styles.user, { textAlign: 'center', marginTop: 12 }]}>
            {tUi('signedInAs', ready ? locale : 'en').replace('{email}', userEmail)}
          </Text>
        ) : (
          <Text style={[styles.user, { textAlign: 'center', marginTop: 12 }]}>
            {tUi('notSignedIn', ready ? locale : 'en')}
          </Text>
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
          paddingTop: insets.top + 4,
          paddingBottom: kioskFooterBottomPad(insets) + 8,
        },
      ]}
    >
      <ProductionKioskTopBar
        title={tUi('dashTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
        compact
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
        bounces={false}
      >
        <View
          style={[
            kiosk.dashGrid,
            styles.gridArea,
            {
              gap,
              width: contentWidth,
              paddingHorizontal: 0,
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
              badgeCount={tile.badgeKeys
                ? sumDashboardBadgeCounts(counts, tile.badgeKeys)
                : (tile.badgeKey ? counts[tile.badgeKey] || 0 : 0)}
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
  user: { color: theme.textMuted, marginBottom: 2, fontSize: 15, fontWeight: '500' },
  hint: { color: theme.textMuted, marginTop: 10, fontSize: 13, lineHeight: 18 },
});
