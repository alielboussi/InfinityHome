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
  recentBaseNamesLabel: { en: 'Recent names', ar: 'أسماء حديثة' },
  recentBaseNamesHint: {
    en: 'Tap a recent name, then choose a seater preset to finish.',
    ar: 'اختر اسمًا حديثًا، ثم نوع المقعد لإكمال الإنشاء.',
  },
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
  deliveryRemoveProduct: { en: 'Delete', ar: 'حذف' },
  deliveryAlertCancel: { en: 'Cancel', ar: 'إلغاء' },
  deliveryDeleteConfirmTitle: { en: 'Remove product?', ar: 'إزالة المنتج؟' },
  deliveryDeleteConfirmMessage: {
    en: 'Remove {name} from the delivery cart?',
    ar: 'إزالة {name} من سلة التسليم؟',
  },
  deliveryDiscardDraftTitle: { en: 'Discard product?', ar: 'إلغاء المنتج؟' },
  deliveryDiscardDraftMessage: {
    en: 'Clear {name} without adding it to the cart?',
    ar: 'مسح {name} دون إضافته إلى السلة؟',
  },
  deliveryAddToCartHint: {
    en: 'Tick every packet carton, then tap Add to delivery — the product appears in the cart below.',
    ar: 'حدد كل كرتون طرد، ثم اضغط إضافة إلى التسليم — يظهر المنتج في السلة أدناه.',
  },
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
  deliveryPrintTitle: { en: 'Print delivery note (A4)', ar: 'طباعة مذكرة التسليم (A4)' },
  deliveryPrintHint: {
    en: 'Printers on your Wi‑Fi appear below. Tap one, then confirm print on the next screen (Android).',
    ar: 'تظهر الطابعات على شبكة الواي فاي أدناه. اضغط على واحدة ثم أكد الطباعة في الشاشة التالية.',
  },
  deliveryPrintRescan: { en: 'Search again', ar: 'بحث مرة أخرى' },
  deliveryPrintSystemPicker: { en: 'Choose printer (system list)', ar: 'اختر الطابعة (قائمة النظام)' },
  deliveryPrintSkip: { en: 'Skip printing', ar: 'تخطي الطباعة' },
  deliveryPrintNoPrinters: {
    en: 'No printers found. Use “Choose printer” or install HP Smart / Mopria on this phone.',
    ar: 'لم يُعثر على طابعات. استخدم «اختر الطابعة» أو ثبّت HP Smart / Mopria.',
  },
  deliveryPrintDiscoveryUnavailable: {
    en: 'Network printer search needs the Production APK (not Expo Go). You can still use the system printer list.',
    ar: 'بحث الطابعات يتطلب تطبيق Production (ليس Expo Go). يمكنك استخدام قائمة النظام.',
  },
  deliveryPrintScanFailed: { en: 'Printer search failed.', ar: 'فشل البحث عن الطباعات.' },
  deliveryPrintFailed: { en: 'Print failed.', ar: 'فشلت الطباعة.' },
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
