import { getGeminiApiKey } from './geminiImageEmbedding.js';

const MODEL = 'gemini-2.0-flash';

export const STATIC_ARABIC_DICTIONARY = Object.freeze({
  // Wood options
  Laminated: 'لامينيت (خشب مغلف)',
  Rosewood: 'خشب الورد',
  Mukwa: 'خشب موكوا',
  Hardwood: 'خشب صلب',
  'Sprayed Wood': 'خشب مرشوش',
  'Melamine Wood': 'خشب ميلامين',
  MDF: 'خشب إم دي إف (MDF)',

  // Kitchen Units accessories
  Granite: 'جرانيت',
  'Quartz Countertop': 'سطح كوارتز',
  'Marble Countertop': 'سطح رخام',
  Sink: 'حوض مطبخ',
  'Double Bowl Sink': 'حوض مطبخ مزدوج',
  Mixer: 'خلاط مياه',
  'Pull-Out Spray Mixer': 'خلاط مياه بسحاب',
  'Soft-Close Hinges': 'مفصلات إغلاق ناعم (هيدروليك)',
  'Soft-Close Drawer Runners': 'مجاري أدراج إغلاق ناعم',
  'Cabinet Handles / Knobs': 'مقابض خزائن',
  'Cutlery Tray': 'منظم ملاعق وسكاكين',
  'Spice Rack Pull-Out': 'رف توابل سحاب',
  'Corner Carousel / Magic Corner': 'سلة زاوية دوارة (ماجيك كورنر)',
  'Dish Rack Insert': 'حامل أطباق داخلي',
  'Pull-Out Waste Bin': 'سلة مهملات سحاب',
  'Plinth / Kickboard': 'نعلة سفلية للخزائن (وزرة)',
  'Under-Cabinet LED Strip': 'إضاءة LED أسفل الخزائن',
  'Gas Struts / Lift-Up Stay': 'مساعدات غاز للرفع (باكم)',

  // Doors accessories
  'Door Lock Set': 'طقم قفل باب',
  'Mortise Lock & Cylinder': 'كالون وسلندر باب',
  'Door Handle Set': 'طقم مقبض باب',
  'Flush Pull Handle': 'مقبض غاطس',
  'Heavy-Duty Hinges': 'مفصلات خدمة شاقة',
  'Concealed Hinges': 'مفصلات مخفية',
  'Door Closer': 'دفاش باب هيدروليك',
  'Door Stopper': 'مصد باب',
  'Tower Bolt / Flush Bolt': 'ترباس باب',
  'Peephole / Door Viewer': 'عين سحرية للباب',
  'Weather Strip / Seal': 'ربل عزل للباب',
  'Architrave / Door Frame Trim': 'برواز / حلق الباب',

  // Beds accessories
  'Orthopedic Slats / Base': 'ألواح قاعدة سرير طبية',
  'Hydraulic Storage Lift Mechanism': 'ميكانيزم رفع هيدروليك للتخزين',
  'Under-Bed Storage Drawers': 'أدراج تخزين أسفل السرير',
  'Upholstered Headboard Cushion': 'وسادة ظهر سرير منجدة',
  'Bedside Reading Light': 'إضاءة قراءة جانبية للسرير',
  'Built-In USB / Power Socket': 'مقبس كهرباء و USB مدمج',
  'Mattress Support Center Rail': 'عارضة دعم وسطية للمرتبة',
  'Bedside Floating Shelf': 'رف جانبي عائم للسرير',

  // Dining Tables accessories
  'Tempered Glass Top': 'سطح زجاج مقوى (سيكوريت)',
  'Marble / Granite Table Top': 'سطح طاولة رخام / جرانيت',
  'Extension Leaf Mechanism': 'ميكانيزم تمديد الطاولة',
  'Lazy Susan Turntable': 'قرص دوار للطاولة',
  'Metal / Brass Leg Caps': 'أغطية أرجل معدنية / نحاسية',
  'Adjustable Floor Glides': 'رجلاشات أرجل قابلة للتعديل',

  // Dining Chairs accessories
  'Upholstered Seat Pad': 'قاعدة مقعد منجدة',
  'Fabric / Leather Seat Cover': 'غطاء مقعد قماش / جلد',
  'Felt Floor Protectors': 'لباد حماية للأرضيات',
  'Brass / Chrome Footrest Trim': 'حلية مسند قدم نحاس / كروم',
  'Armrest Pads': 'مساند أذرع مبطنة',

  // Buffets & Buffet Mirrors
  'Beveled Mirror Glass': 'زجاج مرآة مشطوف الحواف',
  'LED Backlight Strip': 'شريط إضاءة خلفية LED',
  'Glass Shelves': 'أرفف زجاجية',
  'Wine / Stemware Rack Insert': 'حامل كؤوس وزجاجات',
  'Push-to-Open Latches': 'كباس فتح بالضغط (بوش)',
  'Soft-Close Buffet Hinges & Runners': 'مفصلات ومجاري بوفيه إغلاق ناعم',
  'Heavy-Duty Wall Mounting Brackets': 'حوامل تثبيت جدارية قوية',

  // Dresser Tables & Mirrors
  'Hollywood LED Mirror Bulbs': 'لمبات مرآة هوليوود LED',
  'Touch-Sensor LED Mirror Light': 'إضاءة مرآة LED تعمل باللمس',
  'Velvet Jewelry Tray Insert': 'منظم مجوهرات قطيفة للدرج',
  'Cosmetic Drawer Dividers': 'فواصل أدراج لمستحضرات التجميل',
  'Glass Top Protector': 'زجاج حماية لسطح التسريحة',
  'Dresser Stool / Pouf': 'كرسي / بوف تسريحة',
  'Hair Dryer / Styling Holder': 'حامل مجفف شعر',

  // Conference Tables
  'Pop-Up Power & HDMI Box': 'علبة كهرباء و HDMI منبثقة',
  'Cable Management Grommet': 'فتحة تمرير كابلات',
  'Under-Table Cable Tray': 'حامل كابلات أسفل الطاولة',
  'Wire Management Spine': 'عمود تنظيم الأسلاك',
  'Modesty Panel': 'ساتر أمامي للطاولة',
  'Integrated Wireless Charger': 'شاحن لاسلكي مدمج',

  // Office Desks
  'Cable Grommet': 'فتحة تمرير أسلاك',
  'Desktop Power & USB Outlet': 'مخرج كهرباء و USB للمكتب',
  'Pull-Out Keyboard Tray': 'رف لوحة مفاتيح سحاب',
  'Lockable 3-Drawer Pedestal': 'وحدة 3 أدراج بقفل',
  'Central Drawer Lock': 'قفل مركزي للأدراج',
  'CPU Holder': 'حامل كيس كمبيوتر (CPU)',
  'Monitor Arm Mount': 'ذراع حامل شاشة',
  'Desk Modesty Panel': 'ساتر أمامي للمكتب',

  // Office Chairs
  'Gas Lift Cylinder': 'بستم غاز لرفع الكرسي',
  'Swivel Tilt Mechanism': 'ماكينة دوران وإمالة للكرسي',
  'PU / Nylon Castor Wheels': 'عجل كرسي نايلون / PU',
  'Adjustable 3D Armrests': 'مساند أذرع قابلة للتعديل 3D',
  'Lumbar Support Cushion': 'وسادة دعم القطنية (الظهر)',
  'Adjustable Headrest': 'مسند رأس قابل للتعديل',
  'Chrome / Aluminum 5-Star Base': 'قاعدة خماسية كروم / ألومنيوم',
});

