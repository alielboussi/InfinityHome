const UI_STRINGS = {
  pageTitle: { en: 'Warehouse production', ar: 'إنتاج المستودع' },
  subtitle: {
    en: 'Create in-house seating items (saved as warehouse packets).',
    ar: 'إنشاء قطع جلوس داخلية (تُحفظ كحزم في المستودع).',
  },
  locationLabel: { en: 'Location', ar: 'الموقع' },
  warehouseOnly: { en: 'Warehouse only', ar: 'المستودع فقط' },
  baseNameLabel: { en: 'Name (first)', ar: 'الاسم (أولاً)' },
  baseNameHint: {
    en: 'Enter or tap Suggest a name (stylish names or beautiful places), then pick a seater preset.',
    ar: 'أدخل اسمًا أو اضغط اقتراح اسم، ثم اختر نوع المقعد.',
  },
  productNameLabel: { en: 'Product name', ar: 'اسم المنتج' },
  generateName: { en: 'Suggest a name', ar: 'اقتراح اسم' },
  presetLabel: { en: 'Seater preset', ar: 'نوع المقعد' },
  skuLabel: { en: 'SKU (auto)', ar: 'رمز SKU (تلقائي)' },
  qtyLabel: { en: 'Stock qty (warehouse)', ar: 'كمية المخزون (المستودع)' },
  save: { en: 'Save production item', ar: 'حفظ عنصر الإنتاج' },
  saving: { en: 'Saving…', ar: 'جاري الحفظ…' },
  translateToggle: { en: 'العربية', ar: 'EN' },
  saved: { en: 'Saved — item is on Packets and catalog.', ar: 'تم الحفظ — العنصر في الحزم والكتالوج.' },
  needBaseName: { en: 'Enter or generate a name first.', ar: 'أدخل أو ولّد اسمًا أولاً.' },
  needPreset: { en: 'Choose a seater preset to build the product name.', ar: 'اختر نوع المقعد لبناء اسم المنتج.' },
  needQty: { en: 'Enter stock quantity (0 or more).', ar: 'أدخل كمية المخزون (0 أو أكثر).' },
  duplicateName: { en: 'This product name already exists.', ar: 'اسم المنتج موجود مسبقًا.' },
  noWarehouse: {
    en: 'No Warehouse location found. Add a location named "Warehouse".',
    ar: 'لم يُعثر على موقع المستودع. أضف موقعًا باسم Warehouse.',
  },
  accessDenied: { en: 'You do not have access to production.', ar: 'لا تملك صلاحية الإنتاج.' },
  loading: { en: 'Loading…', ar: 'جاري التحميل…' },
  loginTitle: { en: 'Production sign in', ar: 'تسجيل دخول الإنتاج' },
  loginEmail: { en: 'Email', ar: 'البريد الإلكتروني' },
  loginPassword: { en: 'Password', ar: 'كلمة المرور' },
  loginButton: { en: 'Sign in', ar: 'دخول' },
  loginError: { en: 'Sign-in failed.', ar: 'فشل تسجيل الدخول.' },
  loginNoAccess: { en: 'Your account is not enabled for production.', ar: 'حسابك غير مفعّل للإنتاج.' },
  dashTitle: { en: 'Production', ar: 'الإنتاج' },
  dashCreate: { en: 'Create new', ar: 'إنشاء جديد' },
  dashStock: { en: 'Production stock', ar: 'إضافة مخزون' },
  stockTitle: { en: 'Add production stock', ar: 'إضافة مخزون إنتاج' },
  stockSearch: { en: 'Search name or scan barcode', ar: 'ابحث بالاسم أو امسح الباركود' },
  keyboardBtn: { en: 'Keyboard', ar: 'لوحة المفاتيح' },
  stockSave: { en: 'Save stock increase', ar: 'حفظ زيادة المخزون' },
  stockIncreaseLabel: { en: 'Units to add', ar: 'الوحدات المضافة' },
  stockCurrent: { en: 'Warehouse qty now', ar: 'كمية المستودع الحالية' },
  stockAfter: { en: 'After save', ar: 'بعد الحفظ' },
  stockSaved: { en: 'Stock updated everywhere.', ar: 'تم تحديث المخزون في كل الأنظمة.' },
  stockNoMatch: { en: 'No matching product.', ar: 'لا يوجد منتج مطابق.' },
  stockSearchHint: {
    en: 'Type or scan to search — products appear here when there is a match.',
    ar: 'اكتب أو امسح للبحث — تظهر المنتجات هنا عند وجود تطابق.',
  },
  back: { en: 'Back', ar: 'رجوع' },
};

export function tUi(key, locale) {
  const row = UI_STRINGS[key];
  if (!row) return key;
  return row[locale === 'ar' ? 'ar' : 'en'] || row.en;
}

export async function translateEnToAr(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(raw)}&langpair=en|ar`;
    const res = await fetch(url);
    if (!res.ok) return raw;
    const json = await res.json();
    const out = String(json?.responseData?.translatedText || '').trim();
    return out || raw;
  } catch {
    return raw;
  }
}
