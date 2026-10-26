/** Keep in sync with src/utils/productionKioskI18n.js */

const UI_STRINGS = {
  pageTitle: { en: 'Upholstery Production', ar: 'إنتاج التنجيد' },
  preset3Seater: { en: '3 seater', ar: 'ثلاث مقاعد' },
  preset2Seater: { en: '2 seater', ar: 'مقعدان' },
  presetSingleSeater: { en: 'Single seater', ar: 'مقعد واحد' },
  presetLounge: { en: 'Lounge', ar: 'كرسي استرخاء' },
  subtitle: {
    en: 'Create in-house seating items (saved as warehouse packets).',
    ar: 'إنشاء قطع جلوس داخلية (تُحفظ كحزم في المستودع).',
  },
  locationLabel: { en: 'Location', ar: 'الموقع' },
  warehouseOnly: { en: 'Warehouse only', ar: 'المستودع فقط' },
  baseNameLabel: { en: 'Name (first)', ar: 'الاسم (أولاً)' },
  baseNameHint: {
    en: 'Enter or tap Suggest a name, then pick a seater preset. Saving requires a product photo.',
    ar: 'أدخل اسمًا أو اقترح اسمًا، ثم اختر نوع المقعد. الحفظ يتطلب صورة للمنتج.',
  },
  productNameLabel: { en: 'Product name', ar: 'اسم المنتج' },
  generateName: { en: 'Suggest a name', ar: 'اقتراح اسم' },
  presetLabel: { en: 'Seater preset', ar: 'نوع المقعد' },
  qtyLabel: { en: 'Stock qty (warehouse)', ar: 'كمية المخزون (المستودع)' },
  save: { en: 'Save production item', ar: 'حفظ عنصر الإنتاج' },
  saving: { en: 'Saving…', ar: 'جاري الحفظ…' },
  translateToggle: { en: 'عربي', ar: 'English' },
  saved: { en: 'Saved — photo catalogued and labels sent to printer.', ar: 'تم الحفظ — صُوّرت المنتج وأُرسلت الملصقات إلى الطابعة.' },
  photoCaptureTitle: { en: 'Product photo', ar: 'صورة المنتج' },
  photoCaptureHint: {
    en: 'Take a clear photo of the seating arrangement, then tap Take photo.',
    ar: 'التقط صورة واضحة لقطعة الجلوس، ثم اضغط التقاط الصورة.',
  },
  photoCaptureShutter: { en: 'Take photo', ar: 'التقاط الصورة' },
  photoAllowCamera: {
    en: 'Allow camera access',
    ar: 'السماح بالوصول إلى الكاميرا',
  },
  photoCameraDenied: {
    en: 'Camera permission is required. Tap Allow camera access and accept the system prompt.',
    ar: 'إذن الكاميرا مطلوب. اضغط السماح بالوصول إلى الكاميرا واقبل رسالة النظام.',
  },
  photoCameraOpenSettings: {
    en: 'Camera is blocked for this app. Open Settings → Permissions → Camera and allow it.',
    ar: 'الكاميرا محظورة لهذا التطبيق. افتح الإعدادات → الأذونات → الكاميرا وفعّلها.',
  },
  photoOpenSettings: { en: 'Open Settings', ar: 'فتح الإعدادات' },
  photoProcessing: {
    en: 'AI is retouching your photo (white catalog background) and printing labels…',
    ar: 'الذكاء الاصطناعي يعالج الصورة (خلفية بيضاء) ويطبع الملصقات…',
  },
  photoCancelled: {
    en: 'A product photo is required. Tap Save again and take the picture.',
    ar: 'صورة المنتج مطلوبة. اضغط حفظ مرة أخرى والتقط الصورة.',
  },
  needBaseName: { en: 'Enter or generate a name first.', ar: 'أدخل أو ولّد اسمًا أولاً.' },
  needPreset: { en: 'Choose a seater preset to build the product name.', ar: 'اختر نوع المقعد لبناء اسم المنتج.' },
  needQty: { en: 'Enter stock quantity (1 or more — one label per unit).', ar: 'أدخل كمية المخزون (1 أو أكثر — ملصق لكل وحدة).' },
  saveFailedTitle: { en: 'Could not save item', ar: 'تعذر حفظ العنصر' },
  savedNoLabelsQty: {
    en: 'Saved, but no labels were queued because stock qty was 0. Set qty to at least 1 before saving.',
    ar: 'تم الحفظ، لكن لم تُرسل ملصقات لأن الكمية كانت 0. اضبط الكمية على 1 أو أكثر قبل الحفظ.',
  },
  duplicateName: { en: 'This product name already exists.', ar: 'اسم المنتج موجود مسبقًا.' },
  noWarehouse: {
    en: 'No Warehouse location found. Add a location named "Warehouse".',
    ar: 'لم يُعثر على موقع المستودع. أضف موقعًا باسم Warehouse.',
  },
  accessDenied: { en: 'You do not have access to production.', ar: 'لا تملك صلاحية الإنتاج.' },
  retryAccess: { en: 'Check access again', ar: 'تحقق من الصلاحية مرة أخرى' },
  loading: { en: 'Loading…', ar: 'جاري التحميل…' },
  dashTitle: { en: 'Upholstery Production', ar: 'إنتاج التنجيد' },
  dashCreate: { en: 'Create new item', ar: 'إنشاء قطعة جديدة' },
  dashCreateSub: {
    en: 'New seating → warehouse packet + labels',
    ar: 'مقعد جديد → حزمة مستودع + ملصقات',
  },
  dashStock: { en: 'Add warehouse stock', ar: 'إضافة مخزون' },
  dashStockSub: {
    en: 'Search product → increase qty + labels',
    ar: 'بحث عن منتج → زيادة الكمية + ملصقات',
  },
  stockTitle: { en: 'Add production stock', ar: 'إضافة مخزون إنتاج' },
  stockSearch: { en: 'Search name or scan barcode', ar: 'ابحث بالاسم أو امسح الباركود' },
  keyboardBtn: { en: 'Keyboard', ar: 'لوحة المفاتيح' },
  stockQrBtn: { en: 'QR', ar: 'QR' },
  stockQrTitle: { en: 'Scan QR or barcode', ar: 'مسح QR أو الباركود' },
  stockQrHint: {
    en: 'Point at Image Qr, Product Name Qr, or the SKU barcode on the label.',
    ar: 'وجّه الكاميرا نحو QR الصورة، QR اسم المنتج، أو باركود SKU على الملصق.',
  },
  stockQrAllowCamera: {
    en: 'Allow camera to scan',
    ar: 'السماح للكاميرا للمسح',
  },
  stockSave: { en: 'Save stock increase', ar: 'حفظ زيادة المخزون' },
  stockIncreaseLabel: { en: 'Units to add', ar: 'الوحدات المضافة' },
  stockCurrent: { en: 'Warehouse qty now', ar: 'كمية المستودع الحالية' },
  stockAfter: { en: 'After save', ar: 'بعد الحفظ' },
  stockSaved: { en: 'Stock updated — labels sent to printer.', ar: 'تم التحديث — أُرسلت الملصقات إلى الطابعة.' },
  stockNoMatch: { en: 'No matching product.', ar: 'لا يوجد منتج مطابق.' },
  stockSearchHint: {
    en: 'Type or scan to search — products appear here when there is a match.',
    ar: 'اكتب أو امسح للبحث — تظهر المنتجات هنا عند وجود تطابق.',
  },
  back: { en: 'Back', ar: 'رجوع' },
  labelPreviewTitle: { en: 'Label preview', ar: 'معاينة الملصق' },
  labelPreviewSent: { en: 'Sent to printer (layout below).', ar: 'أُرسل إلى الطابعة (التخطيط أدناه).' },
  labelPreviewCopies: { en: '{n} copies sent to printer.', ar: 'أُرسل {n} نسخ إلى الطابعة.' },
  labelPreviewDone: { en: 'Done', ar: 'تم' },
};

const PRESET_I18N = {
  '3 Seater': 'preset3Seater',
  '2 Seater': 'preset2Seater',
  'Single Seater': 'presetSingleSeater',
  'Lounge Chair': 'presetLounge',
};

export function presetLabel(preset, locale) {
  const key = PRESET_I18N[preset];
  if (!key) return preset;
  return tUi(key, locale);
}

export function tUi(key, locale) {
  const row = UI_STRINGS[key];
  if (!row) return key;
  return row[locale === 'ar' ? 'ar' : 'en'] || row.en;
}

/** Same free translation API as web kiosk (MyMemory). */
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