const WORD_FALLBACKS = [
  [/\bkitchen\s+cabinet(s)?\b/gi, 'خزانة مطبخ'],
  [/\bkitchen\s+unit(s)?\b/gi, 'وحدة مطبخ'],
  [/\bkitchen\b/gi, 'مطبخ'],
  [/\bcabinet(s)?\b/gi, 'خزانة'],
  [/\bwardrobe(s)?\b/gi, 'خزانة ملابس (دولاب)'],
  [/\bcloset(s)?\b/gi, 'خزانة'],
  [/\bdoor(s)?\b/gi, 'باب'],
  [/\bbed(s)?\b/gi, 'سرير'],
  [/\bking\s+size\b/gi, 'مقاس كينج'],
  [/\bqueen\s+size\b/gi, 'مقاس كوين'],
  [/\bdining\s+table(s)?\b/gi, 'طاولة طعام (سفرة)'],
  [/\bdining\s+chair(s)?\b/gi, 'كرسي طاولة طعام'],
  [/\bcoffee\s+table(s)?\b/gi, 'طاولة قهوة (وسط)'],
  [/\bside\s+table(s)?\b/gi, 'طاولة جانبية'],
  [/\bconference\s+table(s)?\b/gi, 'طاولة اجتماعات'],
  [/\boffice\s+desk(s)?\b/gi, 'مكتب عمل'],
  [/\boffice\s+chair(s)?\b/gi, 'كرسي مكتب'],
  [/\bbuffet\s+mirror(s)?\b/gi, 'مرآة بوفيه'],
  [/\bbuffet(s)?\b/gi, 'بوفيه'],
  [/\bdresser\s+table\s+mirror(s)?\b/gi, 'مرآة تسريحة'],
  [/\bdresser\s+mirror(s)?\b/gi, 'مرآة تسريحة'],
  [/\bdresser\s+table(s)?\b/gi, 'طاولة تسريحة'],
  [/\bdresser(s)?\b/gi, 'تسريحة'],
  [/\bmirror(s)?\b/gi, 'مرآة'],
  [/\b3\s*seater\s*recliner\b/gi, 'كنبة 3 مقاعد ريكلاينر'],
  [/\b2\s*seater\s*recliner\b/gi, 'كنبة مقعدين ريكلاينر'],
  [/\b(single|1)\s*seater\s*recliner\b/gi, 'كرسي مفرد ريكلاينر'],
  [/\b3\s*seater\b/gi, 'كنبة 3 مقاعد'],
  [/\b2\s*seater\b/gi, 'كنبة مقعدين'],
  [/\b(single|1)\s*seater\b/gi, 'كرسي مفرد'],
  [/\blounge\s+chair(s)?\b/gi, 'كرسي استرخاء'],
  [/\bcorner\s+sofa\b/gi, 'كنبة زاوية (ركنة)'],
  [/\bl\s*shape\b/gi, 'ركنة حرف L'],
  [/\bsofa(s)?\b/gi, 'كنبة'],
  [/\bcouch\b/gi, 'كنبة'],
  [/\bchair(s)?\b/gi, 'كرسي'],
  [/\btable(s)?\b/gi, 'طاولة'],
  [/\bdesk(s)?\b/gi, 'مكتب'],
  [/\bcurtain(s)?\b/gi, 'ستائر'],
  [/\bpillow(s)?\b/gi, 'وسائد'],
  [/\bmattress(es)?\b/gi, 'مرتبة سرير'],
  [/\btv\s+stand(s)?\b/gi, 'طاولة تلفزيون'],
  [/\bshoe\s+rack(s)?\b/gi, 'جزامة'],
];

