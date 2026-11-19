/** Customer / showroom order badges — keep `ar` in every app `productionKioskI18n.js`. */
export const ORDER_BADGE_I18N_KEYS = Object.freeze([
  'badgeCustomerOrder',
  'badgeShowroomOrder',
]);

export const ORDER_BADGE_I18N_STRINGS = Object.freeze({
  badgeCustomerOrder: { en: 'Customer Order', ar: 'طلب عميل' },
  badgeShowroomOrder: { en: 'Showroom Order', ar: 'طلب صالة' },
});

/** Optional tracking kind chips (Orders app Production Tracking). */
export const TRACKING_KIND_I18N_STRINGS = Object.freeze({
  trackingKindFactoryJob: { en: 'Factory job', ar: 'وظيفة مصنع' },
  trackingKindQuoteOrder: { en: 'Quote order', ar: 'طلب عرض' },
  trackingKindRepair: { en: 'Repair', ar: 'إصلاح' },
});

export function orderBadgeTextStyle(locale) {
  return locale === 'ar'
    ? { writingDirection: 'rtl', textAlign: 'right' }
    : undefined;
}