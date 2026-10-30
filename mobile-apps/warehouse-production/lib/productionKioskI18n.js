/** Keep in sync with src/utils/productionKioskI18n.js */

const UI_STRINGS = {
  pageTitle: { en: 'Production', ar: 'الإنتاج' },
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
    en: 'Nothing came out of the printer? Tap Retry to open the print dialog again with the same delivery note.',
    ar: 'لم تطبع الصفحة؟ اضغط إعادة الطباعة لفتح حوار الطباعة مرة أخرى بنفس المذكرة.',
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
  deliveryScanProductSkuUseCarton: {
    en: 'That is the product SKU — scan a carton (packet) barcode on the label, not the main product code.',
    ar: 'هذا SKU المنتج — امسح باركود الطرد على الملصق وليس رمز المنتج الرئيسي.',
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
    ar: 'المرتجعات غير متوفرة على الخادم بعد. انشر آخر تحديث للبوابة (عمليات warehouse-mobile للمرتجعات) ثم اضغط تحديث.',
  },
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
