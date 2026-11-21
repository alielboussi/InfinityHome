import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SharedProductionPushSettingsScreen from '../shared/screens/ProductionPushSettingsScreen';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskFooterBottomPad } from '../productionKiosk/lib/kioskLayout';
import { registerProductionPushTokenWithServer } from '../productionKiosk/lib/productionPushNotifications';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import { theme } from '../shared/theme';

export default function ProductionPushSettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();

  const copy = useMemo(() => ({
    back: `← ${tUi('back', locale)}`,
    lead: tUi('pushSettingsLead', locale),
    quoteOrders: tUi('pushPrefQuotes', locale),
    quoteOrdersHint: tUi('pushPrefQuotesHint', locale),
    repairs: tUi('pushPrefRepairs', locale),
    repairsHint: tUi('pushPrefRepairsHint', locale),
    jobs: tUi('pushPrefJobs', locale),
    jobsHint: tUi('pushPrefJobsHint', locale),
    paintingJobs: tUi('pushPrefPainting', locale),
    paintingJobsHint: tUi('pushPrefPaintingHint', locale),
    saved: tUi('pushSettingsSaved', locale),
    saveFailed: tUi('pushSettingsSaveFailed', locale),
    notConfigured: tUi('pushSettingsNotConfigured', locale),
    save: tUi('pushSettingsSave', locale),
    saving: tUi('saving', locale),
  }), [locale]);

  return (
    <SharedProductionPushSettingsScreen
      navigation={navigation}
      registerProductionPushTokenWithServer={registerProductionPushTokenWithServer}
      themePrimary={theme.primary}
      screenStyle={kiosk.screen}
      paddingTop={insets.top + 8}
      paddingBottom={kioskFooterBottomPad(insets)}
      textAlign={textAlign}
      copy={copy}
      header={(
        <ProductionKioskTopBar
          title={tUi('pushSettingsTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
      )}
    />
  );
}