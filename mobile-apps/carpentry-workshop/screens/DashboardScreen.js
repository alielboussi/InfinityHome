import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskFooterBottomPad } from '../productionKiosk/lib/kioskLayout';
import { useProductionDashboardTileLayout } from '../productionKiosk/lib/productionDashLayout';
import { theme } from '../shared/theme';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import ProductionPressableHint from '../productionKiosk/lib/ProductionPressableHint';

function DashboardTile({
  icon, title, width, height, onPress, hintKey, locale, textAlign,
}) {
  const iconSize = Math.round(Math.min(44, height * 0.32));
  return (
    <ProductionPressableHint
      hintKey={hintKey}
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
        color={theme.primaryDark || '#0369a1'}
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
  userDisplayName,
  userEmail,
  allowed,
  onRefreshAccess,
  accessHint,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, ready, textAlign } = useProductionKioskLocale();
  const tileCount = 6;
  const {
    tileWidth, tileHeight, gap, contentWidth,
  } = useProductionDashboardTileLayout(tileCount);

  const tiles = [
    {
      key: 'create',
      icon: 'hammer-wrench',
      title: tUi('dashCreate', locale),
      hintKey: 'dashTileHint_create',
      onPress: () => navigation.navigate('Create'),
    },
    {
      key: 'manufacture',
      icon: 'factory',
      title: tUi('dashManufacture', locale),
      hintKey: 'dashTileHint_manufacture',
      onPress: () => navigation.navigate('Manufacture'),
    },
    {
      key: 'jobs',
      icon: 'progress-clock',
      title: tUi('carpentryJobsTitle', locale),
      hintKey: 'dashTileHint_jobs',
      onPress: () => navigation.navigate('Jobs'),
    },
    {
      key: 'painting',
      icon: 'format-paint',
      title: tUi('dashPainting', locale),
      hintKey: 'dashTileHint_painting',
      onPress: () => navigation.navigate('Painting'),
    },
    {
      key: 'quotes',
      icon: 'clipboard-text-outline',
      title: tUi('dashCarpentryQuoteOrders', locale),
      hintKey: 'dashTileHint_quotes',
      onPress: () => navigation.navigate('Quotes'),
    },
    {
      key: 'repairs',
      icon: 'wrench-clock',
      title: tUi('dashRepairs', locale),
      hintKey: 'dashTileHint_repairs',
      onPress: () => navigation.navigate('Repairs'),
    },
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
        <ProductionKioskTopBar
          title={tUi('dashCarpentryTitle', ready ? locale : 'en')}
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
        title={tUi('dashCarpentryTitle', locale)}
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
              marginTop: 12,
            },
          ]}
        >
          {tiles.map((tile) => (
            <DashboardTile
              key={tile.key}
              icon={tile.icon}
              title={tile.title}
              hintKey={tile.hintKey}
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
