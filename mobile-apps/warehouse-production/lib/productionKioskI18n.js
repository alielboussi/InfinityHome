/** Keep in sync with src/utils/productionKioskI18n.js */

const UI_STRINGS = {
  pageTitle: { en: 'Production', ar: 'الإنتاج' },
  preset3Seater: { en: '3 seater', ar: 'ثلاث مقاعد' },
  preset2Seater: { en: '2 seater', ar: 'مقعدان' },
  presetSingleSeater: { en: 'Single seater', ar: 'مقعد واحد' },
  presetLounge: { en: 'Lounge', ar: 'كرسي استرخاء' },
  presetDresserMirror: { en: 'Dresser mirror', ar: 'مرآة تسريحة' },
  presetDiningTable: { en: 'Dining table', ar: 'طاولة طعام' },
  presetDiningChair: { en: 'Dining chair', ar: 'كرسي طعام' },
  presetBuffet: { en: 'Buffet', ar: 'بوفيه' },
  presetBuffetMirror: { en: 'Buffet mirror', ar: 'مرآة بوفيه' },
  presetCoffeeTable: { en: 'Coffee table', ar: 'طاولة قهوة' },
  presetSideTable: { en: 'Side table', ar: 'طاولة جانبية' },
  presetDresserTable: { en: 'Dresser table', ar: 'طاولة تسريحة' },
  presetDresserTableMirror: { en: 'Dresser table mirror', ar: 'مرآة تسريحة' },
  seaterGroupLabel: { en: 'Seaters', ar: 'مقاعد' },
  carpentryGroupLabel: { en: 'Carpentry', ar: 'أثاث خشبي' },
  seaterPickerPlaceholder: { en: 'Choose seater', ar: 'اختر المقعد' },
  carpentryPickerPlaceholder: { en: 'Choose carpentry', ar: 'اختر قطعة الخشب' },
  presetPickerPlaceholder: { en: 'Choose product type', ar: 'اختر نوع المنتج' },
  dimensionsLabel: { en: 'Dimensions', ar: 'الأبعاد' },
  dimLength: { en: 'Length cm', ar: 'الطول سم' },
  dimWidth: { en: 'Width cm', ar: 'العرض سم' },
  dimHeight: { en: 'Height cm', ar: 'الارتفاع سم' },
  dimUnitCm: { en: 'cm', ar: 'سم' },
  nameSearchHint: {
    en: 'Type to search existing line names (first name only, not product type).',
    ar: 'اكتب للبحث عن أسماء الخطوط (الاسم الأول فقط، وليس نوع المنتج).',
  },
  presetPickerClose: { en: 'Close', ar: 'إغلاق' },
  subtitle: {
    en: 'Create in-house seating items (saved as warehouse packets).',
    ar: 'إنشاء قطع جلوس داخلية (تُحفظ كحزم في المستودع).',
  },
  locationLabel: { en: 'Location', ar: 'الموقع' },
  warehouseOnly: { en: 'Warehouse only', ar: 'المستودع فقط' },
  baseNameLabel: { en: 'Name (first)', ar: 'الاسم (أولاً)' },
  baseNameHint: {
    en: 'Enter or tap Suggest a name, then choose a product type. Saving requires a product photo.',
    ar: 'أدخل اسمًا أو اقترح اسمًا، ثم اختر نوع المنتج. الحفظ يتطلب صورة للمنتج.',
  },
  productNameLabel: { en: 'Product name', ar: 'اسم المنتج' },
  generateName: { en: 'Suggest a name', ar: 'اقتراح اسم' },
  presetLabel: { en: 'Product type', ar: 'نوع المنتج' },
  recentBaseNamesLabel: { en: 'Recent names', ar: 'أسماء حديثة' },
  recentBaseNamesHint: {
    en: 'Tap a recent name, then choose a product type to finish.',
    ar: 'اختر اسمًا حديثًا، ثم نوع المنتج لإكمال الإنشاء.',
  },
  qtyLabel: { en: 'Stock qty (warehouse)', ar: 'كمية المخزون (المستودع)' },
  save: { en: 'Save production item', ar: 'حفظ عنصر الإنتاج' },
  saving: { en: 'Saving…', ar: 'جاري الحفظ…' },
  translateToggle: { en: 'عربي', ar: 'English' },
  savedWithLabels: {
    en: 'Saved — photo catalogued and labels sent to the printer.',
    ar: 'تم الحفظ — صُوّرت المنتج وأُرسلت الملصقات إلى الطابعة.',
  },
  savedItemOnly: {
    en: 'Saved — item and photo are in the catalog.',
    ar: 'تم الحفظ — العنصر والصورة في الكتالوج.',
  },
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
  aiPhotoRetry: {
    en: 'AI retouching photo… attempt {n} of {max}. Please wait.',
    ar: 'AI retouching photo… attempt {n} of {max}. Please wait.',
  },
  photoProcessing: {
    en: 'Saving product… then AI will retouch the photo (white catalog background). Do not close the app.',
    ar: 'جاري حفظ المنتج… ثم الذكاء الاصطناعي يعالج الصورة (خلفية بيضاء). لا تغلق التطبيق.',
  },
  photoCancelled: {
    en: 'A product photo is required. Tap Save again and take the picture.',
    ar: 'صورة المنتج مطلوبة. اضغط حفظ مرة أخرى والتقط الصورة.',
  },
  needBaseName: { en: 'Enter or generate a name first.', ar: 'أدخل أو ولّد اسمًا أولاً.' },
  needPreset: { en: 'Choose a product type to build the product name.', ar: 'اختر نوع المنتج لبناء اسم المنتج.' },
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
  dashTitle: { en: 'Production', ar: 'الإنتاج' },
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
  dashDelivery: { en: 'Send Delivery', ar: 'إرسال تسليم' },
  dashDeliverySub: {
    en: 'Truck delivery — driver checklist → Hassan',
    ar: 'تسليم بالشاحنة — قائمة السائق → حسن',
  },
  deliveryTitle: { en: 'Send Delivery', ar: 'إرسال تسليم' },
  deliveryAddProductTitle: { en: 'Add product', ar: 'إضافة منتج' },
  deliverySentTitle: { en: 'Sent', ar: 'تم الإرسال' },
  deliverySubtitle: { en: 'Factory → Kitwe delivery', ar: 'تسليم من المصنع إلى كيتوي' },
  deliveryDriver: { en: 'Driver', ar: 'السائق' },
  deliveryDriverPlaceholder: { en: 'Choose driver', ar: 'اختر السائق' },
  deliveryAddProductBtn: { en: '+ Add warehouse product', ar: '+ إضافة منتج من المستودع' },
  deliveryAddSection: { en: 'Add products', ar: 'إضافة منتجات' },
  deliveryCartTitle: { en: 'Delivery cart', ar: 'سلة التسليم' },
  deliveryCartEmpty: { en: 'No products yet — search or scan a packet above.', ar: 'لا منتجات بعد — ابحث أو امسح طردًا أعلاه.' },
  deliveryRemoveProduct: { en: 'Remove', ar: 'إزالة' },
  deliverySetsOnTruck: { en: 'Sets on truck: {n}', ar: 'الأطقم على الشاحنة: {n}' },
  deliveryPacketsChecked: { en: 'Packets checked: {n}', ar: 'الطرود المؤكدة: {n}' },
  deliverySendBtn: { en: 'Send delivery', ar: 'إرسال التسليم' },
  deliverySessionFailed: { en: 'Could not start delivery session.', ar: 'تعذر بدء جلسة التسليم.' },
  deliveryNeedProduct: { en: 'Add at least one product.', ar: 'أضف منتجًا واحدًا على الأقل.' },
  deliveryNeedDriver: { en: 'Select a driver.', ar: 'اختر السائق.' },
  deliverySubmitFailed: { en: 'Submit failed.', ar: 'فشل الإرسال.' },
  deliverySearchPlaceholder: { en: 'Search warehouse product…', ar: 'ابحث عن منتج في المستودع…' },
  deliverySelectProduct: { en: 'Select a product.', ar: 'اختر منتجًا.' },
  deliveryCheckAllPackets: {
    en: 'Check every packet carton for {name}.',
    ar: 'أكد كل كرتون طرد لـ {name}.',
  },
  deliverySetsLabel: { en: 'Complete sets on truck', ar: 'الأطقم الكاملة على الشاحنة' },
  deliveryPacketsTick: { en: 'Packet cartons (tick each)', ar: 'كراتين الطرود (حدد كل واحد)' },
  deliveryPacketLine: {
    en: '#{num} {name} — {req} carton(s)',
    ar: '#{num} {name} — {req} كرتون',
  },
  deliveryAddToDelivery: { en: 'Add to delivery', ar: 'إضافة إلى التسليم' },
  deliveryDoneTitle: { en: 'Delivery sent', ar: 'تم إرسال التسليم' },
  deliveryDoneSub: {
    en: 'Hassan will see this on Warehouse Deliveries before the truck arrives.',
    ar: 'سيرى حسن هذا في تسليمات المستودع قبل وصول الشاحنة.',
  },
  deliveryBackDashboard: { en: 'Back to dashboard', ar: 'العودة إلى لوحة التحكم' },
  deliveryScanBtn: { en: 'Scan packet', ar: 'مسح الطرد' },
  deliveryScanPickTitle: { en: 'Which product?', ar: 'أي منتج؟' },
  deliveryScanPickHint: {
    en: 'This packet belongs to more than one product. Choose the one on the truck.',
    ar: 'هذا الطرد يخص أكثر من منتج. اختر المنتج على الشاحنة.',
  },
  deliveryScanNoPacket: {
    en: 'No warehouse packet matches this scan.',
    ar: 'لا يوجد طرد في المستودع يطابق هذا المسح.',
  },
  deliveryScanNoProduct: {
    en: 'This packet is not linked to any warehouse product.',
    ar: 'هذا الطرد غير مرتبط بأي منتج في المستودع.',
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
  stockNotEligible: {
    en: 'This item uses packet BOM stock. Only finished products (no cartons) can be added here.',
    ar: 'هذا المنتج يعتمد على مخزون الطرود. يمكن إضافة المخزون هنا للمنتجات الجاهزة فقط (بدون طرود).',
  },
  stockSearchHint: {
    en: 'Type or scan to search — products appear here when there is a match.',
    ar: 'اكتب أو امسح للبحث — تظهر المنتجات هنا عند وجود تطابق.',
  },
  back: { en: 'Back', ar: 'رجوع' },
  labelPreviewTitle: { en: 'Label preview', ar: 'معاينة الملصق' },
  labelPreviewSent: { en: 'Sent to printer (preview below).', ar: 'أُرسل إلى الطابعة (معاينة أدناه).' },
  labelPreviewNotPrinted: {
    en: 'Preview only — labels were not printed. Fix Zebra settings on the server, then save again or reprint from the web.',
    ar: 'معاينة فقط — لم تُطبع الملصقات. صحّح إعدادات Zebra على الخادم ثم أعد المحاولة.',
  },
  labelPreviewCopies: { en: '{n} copies sent to printer.', ar: 'أُرسل {n} نسخ إلى الطابعة.' },
  labelPreviewDone: { en: 'Done', ar: 'تم' },
};

const PRESET_I18N = {
  '3 Seater': 'preset3Seater',
  '2 Seater': 'preset2Seater',
  'Single Seater': 'presetSingleSeater',
  'Lounge Chair': 'presetLounge',
  'Dining Table': 'presetDiningTable',
  'Dining Chair': 'presetDiningChair',
  Buffet: 'presetBuffet',
  'Buffet Mirror': 'presetBuffetMirror',
  'Coffee Table': 'presetCoffeeTable',
  'Side Table': 'presetSideTable',
  'Dresser Table': 'presetDresserTable',
  'Dresser Table Mirror': 'presetDresserTableMirror',
  'Dresser Mirror': 'presetDresserMirror',
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
