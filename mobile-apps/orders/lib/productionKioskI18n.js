function coalesceDisplayText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = String(value);
  return text || fallback;
}

export const textForDisplay = coalesceDisplayText;

const UI_STRINGS = {
  translateToggle: { en: 'عربي', ar: 'English' },
  dashTitle: { en: 'Orders', ar: 'الطلبات' },
  loginHintBoth: { en: 'Sign in with Google or email to open Orders.', ar: 'سجّل الدخول بجوجل أو البريد لفتح الطلبات.' },
  loginHintGoogle: { en: 'Sign in with Google to open Orders.', ar: 'سجّل الدخول بجوجل لفتح الطلبات.' },
  loginEmail: { en: 'Email', ar: 'البريد' },
  loginPassword: { en: 'Password', ar: 'كلمة المرور' },
  loginButton: { en: 'Sign in', ar: 'دخول' },
  loginSigningIn: { en: 'Signing in…', ar: 'جاري الدخول…' },
  loginGoogle: { en: 'Continue with Google', ar: 'المتابعة مع جوجل' },
  loginGoogleNotConfigured: { en: 'Google sign-in is not configured for this build.', ar: 'تسجيل جوجل غير مضبوط.' },
  loginNotAllowed: { en: 'Login not allowed.', ar: 'الدخول غير مسموح.' },
  loginFailed: { en: 'Sign in failed', ar: 'فشل تسجيل الدخول' },
  accessDenied: { en: 'Orders access is off in User Access.', ar: 'صلاحية الطلبات متوقفة في صلاحيات المستخدم.' },
  retryAccess: { en: 'Check access', ar: 'تحقق من الصلاحية' },
  back: { en: 'Back', ar: 'رجوع' },
  dashHintDismiss: { en: 'Tap anywhere to close', ar: 'اضغط في أي مكان للإغلاق' },
  tileCustomers: { en: 'Customers', ar: 'العملاء' },
  tileProducts: { en: 'Products', ar: 'المنتجات' },
  tileNewOrder: { en: 'New Order', ar: 'طلب جديد' },
  tileOrders: { en: 'Orders', ar: 'الطلبات' },
  tileDeliveries: { en: 'Deliveries', ar: 'التوصيل' },
  tileRepairs: { en: 'Repairs', ar: 'الإصلاحات' },
  tileStorage: { en: 'Storage', ar: 'التخزين' },
  tileTracking: { en: 'Tracking', ar: 'التتبع' },
  loadFailed: { en: 'Could not load.', ar: 'تعذر التحميل.' },
  empty: { en: 'Nothing here yet.', ar: 'لا يوجد شيء بعد.' },
  save: { en: 'Save', ar: 'حفظ' },
  saving: { en: 'Saving…', ar: 'جاري الحفظ…' },
  add: { en: 'Add', ar: 'إضافة' },
  search: { en: 'Search', ar: 'بحث' },
  name: { en: 'Name', ar: 'الاسم' },
  phone: { en: 'Phone', ar: 'الهاتف' },
  price: { en: 'Price', ar: 'السعر' },
  qty: { en: 'Qty', ar: 'الكمية' },
  customer: { en: 'Customer', ar: 'العميل' },
  product: { en: 'Product', ar: 'المنتج' },
  wood: { en: 'Wood', ar: 'الخشب' },
  color: { en: 'Color', ar: 'اللون' },
  sendProduction: { en: 'Send to production', ar: 'إرسال للإنتاج' },
  routeCarpentry: { en: 'Carpentry', ar: 'النجارة' },
  routeUpholstery: { en: 'Upholstery', ar: 'التنجيد' },
  chooseCustomer: { en: 'Choose customer', ar: 'اختر العميل' },
  addLine: { en: 'Add product', ar: 'إضافة منتج' },
  saved: { en: 'Saved', ar: 'تم الحفظ' },
};

export function tUi(key, locale = 'en') {
  const row = UI_STRINGS[key];
  if (!row) return key;
  return locale === 'ar' ? (row.ar || row.en) : (row.en || row.ar);
}
