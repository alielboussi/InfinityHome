/** Keep in sync with src/utils/productionKioskI18n.js */

function coalesceDisplayText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = String(value);
  return text || fallback;
}

export const textForDisplay = coalesceDisplayText;

const UI_STRINGS = {
  pageTitle: { en: 'Upholstery', ar: 'التنجيد' },
  preset3Seater: { en: '3 seater', ar: 'ثلاث مقاعد' },
  preset2Seater: { en: '2 seater', ar: 'مقعدان' },
  presetSingleSeater: { en: 'Single seater', ar: 'مقعد واحد' },
  presetLounge: { en: 'Lounge', ar: 'كرسي استرخاء' },
  presetCurtains: { en: 'Curtains', ar: 'ستائر' },
  presetPillows: { en: 'Pillows', ar: 'وسائد' },
  presetDresserMirror: { en: 'Dresser mirror', ar: 'مرآة تسريحة' },
  presetDiningTable: { en: 'Dining table', ar: 'طاولة طعام' },
  presetDiningChair: { en: 'Dining chair', ar: 'كرسي طعام' },
  presetBuffet: { en: 'Buffet', ar: 'بوفيه' },
  presetBuffetMirror: { en: 'Buffet mirror', ar: 'مرآة بوفيه' },
  presetCoffeeTable: { en: 'Coffee table', ar: 'طاولة قهوة' },
  presetSideTable: { en: 'Side table', ar: 'طاولة جانبية' },
  presetDresserTable: { en: 'Dresser table', ar: 'طاولة تسريحة' },
  presetDresserTableMirror: { en: 'Dresser table mirror', ar: 'مرآة تسريحة' },
  seaterGroupLabel: { en: 'Upholstery', ar: 'تنجيد' },
  carpentryGroupLabel: { en: 'Carpentry', ar: 'أثاث خشبي' },
  seaterPickerPlaceholder: { en: 'Choose upholstery', ar: 'اختر التنجيد' },
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
  qtyLabel: {
    en: 'Stock qty',
    ar: 'كمية المخزون',
  },
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
    ar: 'جاري تحسين الصورة بالذكاء الاصطناعي… المحاولة {n} من {max}. يرجى الانتظار.',
  },
  savedMattressNoPhoto: {
    en: 'Saved — labels sent. Mattresses do not use AI catalog photos (furniture only).',
    ar: 'تم الحفظ — أُرسلت الملصقات. المراتب بدون صورة AI (الأثاث فقط).',
  },
  savePhaseCreatingProduct: {
    en: 'Creating product in warehouse…',
    ar: 'جاري إنشاء المنتج في المستودع…',
  },
  savePhasePreparingPhoto: {
    en: 'Preparing photo for upload…',
    ar: 'جاري تجهيز الصورة للرفع…',
  },
  photoProcessing: {
    en: 'AI retouching photo (white catalog background). Usually 30–90 seconds — do not close the app.',
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
  createAiPhotoFailedHint: {
    en: 'AI photo retouch did not finish. Warehouse stock is not updated until retouch succeeds. Tap Retry or discard the draft.',
    ar: 'لم يكتمل تحسين الصورة بالذكاء الاصطناعي. لا يُحدَّث مخزون المستودع حتى ينجح. اضغط إعادة المحاولة أو تجاهل المسودة.',
  },
  createAiPhotoRetry: { en: 'Retry AI photo', ar: 'إعادة محاولة الصورة' },
  createDiscardDraft: { en: 'Discard draft', ar: 'تجاهل المسودة' },
  createDiscardDraftFailed: { en: 'Could not discard draft.', ar: 'تعذر تجاهل المسودة.' },
  createAiPhotoRetryLost: {
    en: 'Retry data was lost. Tap Save and take the photo again.',
    ar: 'فُقدت بيانات إعادة المحاولة. اضغط حفظ والتقط الصورة من جديد.',
  },
  savedNoLabelsQty: {
    en: 'Saved, but no labels were queued because stock qty was 0. Set qty to at least 1 before saving.',
    ar: 'تم الحفظ، لكن لم تُرسل ملصقات لأن الكمية كانت 0. اضبط الكمية على 1 أو أكثر قبل الحفظ.',
  },
  duplicateName: { en: 'This product name already exists.', ar: 'اسم المنتج موجود مسبقًا.' },
  noWarehouse: {
    en: 'No Warehouse location found. Add a location named "Warehouse".',
    ar: 'لم يُعثر على موقع المستودع. أضف موقعًا باسم «المستودع».',
  },
  accessDenied: { en: 'You do not have access to production.', ar: 'لا تملك صلاحية الإنتاج.' },
  retryAccess: { en: 'Check access again', ar: 'تحقق من الصلاحية مرة أخرى' },
  loading: { en: 'Loading…', ar: 'جاري التحميل…' },
  loginHintGoogle: {
    en: 'Sign in with the Google account your administrator added in User Login Access.',
    ar: 'سجّل الدخول بحساب Google الذي أضافه المسؤول في صلاحيات الدخول.',
  },
  loginHintBoth: {
    en: 'Sign in with Google or your Firebase email and password.',
    ar: 'سجّل الدخول بـ Google أو البريد وكلمة مرور Firebase.',
  },
  loginEmail: { en: 'Email', ar: 'البريد الإلكتروني' },
  loginPassword: { en: 'Password', ar: 'كلمة المرور' },
  loginButton: { en: 'Sign in', ar: 'دخول' },
  loginSigningIn: { en: 'Signing in…', ar: 'جاري تسجيل الدخول…' },
  quoteOrderScreenTitle: { en: 'Order', ar: 'طلب' },
  quoteOrderTimer: { en: 'Production timer', ar: 'مؤقت الإنتاج' },
  quoteOrderAcceptStart: { en: 'Accept & start', ar: 'قبول وبدء' },
  quoteOrderPause: { en: 'Pause order', ar: 'إيقاف الطلب' },
  quoteOrderResume: { en: 'Resume order', ar: 'استئناف الطلب' },
  quoteOrderEnd: { en: 'End order', ar: 'إنهاء الطلب' },
  quoteOrderEndConfirmTitle: { en: 'End production', ar: 'إنهاء الإنتاج' },
  quoteOrderEndConfirmBody: { en: 'Complete this order?', ar: 'إكمال هذا الطلب؟' },
  quoteOrderEndSendPainting: { en: 'End + send to painting', ar: 'إنهاء وإرسال للدهان' },
  carpentryQuoteSentToPainting: {
    en: 'Order completed and sent to the Painting app.',
    ar: 'اكتمل الطلب وأُرسل إلى تطبيق الدهان.',
  },
  quoteOrderCompleteDone: { en: 'Production ended — Delivery app virtual hold.', ar: 'انتهى الإنتاج — حجز افتراضي في تطبيق التسليم.' },
  quoteOrderMaterials: { en: 'Materials', ar: 'المواد' },
  quoteOrderMaterialsHint: {
    en: 'Open Materials to pick items, type a barcode, or scan — storeroom is deducted when you save.',
    ar: 'افتح المواد لاختيار الأصناف أو إدخال/مسح الباركود — يُخصم من المخزن عند الحفظ.',
  },
  quoteOrderScanPlaceholder: { en: 'Scan or type SKU / barcode', ar: 'امسح أو اكتب الرمز أو الباركود' },
  quoteOrderDeductScan: { en: 'Deduct scan', ar: 'خصم المسح' },
  quoteOrderLines: { en: 'Lines', ar: 'البنود' },
  quoteOrderLeatherCode: { en: 'Leather code', ar: 'رمز الجلد' },
  quoteOrderDimensions: { en: 'L×W×H (cm)', ar: 'ط×ع×ار (سم)' },
  quoteOrderColorCode: { en: 'Color code', ar: 'رمز اللون' },
  quoteOrderWood: { en: 'Wood', ar: 'الخشب' },
  quoteOrderFoamType: { en: 'Foam type', ar: 'نوع الفوم' },
  quoteOrderDescription: { en: 'Description', ar: 'الوصف' },
  quoteOrderIncludedAccessories: { en: 'Included Accessories', ar: 'الإكسسوارات المرفقة' },
  quoteOrderViewDrawing: { en: 'View drawing', ar: 'عرض الرسم' },
  quoteOrderDrawingTitle: { en: 'Production drawing', ar: 'رسم الإنتاج' },
  quoteOrderOpenInBrowser: { en: 'Open in browser', ar: 'فتح في المتصفح' },
  quoteOrderDrawingAttached: { en: 'Drawing attached', ar: 'مرفق رسم' },
  quoteOrderScanDeducted: { en: 'Material stock updated for this order.', ar: 'تم تحديث مخزون المواد لهذا الطلب.' },
  quoteOrderScanFailed: { en: 'Scan failed', ar: 'فشل المسح' },
  quoteOrderFailed: { en: 'Failed', ar: 'فشل' },
  quoteOrderPauseServerStale: {
    en: 'Pause is not available on the server yet. Wait for the latest website deploy, then try again.',
    ar: 'إيقاف الطلب غير متاح على الخادم بعد. انتظر نشر الموقع الأحدث ثم حاول مرة أخرى.',
  },
  dashTitle: { en: 'Upholstery', ar: 'التنجيد' },
  dashCreate: { en: 'Create new item', ar: 'إنشاء قطعة جديدة' },
  dashCreateSub: {
    en: 'New seating → warehouse packet + labels',
    ar: 'مقعد جديد → حزمة مستودع + ملصقات',
  },
  dashStock: { en: 'Add Upholstery Stock', ar: 'إضافة مخزون تنجيد' },
  dashStockSub: {
    en: 'Search product → increase qty + labels',
    ar: 'بحث عن منتج → زيادة الكمية + ملصقات',
  },
  dashQuotes: { en: 'Quote orders', ar: 'طلبات عروض الأسعار' },
  dashQuotesSub: {
    en: 'Accept upholstery orders from the factory',
    ar: 'قبول طلبات التنجيد من المصنع',
  },
  dashUpholsteryQuoteOrders: { en: 'Orders', ar: 'الطلبات' },
  dashRepairs: { en: 'Repairs', ar: 'إصلاحات' },
  repairQueueEmpty: { en: 'No repair jobs in this queue.', ar: 'لا توجد إصلاحات في هذه القائمة.' },
  repairCompleteConfirm: {
    en: 'Stop the repair timer?',
    ar: 'إيقاف مؤقت الإصلاح؟',
  },
  repairCompleteFloor2Hint: {
    en: 'The repair joins the Delivery app Repairs queue (awaiting driver). Warehouse floors are not credited.',
    ar: 'ينضم الإصلاح إلى قائمة «الإصلاحات» في تطبيق التسليم (بانتظار السائق). لا يُزاد مخزون الطوابق.',
  },
  repairCompleteConfirmBtn: { en: 'Complete repair', ar: 'إنهاء الإصلاح' },
  repairDispositionPrompt: {
    en: 'Send repaired stock to Floor 1, or dispatch a delivery with driver signature?',
    ar: 'إرسال المخزون إلى الطابق 1، أم تسليم مع توقيع السائق؟',
  },
  repairDispositionFloor1: { en: 'Floor 1 stock', ar: 'مخزون الطابق 1' },
  repairDispositionDelivery: { en: 'Send delivery', ar: 'إرسال تسليم' },
  repairTimerStatus_ready: { en: 'Ready', ar: 'جاهز' },
  repairTimerStatus_running: { en: 'Running', ar: 'قيد التشغيل' },
  repairTimerStatus_paused: { en: 'Paused', ar: 'متوقف مؤقتاً' },
  repairTimerStatus_completed: { en: 'Done', ar: 'منتهي' },
  deliveryStatus_completedAwaiting: {
    en: 'Ready for delivery',
    ar: 'جاهز للتسليم',
  },
  dashUpholsteryQuoteOrdersSub: {
    en: 'Upholstery route — sent from Factory Orders',
    ar: 'مسار التنجيد — مرسلة من طلبات المصنع',
  },
  upholsteryQuotesTitle: { en: 'Orders', ar: 'الطلبات' },
  upholsteryQuotesIntro: {
    en: 'Factory orders routed to Upholstery. Accept, scan materials, then end when finished.',
    ar: 'طلبات المصنع الموجهة للتنجيد. اقبل، امسح المواد، ثم أنهِ عند الانتهاء.',
  },
  upholsteryQuotesEmpty: {
    en: 'No upholstery quote orders in the queue.',
    ar: 'لا طلبات تنجيد في قائمة الانتظار.',
  },
  upholsteryQuotesLoadFailed: { en: 'Could not load quote orders.', ar: 'تعذر تحميل طلبات العروض.' },
  dashCarpentryQuoteOrders: { en: 'Orders', ar: 'الطلبات' },
  dashCarpentryQuoteOrdersSub: {
    en: 'Carpentry route — sent from Factory Orders',
    ar: 'مسار النجارة — مرسلة من طلبات المصنع',
  },
  carpentryQuotesTitle: { en: 'Hassan Awad quote orders', ar: 'طلبات عروض حسن عوض' },
  carpentryQuotesIntro: {
    en: 'Quotes Hassan sends to production with route Carpentry. Accept, scan materials, then end when finished.',
    ar: 'عروض يرسلها حسن للإنتاج بمسار النجارة. قبول، مسح المواد، ثم إنهاء عند الانتهاء.',
  },
  carpentryQuotesEmpty: {
    en: 'No carpentry quote orders in the queue.',
    ar: 'لا طلبات نجارة في قائمة الانتظار.',
  },
  carpentryQuotesLoadFailed: { en: 'Could not load quote orders.', ar: 'تعذر تحميل طلبات العروض.' },
  carpentryQuoteAwaiting: { en: 'Awaiting accept', ar: 'بانتظار القبول' },
  carpentryQuoteInProduction: { en: 'In production', ar: 'قيد الإنتاج' },
  dashCarpentryTitle: { en: 'Carpentry', ar: 'الأثاث الخشبي' },
  dashDeliveryAppTitle: { en: 'Delivery', ar: 'تسليم' },
  dashDeliveryCatalogHint: {
    en: 'Same warehouse catalog as web /warehouse-products — factory stock including carpentry output.',
    ar: 'نفس كتالوج المستودع كصفحة warehouse-products — مخزون المصنع بما فيه إنتاج النجارة.',
  },
  dashManufacture: { en: 'Manufacture', ar: 'تصنيع' },
  dashManufactureSub: {
    en: 'Tap catalog product → deduct materials',
    ar: 'اختر منتجًا → خصم المواد',
  },
  floor2CreateSaved: {
    en: 'Saved on Warehouse Floor 2 with photo.',
    ar: 'تم الحفظ في الطابق 2 بالمستودع مع الصورة.',
  },
  manufactureTitle: { en: 'Manufacture', ar: 'تصنيع' },
  manufactureIntroFloor2: {
    en: 'In-stock raw WIP on Floor 2 only. Deduct qty here to upholster to finished stock. Storeroom BOM on Jobs / Orders (wrench).',
    ar: 'مواد خام متوفرة في Floor 2 فقط. خصم الكمية هنا للتنجيد إلى مخزون منتهٍ. مواد المستودع من المهام / الطلبات (مفتاح الربط).',
  },
  manufactureDeductTitle: { en: 'Deduct from Floor 2', ar: 'خصم من الطابق 2' },
  manufactureTabAll: { en: 'All', ar: 'الكل' },
  manufactureTabInStock: { en: 'In stock', ar: 'متوفر' },
  dashScanFloor2: { en: 'Scan Floor 2', ar: 'مسح Floor 2' },
  jobsFilter_all: { en: 'All', ar: 'الكل' },
  jobsFilter_quotes: { en: 'Orders', ar: 'الطلبات' },
  jobsFilter_floor2: { en: 'Floor 2', ar: 'الطابق 2' },
  jobsFilter_active: { en: 'In progress', ar: 'قيد التنفيذ' },
  jobFinishNoMaterialsHint: {
    en: 'No storeroom materials were recorded for this job.',
    ar: 'لم تُسجَّل مواد من المخزن لهذه المهمة.',
  },
  manufactureAddStockTitle: { en: 'Add to Floor 2 stock', ar: 'إضافة إلى مخزون الطابق 2' },
  manufactureAddStockDone: {
    en: 'Floor 2 stock updated.',
    ar: 'تم تحديث مخزون الطابق 2.',
  },
  manufactureScanBtn: { en: 'Scan', ar: 'مسح' },
  manufactureIntro: {
    en: 'Carpentry catalog (same flow as Upholstery Manufacture). Pick qty to open a job — Floor 2 stock is not reduced here. On Jobs: add storeroom materials (wrench), then Finish to deduct BOM from storerooms and add WIP qty on Warehouse Floor 2.',
    ar: 'كتالوج النجارة (نفس تدفق التصنيع في التنجيد). اختر الكمية لبدء مهمة — لا يُخصم من Floor 2 هنا. في المهام: أضف مواد المستودع (مفتاح الربط)، ثم إنهاء لخصم BOM وإضافة WIP على Warehouse Floor 2.',
  },
  manufactureJobOpened: {
    en: 'Production job started. Open Jobs to add materials and finish.',
    ar: 'تم بدء مهمة الإنتاج. افتح المهام لإضافة المواد والإنهاء.',
  },
  dashFinishing: { en: 'Finishing', ar: 'إنهاء' },
  finishingTitle: { en: 'Finishing', ar: 'إنهاء' },
  finishingIntro: {
    en: 'Unfinished carpentry on Warehouse Floor 2. Tap ×1 to finish — deducts Floor 2 and credits the same SKU on Warehouse Floor 1 (/warehouse-products) for storage and delivery.',
    ar: 'نجارة غير منتهية في Warehouse Floor 2. اضغط ×1 — يُخصم من Floor 2 ويُضاف نفس SKU إلى Floor 1 للتخزين والتسليم.',
  },
  finishingConfirmTitle: { en: 'Finish product', ar: 'إنهاء المنتج' },
  finishingConfirmBody: {
    en: 'Finish 1 × {name}? Moves from Warehouse Floor 2 (unfinished) to Floor 1 (finished stock).',
    ar: 'إنهاء 1 × {name}؟ ينقل من Floor 2 (غير منتهٍ) إلى Floor 1 (مخزون جاهز).',
  },
  finishingDone: {
    en: 'Done — finished stock is on Warehouse Floor 1. Ready for Send Delivery when needed.',
    ar: 'تم — المخزون الجاهز في Warehouse Floor 1.',
  },
  finishingFailed: { en: 'Finishing failed', ar: 'فشل الإنهاء' },
  finishingEmpty: {
    en: 'No unfinished stock on Floor 2. Use Manufacture first to build WIP on Floor 2.',
    ar: 'لا مخزون غير منتهٍ في Floor 2. استخدم التصنيع أولاً.',
  },
  finishingLoadFailed: { en: 'Could not load Floor 2 unfinished list.', ar: 'تعذر تحميل قائمة Floor 2.' },
  finishingTapHint: { en: 'Tap to finish ×1 → Floor 1', ar: 'اضغط للإنهاء ×1 → Floor 1' },
  finishingFloor2Qty: { en: 'Unfinished on Floor 2: {qty}', ar: 'غير منتهٍ في Floor 2: {qty}' },
  finishingNoStock: {
    en: 'No quantity left on Floor 2 for this product.',
    ar: 'لا كمية متبقية في Floor 2 لهذا المنتج.',
  },
  manufactureConfirmTitle: { en: 'Manufacture', ar: 'تصنيع' },
  manufactureConfirmBody: {
    en: 'Upholster {qty} × {name}? Deducts Floor 2 raw WIP only — record storeroom usage on a job or order.',
    ar: 'تنجيد {qty} × {name}؟ يخصم مواد Floor 2 الخام فقط — سجّل المستودع في مهمة أو طلب.',
  },
  manufactureDone: {
    en: 'Done — Floor 2 raw deducted; finished stock updated. Use the job wrench for storeroom materials.',
    ar: 'تم — خُصم خام Floor 2 وتم تحديث المخزون المنتهٍ. استخدم مفتاح المهمة لمواد المستودع.',
  },
  manufactureFailed: { en: 'Manufacture failed', ar: 'فشل التصنيع' },
  manufactureEmpty: {
    en: 'No carpentry catalog products yet. On the web, open Carpentry and add warehouse products with a BOM.',
    ar: 'لا منتجات في كتالوج النجارة بعد. على الويب، افتح Carpentry وأضف منتجات مستودع مع قائمة مواد.',
  },
  manufactureLoadFailed: { en: 'Could not load carpentry catalog.', ar: 'تعذر تحميل كتالوج النجارة.' },
  manufactureTapHint: { en: 'Tap to manufacture ×1', ar: 'اضغط للتصنيع ×1' },
  manufactureMaterialCount: {
    en: '{count} BOM line(s)',
    ar: '{count} سطر مواد',
  },
  manufactureNoMaterials: {
    en: 'No BOM — add materials on web Carpentry page',
    ar: 'لا قائمة مواد — أضف المواد في صفحة Carpentry',
  },
  manufactureUpholsteryIntro: {
    en: 'Products linked on web /upholstery with raw on Floor 2. Tap to set qty and begin production — stock and labels post when you finish the job.',
    ar: 'منتجات مرتبطة في صفحة التنجيد مع خام في الطابق 2. اضغط لتحديد الكمية وبدء الإنتاج — يُضاف المخزون والملصقات عند إنهاء المهمة.',
  },
  manufactureBeginHint: { en: 'Tap to begin production', ar: 'اضغط لبدء الإنتاج' },
  dashInProduction: { en: 'In production', ar: 'قيد الإنتاج' },
  upholsteryJobsTitle: { en: 'Jobs', ar: 'المهام' },
  upholsteryJobBegin: { en: 'Begin production', ar: 'بدء الإنتاج' },
  upholsteryJobQtyLabel: { en: 'Units (max {max} on Floor 2)', ar: 'الوحدات (حد أقصى {max} في الطابق 2)' },
  upholsteryJobIntro: {
    en: 'One product per job. Play starts the timer, pause holds it, stop finishes and sends ×1 to Warehouse Floor 1 (labels print when configured).',
    ar: 'منتج واحد لكل مهمة. تشغيل يبدأ المؤقت، إيقاف مؤقت يعلّقه، إيقاف ينهي المهمة ويُضيف ×1 إلى الطابق 1 (الملصقات عند التفعيل).',
  },
  upholsteryJobEmpty: {
    en: 'No active jobs. Begin production from Manufacture.',
    ar: 'لا مهام نشطة. ابدأ من «تصنيع».',
  },
  upholsteryJobLoadFailed: { en: 'Could not load jobs.', ar: 'تعذر تحميل المهام.' },
  upholsteryJobQtyBadge: { en: 'Job qty {qty}', ar: 'كمية المهمة {qty}' },
  upholsteryJobPause: { en: 'Pause timer', ar: 'إيقاف المؤقت مؤقتًا' },
  upholsteryJobResume: { en: 'Resume timer', ar: 'استئناف المؤقت' },
  upholsteryJobFinish: { en: 'Finish job', ar: 'إنهاء المهمة' },
  upholsteryJobFinishTitle: { en: 'Finish production?', ar: 'إنهاء الإنتاج؟' },
  upholsteryJobFinishBody: {
    en: 'Send 1 × {name} to Warehouse Floor 1 and close this job?',
    ar: 'إرسال 1 × {name} إلى الطابق 1 وإغلاق المهمة؟',
  },
  upholsteryJobControlsHint: {
    en: 'Play · Pause · Stop (complete → Floor 1)',
    ar: 'تشغيل · إيقاف مؤقت · إيقاف (إنهاء → الطابق 1)',
  },
  upholsteryUnitsCheckedLabel: {
    en: 'Units checked',
    ar: 'الوحدات المفعّلة',
  },
  upholsteryUnitTapHint: {
    en: 'Tap each unit when that piece is ready (Floor 2 batch jobs).',
    ar: 'اضغط كل وحدة عند جهوزية القطعة (دفعات الطابق 2).',
  },
  upholsteryJobFinishDone: {
    en: 'Done — Floor 1 updated and labels queued.',
    ar: 'تم — حُدّث الطابق 1 وأُرسلت الملصقات.',
  },
  upholsteryJobFinishHint: {
    en: 'Check every unit before finish.',
    ar: 'ضع علامة على كل وحدة قبل الإنهاء.',
  },
  upholsteryJobStatus_ready: { en: 'Ready', ar: 'جاهز' },
  upholsteryJobStatus_running: { en: 'Running', ar: 'يعمل' },
  upholsteryJobStatus_paused: { en: 'Paused', ar: 'متوقف مؤقتًا' },
  upholsteryJobStatus_completed: { en: 'Completed', ar: 'مكتمل' },
  upholsteryJobStatus_completedAwaitingDelivery: {
    en: 'Completed (Awaiting Delivery)',
    ar: 'مكتمل (بانتظار التسليم)',
  },
  dashPaintingTitle: { en: 'Painting', ar: 'دهان' },
  dashPainting: { en: 'Painting', ar: 'دهان' },
  paintingTitle: { en: 'Painting', ar: 'دهان' },
  paintingIntro: {
    en: 'Floor 2 products. Tap a product to enter the quantity to send to Painting.',
    ar: 'منتجات الطابق 2. اضغط على المنتج لإدخال الكمية المراد إرسالها للدهان.',
  },
  paintingSearch: { en: 'Search Floor 2 product or SKU…', ar: 'ابحث عن منتج الطابق 2 أو SKU…' },
  paintingScanBtn: { en: 'Scan', ar: 'مسح' },
  paintingSearchNoMatch: { en: 'No Floor 2 products match your search.', ar: 'لا توجد منتجات مطابقة للبحث في الطابق 2.' },
  paintingAvailableQty: { en: 'Available on Floor 2: {qty}', ar: 'المتوفر في الطابق 2: {qty}' },
  paintingConfirmTitle: { en: 'Send to Painting', ar: 'إرسال للدهان' },
  paintingConfirmBody: {
    en: 'Send {qty} × {name} from Floor 2 to Painting? (Available: {max})',
    ar: 'إرسال {qty} × {name} من الطابق 2 إلى الدهان؟ (المتوفر: {max})',
  },
  paintingQtyLabel: { en: 'Quantity to send (max {max})', ar: 'الكمية المرسلة (حد أقصى {max})' },
  paintingQtyExceedsStock: {
    en: 'Cannot send more than available Floor 2 stock ({max}).',
    ar: 'لا يمكن إرسال كمية أكبر من المتوفر في الطابق 2 ({max}).',
  },
  paintingDone: {
    en: 'Sent to Painting — Floor 2 stock deducted and painting job queued.',
    ar: 'تم الإرسال إلى الدهان — خُصم مخزون الطابق 2 وأُضيفت مهمة الدهان.',
  },
  paintingFailed: { en: 'Could not send to Painting', ar: 'تعذر الإرسال إلى الدهان' },
  carpentryJobsTitle: { en: 'Jobs', ar: 'المهام' },
  dashTileHint_create: {
    en: 'Create new carpentry items and add stock.',
    ar: 'إنشاء عناصر نجارة جديدة وإضافة المخزون.',
  },
  dashTileHint_manufacture: {
    en: 'Manufacture carpentry items and deduct storeroom BOM materials.',
    ar: 'تصنيع عناصر النجارة وخصم مواد المستودع.',
  },
  dashTileHint_jobs: {
    en: 'Active carpentry production jobs.',
    ar: 'مهام إنتاج النجارة النشطة.',
  },
  dashTileHint_painting: {
    en: 'Send Floor 2 products to the Painting department.',
    ar: 'إرسال منتجات الطابق 2 إلى قسم الدهان.',
  },
  dashTileHint_quotes: {
    en: 'Hassan quotation orders routed to Carpentry.',
    ar: 'طلبات عروض أسعار حسن الموجهة للنجارة.',
  },
  dashTileHint_repairs: {
    en: 'Carpentry return and repair queue.',
    ar: 'قائمة مرتجعات وإصلاحات النجارة.',
  },
  dashHintDismiss: { en: 'Tap outside to close', ar: 'اضغط خارج النافذة للإغلاق' },
  dashTileHint_paintingJobs: {
    en: 'Your painting queue — play/pause timer, stop when done to credit Warehouse Floor 1.',
    ar: 'قائمة الدهان — مؤقت تشغيل/إيقاف، Stop عند الانتهاء لإضافة Floor 1.',
  },
  hintJobPlay: {
    en: 'Start or resume the job timer (does not move stock).',
    ar: 'تشغيل أو استئناف المؤقت (لا يحرّك المخزون).',
  },
  hintJobPause: {
    en: 'Pause the timer — resume later with play.',
    ar: 'إيقاف المؤقت مؤقتًا — استأنف لاحقًا بتشغيل.',
  },
  hintJobFinish: {
    en: 'Stop and complete — credits finished qty to Warehouse Floor 1 when you confirm.',
    ar: 'إنهاء المهمة — يُضاف المخزون الجاهز إلى Floor 1 بعد التأكيد.',
  },
  hintJobCard: {
    en: 'Job in your queue. Long-press each button below for help; tap play, pause, or stop.',
    ar: 'مهمة في قائمتك. اضغط مطولًا على الأزرار للمساعدة؛ تشغيل، إيقاف، أو Stop.',
  },
  paintingJobsTitle: { en: 'Painting jobs', ar: 'مهام الدهان' },
  paintingJobFinishBody: {
    en: 'Finish {qty} × {name}? Credits Warehouse Floor 1 (/warehouse-products).',
    ar: 'إنهاء {qty} × {name}؟ يُضاف إلى Warehouse Floor 1.',
  },
  paintingJobFinishDone: {
    en: 'Done — finished stock is on Warehouse Floor 1.',
    ar: 'تم — المخزون الجاهز في Warehouse Floor 1.',
  },
  paintingJobEmpty: {
    en: 'No painting jobs yet. Carpentry sends WIP from Floor 2 using the Painting button.',
    ar: 'لا مهام دهان بعد. ترسل النجارة من Floor 2 عبر زر الدهان.',
  },
  paintingJobControlsHint: {
    en: 'Play · Pause · Stop (complete → Floor 1)',
    ar: 'تشغيل · إيقاف مؤقت · Stop (إنهاء → Floor 1)',
  },
  manufactureUpholsteryConfirmBody: {
    en: 'Finish 1 × {name}? Deducts raw from Warehouse Floor 2; {finished} credits Warehouse Floor 1.',
    ar: 'إنهاء 1 × {name}؟ يُخصم الخام من Floor 2 ويُضاف {finished} إلى Floor 1.',
  },
  manufactureUpholsteryDone: {
    en: 'Done — raw deducted and factory warehouse updated.',
    ar: 'تم — خُصم الخام وحدّث مخزون المصنع.',
  },
  manufactureUpholsteryEmpty: {
    en: 'No in-stock products on Floor 2 yet.',
    ar: 'لا توجد منتجات متوفرة في الطابق 2 بعد.',
  },
  manufactureUpholsteryLoadFailed: { en: 'Could not load manufacture list.', ar: 'تعذر تحميل قائمة التصنيع.' },
  manufactureRawQty: { en: 'Raw on Floor 2: {qty}', ar: 'الخام في الطابق 2: {qty}' },
  manufactureFinishedSku: { en: '→ {sku}', ar: '→ {sku}' },
  manufactureCardFloor2: { en: '{qty}', ar: '{qty}' },
  manufactureSameNameInlay: { en: '{count}', ar: '{count}' },
  manufactureInlayTitle: { en: 'Family — pick variant', ar: 'العائلة — اختر النوع' },
  manufactureInlayHint: { en: 'Tap a line to set job qty from Floor 2 stock.', ar: 'اضغط على سطر لتحديد كمية المهمة من مخزون الطابق 2.' },
  manufactureInlaySkuLine: { en: '{sku} · Floor 2: {qty}', ar: '{sku} · الطابق 2: {qty}' },
  manufactureSearch: { en: 'Search family name', ar: 'ابحث عن اسم العائلة' },
  manufactureSearchNoMatch: { en: 'No families match your search.', ar: 'لا عائلات مطابقة للبحث.' },
  manufactureQtyLabel: { en: 'Qty: {qty}', ar: 'الكمية: {qty}' },
  manufacturePhotoPromptTitle: { en: 'Product WIP Photo', ar: 'صورة المنتج (الطابق 2)' },
  manufacturePhotoChooseLibrary: { en: 'Import from gallery', ar: 'استيراد من المعرض' },
  manufacturePhotoUploadFailed: { en: 'Could not save photo.', ar: 'تعذر حفظ الصورة.' },
  dashManufactureUpholsterySub: {
    en: 'Finish raw carpentry frames → factory warehouse',
    ar: 'إنهاء الهياكل الخام → مستودع المصنع',
  },
  cancel: { en: 'Cancel', ar: 'إلغاء' },
  confirm: { en: 'Confirm', ar: 'تأكيد' },
  dashDelivery: { en: 'Send Delivery', ar: 'إرسال التسليم' },
  dashDeliverySub: {
    en: 'Truck delivery — driver checklist → Hassan',
    ar: 'تسليم بالشاحنة — قائمة السائق → حسن',
  },
  dashSentDeliveries: { en: 'Sent deliveries', ar: 'التسليمات المرسلة' },
  dashSentDeliveriesSub: {
    en: 'View note PDF · reprint one copy',
    ar: 'عرض المذكرة · إعادة طباعة نسخة واحدة',
  },
  sentDeliveriesTitle: { en: 'Sent deliveries', ar: 'التسليمات المرسلة' },
  sentDeliveriesEmpty: {
    en: 'No sent deliveries yet. Complete Send Delivery to see them here.',
    ar: 'لا توجد تسليمات مرسلة بعد. أكمل «توقيع التسليم» لتظهر هنا.',
  },
  sentDeliveriesLoadFailed: { en: 'Could not load deliveries.', ar: 'تعذر تحميل التسليمات.' },
  sentDeliveriesServerPending: {
    en: 'Server update pending — deliveries you send from this device will appear here after each successful submit.',
    ar: 'تحديث الخادم قيد الانتظار — التسليمات التي ترسلها من هذا الجهاز ستظهر هنا بعد كل إرسال ناجح.',
  },
  sentDeliveriesLocalHint: {
    en: 'Showing deliveries saved on this device. Pull to refresh after the server is updated for full history.',
    ar: 'عرض التسليمات المحفوظة على هذا الجهاز. اسحب للتحديث بعد تحديث الخادم للسجل الكامل.',
  },
  sentDeliveryStatusSubmitted: { en: 'Submitted', ar: 'مُرسَل' },
  sentDeliveryStatusCancelled: { en: 'Cancelled', ar: 'ملغى' },
  sentDeliveryStatusCompleted: { en: 'Completed', ar: 'مكتمل' },
  sentDeliveryStatusPartial: { en: 'Receiving', ar: 'قيد الاستلام' },
  sentDeliveryStatusOther: { en: 'In progress', ar: 'قيد المعالجة' },
  sentDeliveryDetailTitle: { en: 'Delivery note', ar: 'مذكرة التسليم' },
  sentDeliveryDriver: { en: 'Driver', ar: 'السائق' },
  sentDeliveryDispatchedBy: { en: 'Dispatched by', ar: 'أُرسل بواسطة' },
  sentDeliverySubmittedAt: { en: 'Submitted', ar: 'وقت الإرسال' },
  sentDeliveryViewPdf: { en: 'View PDF', ar: 'عرض PDF' },
  sentDeliveryPrintOne: { en: 'Print (1 copy)', ar: 'طباعة (نسخة واحدة)' },
  sentDeliveryOpenFailed: { en: 'Could not open PDF.', ar: 'تعذر فتح PDF.' },
  deliveryPrintReprintTitle: { en: 'Reprint delivery note (1 copy)', ar: 'إعادة طباعة المذكرة (نسخة واحدة)' },
  deliveryPrintReprintHint: {
    en: 'This reprint includes one copy only. Use Retry if nothing prints.',
    ar: 'تتضمن إعادة الطباعة نسخة واحدة فقط. استخدم إعادة الطباعة إذا لم تطبع الصفحة.',
  },
  deliveryTitle: { en: 'Send Delivery', ar: 'إرسال التسليم' },
  deliveryAddProductTitle: { en: 'Add product', ar: 'إضافة منتج' },
  deliverySentTitle: { en: 'Sent', ar: 'تم الإرسال' },
  deliverySubtitle: {
    en: 'Floor 1 only · Truck loads /warehouse-products scope',
    ar: 'Floor 1 فقط · نطاق warehouse-products للشاحنات',
  },
  deliveryScopeHint: {
    en: 'Finished goods, sets, and warehouse packets — not Floor 2 WIP.',
    ar: 'منتجات نهائية ومجموعات وحزم المستودع — وليس WIP في Floor 2.',
  },
  deliveryDriver: { en: 'Driver', ar: 'السائق' },
  deliveryCustomerDriver: { en: 'Customer driver', ar: 'سائق العميل' },
  deliveryCustomerDriverHint: { en: 'Tap + to enter name and phone (or pick a fleet driver below).', ar: 'اضغط + لإدخال الاسم والهاتف (أو اختر سائق الأسطول أدناه).' },
  deliveryCustomerDriverAdd: { en: 'Customer driver', ar: 'سائق العميل' },
  deliveryCustomerDriverNamePh: { en: 'Driver name', ar: 'اسم السائق' },
  deliveryCustomerDriverPhonePh: { en: 'Phone number', ar: 'رقم الهاتف' },
  deliveryDriverEitherOr: { en: 'Choose either a fleet driver or a customer driver — not both.', ar: 'اختر سائق الأسطول أو سائق العميل — وليس كليهما.' },
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
  deliverySendBtn: { en: 'Send Delivery', ar: 'إرسال التسليم' },
  deliverySignFlowHint: {
    en: 'Add products to the cart, then tap Send Delivery. On the next screen choose the driver, collect the signature, then send and print.',
    ar: 'أضف المنتجات إلى السلة، ثم اضغط «إرسال التسليم». في الشاشة التالية اختر السائق، ثم التوقيع، ثم الإرسال والطباعة.',
  },
  deliveryLabelPrintTitle: { en: 'Print warehouse label', ar: 'طباعة ملصق المستودع' },
  deliveryLabelPrintQty: { en: 'Label copies', ar: 'عدد الملصقات' },
  deliveryLabelPrintSubmit: { en: 'Print labels', ar: 'طباعة الملصقات' },
  deliveryLabelPrintFailed: { en: 'Label print failed.', ar: 'فشلت طباعة الملصق.' },
  deliveryLabelPrintA11y: { en: 'Print label', ar: 'طباعة ملصق' },
  deliverySignatureTitle: { en: 'Driver signature', ar: 'توقيع السائق' },
  deliverySignatureHint: {
    en: 'Driver signs with finger in the box. Dots and taps are not accepted.',
    ar: 'يوقع السائق بإصبعه داخل المربع. النقاط والنقرات غير مقبولة.',
  },
  deliverySignatureClear: { en: 'Clear signature', ar: 'مسح التوقيع' },
  deliverySignatureInvalid: {
    en: 'Draw a full signature (not just a dot).',
    ar: 'ارسم توقيعًا كاملًا (وليس نقطة فقط).',
  },
  deliverySendConfirmBtn: { en: 'Send delivery & print', ar: 'إرسال التسليم والطباعة' },
  deliverySessionFailed: { en: 'Could not start delivery session.', ar: 'تعذر بدء جلسة التسليم.' },
  deliveryNeedProduct: { en: 'Add at least one product.', ar: 'أضف منتجًا واحدًا على الأقل.' },
  deliveryNeedDriver: { en: 'Select a driver.', ar: 'اختر السائق.' },
  deliverySubmitFailed: { en: 'Submit failed.', ar: 'فشل الإرسال.' },
  deliverySignatureCaptureFailed: {
    en: 'Could not capture the signature. Clear and sign again.',
    ar: 'تعذر التقاط التوقيع. امسح التوقيع ووقّع مرة أخرى.',
  },
  deliverySubmitApiNotDeployed: {
    en: 'Server update required for delivery submit. Try again after the backend is deployed.',
    ar: 'يلزم تحديث الخادم لإرسال التسليم. أعد المحاولة بعد نشر الخادم.',
  },
  deliveryPrintNoLines: {
    en: 'Nothing to print on this delivery note.',
    ar: 'لا يوجد محتوى للطباعة في هذه المذكرة.',
  },
  deliverySearchPlaceholder: { en: 'Search name or product SKU…', ar: 'ابحث بالاسم أو SKU المنتج…' },
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
  deliveryPrintTitleCopies: {
    en: 'Print delivery note — {n} copies',
    ar: 'طباعة مذكرة التسليم — {n} نسخ',
  },
  deliveryPrintHint: {
    en: 'Choose your Canon MF237w (or any printer). The PDF already contains two full copies — set Copies to 1 in the print dialog unless you need more.',
    ar: 'اختر طابعة Canon MF237w (أو أي طابعة). الملف يحتوي نسختين — اترك «النسخ» = 1 في حوار الطباعة.',
  },
  deliveryPrintAutoHint: {
    en: 'Android print opens automatically. Pick the warehouse printer (Ethernet Canon on the same Wi‑Fi). The file includes 2 copies; leave Copies at 1.',
    ar: 'تفتح طباعة Android تلقائياً. اختر طابعة المستودع (Canon على Ethernet مع نفس Wi‑Fi). الملف فيه نسختان — اترك النسخ = 1.',
  },
  deliveryPrintBusy: { en: 'Preparing print…', ar: 'جاري التحضير للطباعة…' },
  deliveryPrintRescan: { en: 'Search again', ar: 'بحث مرة أخرى' },
  deliveryPrintSystemPicker: { en: 'Choose printer (system list)', ar: 'اختر الطابعة (قائمة النظام)' },
  deliveryPrintRetry: { en: 'Retry print', ar: 'إعادة الطباعة' },
  deliveryPrintRetryHint: {
    en: 'If printing timed out (1 minute) or nothing came out, check printer Wi‑Fi/Ethernet then tap Retry.',
    ar: 'إذا انتهت مهلة الطباعة (دقيقة واحدة) أو لم تخرج نسخة، تحقق من اتصال الطابعة ثم اضغط إعادة المحاولة.',
  },
  deliveryPrintSkip: { en: 'Skip printing', ar: 'تخطي الطباعة' },
  deliveryPrintNoPrinters: {
    en: 'No network printers found. Tap “Choose printer” and select Canon MF237w (add it once in Android Settings → Printing).',
    ar: 'لم تُعثر على طابعات. اضغط «اختر الطابعة» واختر Canon MF237w (أضفها مرة في إعدادات Android → الطباعة).',
  },
  deliveryPrintDiscoveryUnavailable: {
    en: 'Network printer search needs the Production APK (not Expo Go). You can still use the system printer list.',
    ar: 'بحث الطابعات يتطلب تطبيق Production (ليس Expo Go). يمكنك استخدام قائمة النظام.',
  },
  deliveryPrintScanFailed: { en: 'Printer search failed.', ar: 'فشل البحث عن الطابعات.' },
  deliveryPrintTimeoutError: {
    en: 'Print timed out after 1 minute due to connectivity. Please check your printer connection and tap Retry.',
    ar: 'انتهت مهلة الطباعة بعد دقيقة واحدة بسبب الاتصال. يرجى التحقق من اتصال الطابعة والضغط على إعادة المحاولة.',
  },
  deliveryPrintFailed: { en: 'Print failed. Please check printer connectivity and tap Retry.', ar: 'فشلت الطباعة. يرجى التحقق من اتصال الطابعة والضغط على إعادة المحاولة.' },
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
  deliveryScanNotInWarehouse: {
    en: 'Not on Warehouse Floor 1 (/warehouse-products). Finish on Floor 2 (carpentry/upholstery) and stock on Floor 1 before Send Delivery.',
    ar: 'غير موجود في Warehouse Floor 1 (warehouse-products). أنهِ في Floor 2 ثم خزّن في Floor 1 قبل الإرسال.',
  },
  deliveryScanProductSkuUseCarton: {
    en: 'That is the product SKU — scan a carton (packet) barcode on the label, not the main product code.',
    ar: 'هذا SKU المنتج — امسح باركود الطرد على الملصق وليس رمز المنتج الرئيسي.',
  },
  deliveryNoPacketLines: {
    en: 'No packet cartons are linked to this product. Add packet BOM on Warehouse Products, then try again.',
    ar: 'لا طرود مرتبطة بهذا المنتج. أضف BOM على منتجات المستودع ثم أعد المحاولة.',
  },
  deliveryIncompleteBom: {
    en: 'Packet BOM is incomplete (carton count ≠ packet count). Fix on Warehouse Products before delivery.',
    ar: 'BOM الطرود غير مكتمل. صحّحه في منتجات المستودع قبل الإرسال.',
  },
  deliveryFinishedUnitsTick: {
    en: 'Confirm finished units on the truck',
    ar: 'تأكيد الوحدات الجاهزة على الشاحنة',
  },
  deliveryFinishedUnitLine: {
    en: '{name} — {req} unit(s) on truck',
    ar: '{name} — {req} وحدة على الشاحنة',
  },
  deliveryFinishedConfirmRequired: {
    en: 'Tick the confirmation box for {name} before adding or sending.',
    ar: 'ضع علامة على تأكيد {name} قبل الإضافة أو الإرسال.',
  },
  stockTitle: { en: 'Add Upholstery Stock', ar: 'إضافة مخزون تنجيد' },
  stockSearch: { en: 'Search name or scan barcode', ar: 'ابحث بالاسم أو امسح الباركود' },
  keyboardBtn: { en: 'Keyboard', ar: 'لوحة المفاتيح' },
  stockQrBtn: { en: 'QR', ar: 'QR' },
  stockQrTitle: { en: 'Scan QR or barcode', ar: 'مسح QR أو الباركود' },
  stockQrHint: {
    en: 'Hold steady and align the barcode with the red line in the centre of the camera.',
    ar: 'ثبّت الهاتف ومحِّ الباركود مع الخط الأحمر في منتصف الكاميرا.',
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
  stockEmptyList: {
    en: 'No products assigned on web Upholstery yet.',
    ar: 'لا توجد منتجات معيّنة في صفحة التنجيد على البوابة بعد.',
  },
  stockNotEligible: {
    en: 'Not on the Upholstery catalog. Add this product on the web Upholstery page first (finished product, no packet BOM).',
    ar: 'المنتج غير مدرج في قائمة التنجيد. أضفه أولاً من صفحة التنجيد على البوابة (منتج جاهز بدون طرود).',
  },
  stockSearchHint: {
    en: 'Tap a product below, or search / scan to filter.',
    ar: 'اختر منتجاً أدناه، أو ابحث / امسح للتصفية.',
  },
  stockTapAdd: { en: 'Tap to add stock', ar: 'اضغط لإضافة مخزون' },
  back: { en: 'Back', ar: 'رجوع' },
  labelPreviewTitle: { en: 'Label preview', ar: 'معاينة الملصق' },
  labelPreviewSent: { en: 'Sent to printer (preview below).', ar: 'أُرسل إلى الطابعة (معاينة أدناه).' },
  labelPreviewNotPrinted: {
    en: 'Preview only — labels were not printed. Fix Zebra settings on the server, then save again or reprint from the web.',
    ar: 'معاينة فقط — لم تُطبع الملصقات. صحّح إعدادات Zebra على الخادم ثم أعد المحاولة.',
  },
  labelPreviewCopies: { en: '{n} copies sent to printer.', ar: 'أُرسل {n} نسخ إلى الطابعة.' },
  labelPreviewDone: { en: 'Done', ar: 'تم' },
  dashReturns: { en: 'Returns', ar: 'المرتجعات' },
  dashSold: { en: 'Sold', ar: 'مباع' },
  soldOrdersTitle: { en: 'Sold — warehouse storage', ar: 'مباع — مخزن' },
  soldEmpty: { en: 'No sold items in factory storage.', ar: 'لا توجد عناصر مباعة في المخزن.' },
  soldLoadFailed: { en: 'Could not load sold items.', ar: 'تعذر تحميل العناصر المباعة.' },
  soldReceipt: { en: 'Receipt', ar: 'الإيصال' },
  soldDetailTitle: { en: 'Sold item', ar: 'عنصر مباع' },
  soldQty: { en: 'Qty in warehouse', ar: 'الكمية في المخزن' },
  soldDeliver: { en: 'Deliver', ar: 'تسليم' },
  soldDeliverFailed: { en: 'Delivery failed.', ar: 'فشل التسليم.' },
  soldDeliverTitle: { en: 'Sold delivery — sign', ar: 'تسليم مباع — التوقيع' },
  soldDeliverDoneTitle: { en: 'Sold delivery sent', ar: 'تم إرسال تسليم المباع' },
  soldPrintTitleCopies: {
    en: 'Print sold delivery note — {n} copies',
    ar: 'طباعة مذكرة تسليم المباع — {n} نسخ',
  },
  returnCustomerNote: { en: 'Customer note', ar: 'مذكرة العميل' },
  returnCustomerNoteTitle: { en: 'Customer delivery note', ar: 'مذكرة تسليم العميل' },
  loading: { en: 'Loading…', ar: 'جاري التحميل…' },
  returnOrdersTitle: { en: 'Return orders', ar: 'طلبات المرتجعات' },
  returnLoadFailed: { en: 'Failed to load returns.', ar: 'تعذر تحميل المرتجعات.' },
  returnEmpty: { en: 'No return orders yet.', ar: 'لا توجد طلبات مرتجعات بعد.' },
  returnRefresh: { en: 'Refresh', ar: 'تحديث' },
  returnReason: { en: 'Reason', ar: 'السبب' },
  returnCustomer: { en: 'Customer', ar: 'العميل' },
  returnLeather: { en: 'Leather', ar: 'الجلد' },
  returnTimerRunning: { en: '(running)', ar: '(قيد التنفيذ)' },
  returnAccept: { en: 'Accept', ar: 'قبول' },
  returnComplete: { en: 'Complete', ar: 'إكمال' },
  returnShip: { en: 'Ship return', ar: 'شحن المرتجع' },
  returnCustomerLabel: { en: 'Customer label', ar: 'ملصق العميل' },
  returnAcceptFailed: { en: 'Accept failed.', ar: 'فشل القبول.' },
  returnCompleteFailed: { en: 'Could not complete return.', ar: 'تعذر إكمال المرتجع.' },
  returnShipFailed: { en: 'Could not start return shipment.', ar: 'تعذر بدء شحن المرتجع.' },
  returnLabelFailed: { en: 'Customer label print failed.', ar: 'فشلت طباعة ملصق العميل.' },
  returnCompleteTitle: { en: 'Complete return', ar: 'إكمال المرتجع' },
  returnShipTitle: { en: 'Ship return', ar: 'شحن المرتجع' },
  returnSignSubmit: { en: 'Sign & submit', ar: 'توقيع وإرسال' },
  returnDrawSignature: { en: 'Draw driver signature.', ar: 'ارسم توقيع السائق.' },
  returnSavedTitle: { en: 'Return saved', ar: 'تم حفظ المرتجع' },
  returnNoteReady: { en: 'Return note ready', ar: 'مذكرة المرتجع جاهزة' },
  returnPrintNote: { en: 'Print return note', ar: 'طباعة مذكرة المرتجع' },
  returnPrintTitleCopies: {
    en: 'Print return note — {n} copies',
    ar: 'طباعة مذكرة المرتجع — {n} نسخ',
  },
  returnPrintRetryHint: {
    en: 'Nothing came out of the printer? Tap Retry to open the print dialog again with the same return note.',
    ar: 'لم تخرج أي نسخة؟ اضغط إعادة المحاولة لفتح الطباعة بنفس مذكرة المرتجع.',
  },
  returnServerNotDeployed: {
    en: 'Returns are not on the server yet. Deploy the latest portal API (warehouse-mobile return ops), then tap Refresh.',
    ar: 'المرتجعات غير متوفرة على الخادم بعد. انشر آخر تحديث للبوابة ثم اضغط تحديث.',
  },
  signedInAs: { en: 'Signed in as {email}', ar: 'مسجّل الدخول كـ {email}' },
  notSignedIn: { en: 'Not signed in', ar: 'غير مسجّل الدخول' },
  loadWarehouseFailed: { en: 'Failed to load warehouse', ar: 'تعذر تحميل المستودع' },
  locationWarehouse: { en: 'Warehouse', ar: 'المستودع' },
  locationWarehouseFloor2: { en: 'Warehouse Floor 2', ar: 'الطابق 2 في المستودع' },
  storeroomDeductTitle: { en: 'Deduct materials from', ar: 'خصم المواد من' },
  storeroomDeductPickHint: {
    en: 'You must select Storeroom 1, 2, or 3. Materials are deducted only from that storeroom.',
    ar: 'يجب اختيار مستودع 1 أو 2 أو 3. يُخصم فقط من المستودع المحدد.',
  },
  storeroomDeductConfirmHint: {
    en: 'Confirm deducting job materials from:',
    ar: 'تأكيد خصم مواد المهمة من:',
  },
  storeroomDeductNoStock: {
    en: 'This material is not in stock at any storeroom for this SKU.',
    ar: 'لا يوجد مخزون لهذه المادة في أي مستودع لهذا الرمز.',
  },
  storeroomDeductNoList: {
    en: 'Storerooms could not be loaded. Close and try again, or check your connection.',
    ar: 'تعذر تحميل المستودعات. أغلق وحاول مرة أخرى أو تحقق من الاتصال.',
  },
  saveFailedGeneric: { en: 'Save failed.', ar: 'فشل الحفظ.' },
  saveFailedConnection: {
    en: 'Save failed. Check your connection and try again.',
    ar: 'فشل الحفظ. تحقق من الاتصال ثم أعد المحاولة.',
  },
  createSaveDataLost: {
    en: 'Save data was lost. Tap Save production item again.',
    ar: 'فُقدت بيانات الحفظ. اضغط حفظ عنصر الإنتاج مرة أخرى.',
  },
  materialsSearch: { en: 'Search material', ar: 'ابحث عن مادة' },
  materialsStoreroomOnHand: {
    en: 'In this storeroom: {qty}',
    ar: 'في هذا المستودع: {qty}',
  },
  materialsTotalOnHand: {
    en: 'Total in all storerooms: {qty}',
    ar: 'الإجمالي في كل المستودعات: {qty}',
  },
  jobMaterialsExpand: { en: 'Materials ({count})', ar: 'المواد ({count})' },
  materialsLoadFailed: { en: 'Failed to load storeroom materials', ar: 'تعذر تحميل مواد المخزن' },
  materialsUomLabel: { en: 'UOM', ar: 'وحدة القياس' },
  manufactureEmptyNoStock: {
    en: 'No products currently in stock.',
    ar: 'لا توجد منتجات متوفرة حالياً.',
  },
  paintingNoneAvailable: {
    en: 'This product has no quantity in stock.',
    ar: 'هذا المنتج بلا كمية متوفرة.',
  },
  paintingQtyExceedsAvailable: {
    en: 'Cannot use more than available stock ({max}).',
    ar: 'لا يمكن استخدام كمية أكبر من المتوفر ({max}).',
  },
  repairUnitIndex: { en: 'unit {index}/{total}', ar: 'وحدة {index}/{total}' },
  loginGoogle: { en: 'Continue with Google', ar: 'المتابعة عبر جوجل' },
  loginGoogleNotConfigured: {
    en: 'Google sign-in is not configured for this build.',
    ar: 'تسجيل الدخول عبر جوجل غير معدّ لهذا الإصدار.',
  },
  loginNotAllowed: { en: 'Login not allowed.', ar: 'الدخول غير مسموح.' },
  loginFailed: { en: 'Sign in failed', ar: 'فشل تسجيل الدخول' },
  photoReadFailed: { en: 'Could not read the photo. Try again.', ar: 'تعذر قراءة الصورة. حاول مرة أخرى.' },
  photoTakeFailed: { en: 'Could not take photo.', ar: 'تعذر التقاط الصورة.' },
  closeCamera: { en: 'Close camera', ar: 'إغلاق الكاميرا' },
  closeQrScanner: { en: 'Close scanner', ar: 'إغلاق الماسح' },
};

const PRESET_I18N = {
  '3 Seater': 'preset3Seater',
  '2 Seater': 'preset2Seater',
  'Single Seater': 'presetSingleSeater',
  'Lounge Chair': 'presetLounge',
  Curtains: 'presetCurtains',
  Pillows: 'presetPillows',
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

const presetAutoArCache = new Map();

/** Fetch Arabic display strings for presets (built-in + MyMemory for new portal labels). */
export async function prefetchPresetArabicLabels(presets) {
  const unique = [
    ...new Set(
      (presets || [])
        .map((raw) => String(raw || '').trim())
        .filter(Boolean),
    ),
  ];
  const out = {};
  await Promise.all(
    unique.map(async (label) => {
      const key = PRESET_I18N[label];
      if (key) {
        out[label] = tUi(key, 'ar');
        return;
      }
      if (presetAutoArCache.has(label)) {
        out[label] = presetAutoArCache.get(label);
        return;
      }
      const ar = await translateEnToAr(label);
      presetAutoArCache.set(label, ar);
      out[label] = ar;
    }),
  );
  return out;
}

export function presetLabel(preset, locale, autoArByPreset = null) {
  const p = String(preset || '').trim();
  if (!p) return '';
  const key = PRESET_I18N[p];
  if (key) return coalesceDisplayText(tUi(key, locale), p);
  if (locale === 'ar') {
    if (autoArByPreset && autoArByPreset[p]) return coalesceDisplayText(autoArByPreset[p], p);
    if (presetAutoArCache.has(p)) return coalesceDisplayText(presetAutoArCache.get(p), p);
  }
  return p;
}

export function tUi(key, locale) {
  const row = UI_STRINGS[key];
  if (!row) return coalesceDisplayText(key, '');
  const localized = row[locale === 'ar' ? 'ar' : 'en'];
  const fallback = row.en ?? row.ar ?? key;
  return coalesceDisplayText(
    localized ?? fallback,
    coalesceDisplayText(fallback, coalesceDisplayText(key, '')),
  );
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
