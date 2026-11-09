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

import ProductionPressableHint from '../lib/ProductionPressableHint';

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
    </ProductionPressableHint>
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
  const { locale, toggleLocale, ready, textAlign } = useProductionKioskLocale();
  const showJobs = !grant || isWorkshopOrDeliveryScreenAllowed(grant, 'painting_jobs', 'painting_workshop_app');
  const showPushSettings = !grant || isWorkshopOrDeliveryScreenAllowed(grant, 'painting_push_settings', 'painting_workshop_app');
  const tileCount = Math.max(1, (showJobs ? 1 : 0) + (showPushSettings ? 1 : 0));
  const { tileWidth, tileHeight, gap, contentWidth } = useProductionDashboardTileLayout(tileCount);

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
          title={tUi('dashPaintingTitle', ready ? locale : 'en')}
          locale={ready ? locale : 'en'}
          onToggleLocale={toggleLocale}
        />
        <Text style={[kiosk.noticeErr, { textAlign: 'center' }]}>{tUi('accessDenied', ready ? locale : 'en')}</Text>
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
        title={tUi('dashPaintingTitle', locale)}
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
      >
        <View
          style={[
            kiosk.dashGrid,
            styles.gridArea,
            { gap, width: contentWidth, paddingHorizontal: 0, marginTop: 12 },
          ]}
        >
          {showJobs ? (
            <DashboardTile
              icon="format-paint"
              title={tUi('paintingJobsTitle', locale)}
              hintKey="dashTileHint_paintingJobs"
              locale={locale}
              textAlign={textAlign}
              width={tileWidth}
              height={tileHeight}
              onPress={() => navigation.navigate('Jobs')}
            />
          ) : null}
          {showPushSettings ? (
            <DashboardTile
              icon="bell-cog-outline"
              title="Alert settings"
              hintKey="dashTileHint_push"
              locale={locale}
              textAlign={textAlign}
              width={tileWidth}
              height={tileHeight}
              onPress={() => navigation.navigate('PushSettings')}
            />
          ) : null}
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
