export const SHOP_SUPPORT_EMAIL = 'bestrest10@gmail.com';

export const SHOP_DEFAULT_SETTINGS = {
  storeName: 'Infinity Home',
  tagline: 'Quality furniture, appliances, and home essentials for every room — curated for style, comfort, and lasting value.',
  supportEmail: SHOP_SUPPORT_EMAIL,
  whatsappE164: '',
};

export const SHOP_HERO_IMAGE = 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1920&q=80';

export const SHOP_PROMO_BANNER = {
  message: 'Quality furniture for every room',
  link: '/shop/products',
  linkLabel: 'Shop the catalogue',
};

export const SHOP_WHY_CHOOSE = [
  {
    title: 'Curated collections',
    text: 'Handpicked furniture and home essentials across living, bedroom, dining, and more — all in one place.',
  },
  {
    title: 'Live stock & pricing',
    text: 'See real availability and current prices before you order. No surprises at checkout.',
  },
  {
    title: 'Expert guidance',
    text: 'Our team helps you choose the right pieces for your space, style, and budget.',
  },
  {
    title: 'Delivery & support',
    text: 'From enquiry to delivery, we stay with you every step of the way.',
  },
];

export const SHOP_CATEGORY_SHOWCASE = [
  {
    slug: 'living',
    title: 'Living Room',
    description: 'Sofas, coffee tables, TV units & lounge furniture',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80',
    categoryMatch: ['living', 'lounge', 'sofa', 'sitting'],
  },
  {
    slug: 'dining',
    title: 'Dining',
    description: 'Dining sets, chairs, tables & entertaining',
    image: 'https://images.unsplash.com/photo-1617806113583-175b8b196277?auto=format&fit=crop&w=900&q=80',
    categoryMatch: ['dining', 'table', 'chair'],
  },
  {
    slug: 'bedroom',
    title: 'Bedroom',
    description: 'Beds, mattresses, wardrobes & bedside furniture',
    image: 'https://images.unsplash.com/photo-1616594039914-ae802cd125af?auto=format&fit=crop&w=900&q=80',
    categoryMatch: ['bed', 'bedroom', 'mattress', 'wardrobe'],
  },
  {
    slug: 'office',
    title: 'Office',
    description: 'Desks, office chairs & workspace solutions',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80',
    categoryMatch: ['office', 'desk', 'work'],
  },
  {
    slug: 'electronics',
    title: 'Electronics',
    description: 'TVs, sound systems & home entertainment',
    image: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=900&q=80',
    categoryMatch: ['tv', 'audio', 'sound', 'electronic', 'speaker'],
  },
  {
    slug: 'kitchen',
    title: 'Kitchen & Home',
    description: 'Appliances, décor & everyday essentials',
    image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80',
    categoryMatch: ['kitchen', 'appliance', 'home', 'decor'],
  },
];

export const SHOP_ABOUT_CONTENT = {
  title: 'About Infinity Home',
  intro: 'Infinity Home is your trusted partner for furniture, appliances, and home essentials.',
  paragraphs: [
    'We help families and businesses create beautiful, functional spaces with quality products at fair prices.',
    'Every item in our catalogue reflects real stock levels and current pricing, so you can plan your purchase with confidence.',
    'Whether you are furnishing a single room or an entire property, our team is here to advise, deliver, and support you.',
  ],
  links: [
    { label: 'View all products', to: '/shop/products' },
    { label: 'Contact us', to: '/shop/support' },
  ],
};

export const SHOP_SUPPORT_CONTENT = {
  title: 'Contact us',
  intro: 'Questions about a product, your order, or delivery? We are here to help.',
  email: SHOP_SUPPORT_EMAIL,
  bullets: [
    'WhatsApp any product page for quick availability checks',
    'Email us for orders, receipts, and delivery updates',
    'Visit us in person to see pieces and get expert advice',
  ],
  hours: 'Monday – Saturday: 9:00 AM – 5:30 PM',
  note: 'Pay with MTN Mobile Money or Airtel Money at checkout. Your order is confirmed and stock is deducted once payment succeeds.',
};

/** @deprecated use SHOP_CATEGORY_SHOWCASE */
export const SHOP_HOME_HIGHLIGHTS = SHOP_CATEGORY_SHOWCASE.map((row) => ({
  title: row.title,
  description: row.description,
  to: `/shop/products?category=${row.slug}`,
  cta: `Explore ${row.title.toLowerCase()}`,
  categoryMatch: row.categoryMatch,
}));

export function resolveCategoryFilterParam(categories = [], param = '') {
  const raw = String(param || '').trim().toLowerCase();
  if (!raw || raw === 'all') return null;
  const byId = categories.find((cat) => String(cat.id).toLowerCase() === raw);
  if (byId) return byId.id;
  const bySlug = categories.find((cat) => String(cat.slug || '').toLowerCase() === raw);
  if (bySlug) return bySlug.id;
  const showcase = SHOP_CATEGORY_SHOWCASE.find((row) => row.slug === raw);
  if (!showcase?.categoryMatch?.length) return null;
  const needles = showcase.categoryMatch.map((v) => v.toLowerCase());
  const match = categories.find((cat) => {
    const name = String(cat.name || '').toLowerCase();
    return needles.some((needle) => name.includes(needle));
  });
  return match?.id || null;
}

export function categorySlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function productCategoryLink(categoryId, categories = []) {
  const cat = categories.find((row) => String(row.id) === String(categoryId));
  if (cat?.slug) return `/shop/products?category=${cat.slug}`;
  return '/shop/products';
}