const CI_DICT = new Map(
  Object.entries(STATIC_ARABIC_DICTIONARY).map(([k, v]) => [k.toLowerCase(), v]),
);

export function lookupStaticArabic(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (CI_DICT.has(s.toLowerCase())) return CI_DICT.get(s.toLowerCase());
  return '';
}

export function fallbackTranslatePhraseToArabic(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const direct = lookupStaticArabic(s);
  if (direct) return direct;
  let out = s;
  for (const [regex, ar] of WORD_FALLBACKS) {
    out = out.replace(regex, ar);
  }
  return out;
}

/**
 * Translate an array of English strings to Arabic in a single Gemini call,
 * with instant dictionary lookup for known terms and graceful fallback.
 */
export async function translateStringsToArabicServer(strings = []) {
  const unique = [
    ...new Set(
      (strings || [])
        .map((s) => String(s ?? '').trim())
        .filter(Boolean),
    ),
  ];
  const map = {};
  const missing = [];
  for (const s of unique) {
    const hit = lookupStaticArabic(s);
    if (hit) {
      map[s] = hit;
    } else {
      missing.push(s);
    }
  }
  if (!missing.length) return map;

  const apiKey = getGeminiApiKey();
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const prompt = [
          'Translate each furniture/carpentry/upholstery product name or description in the JSON array below from English to clear, natural Arabic used in furniture workshops.',
          'Keep model/brand names, numbers, and codes (like RAL 9010, 001BY) intact.',
          'Return ONLY a valid JSON object mapping each exact input string to its Arabic translation.',
          JSON.stringify(missing),
        ].join('\n');
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            }),
            signal: controller.signal,
          },
        );
        if (res.ok) {
          const payload = await res.json().catch(() => ({}));
          const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawText) {
            const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') {
              for (const s of missing) {
                const tr = String(parsed[s] || '').trim();
                if (tr) map[s] = tr;
              }
            }
          }
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // fall through to word fallback
    }
  }

  for (const s of missing) {
    if (!map[s]) {
      map[s] = fallbackTranslatePhraseToArabic(s);
    }
  }
  return map;
}
