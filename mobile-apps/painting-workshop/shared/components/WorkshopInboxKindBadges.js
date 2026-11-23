import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { orderBadgeTextStyle } from '../orderBadgeI18n';
import { isCatalogManufactureJob } from '../lib/productionInboxKinds';

export function WorkshopManufactureBadge({ locale, textAlign, tUi }) {
  const badgeTextExtra = orderBadgeTextStyle(locale);
  const rowAlign = locale === 'ar' || textAlign === 'right' ? 'flex-end' : 'flex-start';
  return (
    <View style={[styles.row, { justifyContent: rowAlign }]}>
      <Text style={[styles.badge, styles.badgeManufacture, badgeTextExtra]}>
        {tUi('badgeManufacture', locale)}
      </Text>
    </View>
  );
}

export function WorkshopRepairKindBadge({ locale, textAlign, tUi }) {
  const badgeTextExtra = orderBadgeTextStyle(locale);
  const rowAlign = locale === 'ar' || textAlign === 'right' ? 'flex-end' : 'flex-start';
  return (
    <View style={[styles.row, { justifyContent: rowAlign }]}>
      <Text style={[styles.badge, styles.badgeRepair, badgeTextExtra]}>
        {tUi('badgeRepair', locale)}
      </Text>
    </View>
  );
}

export function WorkshopJobInboxBadges({ job, locale, textAlign, tUi }) {
  if (!isCatalogManufactureJob(job)) return null;
  return <WorkshopManufactureBadge locale={locale} textAlign={textAlign} tUi={tUi} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeManufacture: {
    color: '#1e3a5f',
    backgroundColor: '#dbeafe',
  },
  badgeRepair: {
    color: '#7c2d12',
    backgroundColor: '#ffedd5',
  },
});