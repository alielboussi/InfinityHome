function trimOrNull(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

/** Allowed carpentry wood types (Quotationer + workshop display). */
export const CARPENTRY_WOOD_OPTIONS = [
  'Laminated',
  'Rosewood',
  'Mukwa',
  'Hardwood',
  'Sprayed Wood',
  'Melamine Wood',
  'MDF',
];

/** Upholstery foam grades (Quotationer + workshop display). */
export const UPHOLSTERY_FOAM_OPTIONS = [
  'High density (HD)',
  'Medium density (MD)',
  'Soft / low density',
  'Memory foam',
  'Rebonded',
  'Spring foam',
  'Coconut fibre (coir)',
  'Wrap / Dacron',
];

export function normalizeUpholsteryFoamType(raw) {
  const v = trimOrNull(raw);
  if (!v) return null;
  const match = UPHOLSTERY_FOAM_OPTIONS.find((o) => o.toLowerCase() === v.toLowerCase());
  return match || v;
}

/** Carpentry accessories grouped by furniture category for Quotationer selector. */
export const CARPENTRY_ACCESSORY_GROUPS = Object.freeze([
  {
    category: 'Kitchen Units',
    items: [
      'Granite',
      'Quartz Countertop',
      'Marble Countertop',
      'Sink',
      'Double Bowl Sink',
      'Mixer',
      'Pull-Out Spray Mixer',
      'Soft-Close Hinges',
      'Soft-Close Drawer Runners',
      'Cabinet Handles / Knobs',
      'Cutlery Tray',
      'Spice Rack Pull-Out',
      'Corner Carousel / Magic Corner',
      'Dish Rack Insert',
      'Pull-Out Waste Bin',
      'Plinth / Kickboard',
      'Under-Cabinet LED Strip',
      'Gas Struts / Lift-Up Stay',
    ],
  },
  {
    category: 'Doors',
    items: [
      'Door Lock Set',
      'Mortise Lock & Cylinder',
      'Door Handle Set',
      'Flush Pull Handle',
      'Heavy-Duty Hinges',
      'Concealed Hinges',
      'Door Closer',
      'Door Stopper',
      'Tower Bolt / Flush Bolt',
      'Peephole / Door Viewer',
      'Weather Strip / Seal',
      'Architrave / Door Frame Trim',
    ],
  },
  {
    category: 'Beds',
    items: [
      'Orthopedic Slats / Base',
      'Hydraulic Storage Lift Mechanism',
      'Under-Bed Storage Drawers',
      'Upholstered Headboard Cushion',
      'Bedside Reading Light',
      'Built-In USB / Power Socket',
      'Mattress Support Center Rail',
      'Bedside Floating Shelf',
    ],
  },
  {
    category: 'Dining Tables',
    items: [
      'Tempered Glass Top',
      'Marble / Granite Table Top',
      'Extension Leaf Mechanism',
      'Lazy Susan Turntable',
      'Metal / Brass Leg Caps',
      'Adjustable Floor Glides',
    ],
  },
  {
    category: 'Dining Chairs',
    items: [
      'Upholstered Seat Pad',
      'Fabric / Leather Seat Cover',
      'Felt Floor Protectors',
      'Brass / Chrome Footrest Trim',
      'Armrest Pads',
    ],
  },
  {
    category: 'Buffets & Buffet Mirrors',
    items: [
      'Beveled Mirror Glass',
      'LED Backlight Strip',
      'Glass Shelves',
      'Wine / Stemware Rack Insert',
      'Push-to-Open Latches',
      'Soft-Close Buffet Hinges & Runners',
      'Heavy-Duty Wall Mounting Brackets',
    ],
  },
  {
    category: 'Dresser Tables & Dresser Mirrors',
    items: [
      'Hollywood LED Mirror Bulbs',
      'Touch-Sensor LED Mirror Light',
      'Velvet Jewelry Tray Insert',
      'Cosmetic Drawer Dividers',
      'Glass Top Protector',
      'Dresser Stool / Pouf',
      'Hair Dryer / Styling Holder',
    ],
  },
  {
    category: 'Conference Tables',
    items: [
      'Pop-Up Power & HDMI Box',
      'Cable Management Grommet',
      'Under-Table Cable Tray',
      'Wire Management Spine',
      'Modesty Panel',
      'Integrated Wireless Charger',
    ],
  },
  {
    category: 'Office Desks',
    items: [
      'Cable Grommet',
      'Desktop Power & USB Outlet',
      'Pull-Out Keyboard Tray',
      'Lockable 3-Drawer Pedestal',
      'Central Drawer Lock',
      'CPU Holder',
      'Monitor Arm Mount',
      'Desk Modesty Panel',
    ],
  },
  {
    category: 'Office Chairs',
    items: [
      'Gas Lift Cylinder',
      'Swivel Tilt Mechanism',
      'PU / Nylon Castor Wheels',
      'Adjustable 3D Armrests',
      'Lumbar Support Cushion',
      'Adjustable Headrest',
      'Chrome / Aluminum 5-Star Base',
    ],
  },
]);

export const CARPENTRY_ACCESSORY_OPTIONS = Object.freeze(
  [...new Set(CARPENTRY_ACCESSORY_GROUPS.flatMap((g) => g.items))],
);

export function normalizeCarpentryWoodChoice(raw) {
  const v = trimOrNull(raw);
  if (!v) return null;
  const match = CARPENTRY_WOOD_OPTIONS.find((o) => o.toLowerCase() === v.toLowerCase());
  return match || v;
}

export function normalizeQuoteItemAccessories(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(',')
        .map((s) => s.trim());
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const clean = trimOrNull(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function parseLegacyDimensionsLwh(raw) {
  const s = trimOrNull(raw);
  if (!s) return { dim_l_cm: null, dim_w_cm: null, dim_h_cm: null };
  const parts = s.split(/[x×*]/i).map((p) => trimOrNull(p)).filter(Boolean);
  return {
    dim_l_cm: parts[0] || null,
    dim_w_cm: parts[1] || null,
    dim_h_cm: parts[2] || null,
  };
}

export function formatQuoteDimensionsCm({ dim_l_cm, dim_w_cm, dim_h_cm, dimensions_lwh } = {}) {
  const l = trimOrNull(dim_l_cm);
  const w = trimOrNull(dim_w_cm);
  const h = trimOrNull(dim_h_cm);
  if (l && w && h) return `${l} × ${w} × ${h}`;
  const legacy = trimOrNull(dimensions_lwh);
  if (legacy) return legacy.replace(/\s*[x×*]\s*/gi, ' × ');
  const partial = [l, w, h].filter(Boolean);
  if (partial.length) return partial.join(' × ');
  return null;
}

export function hasQuoteDimensionCm({ dim_l_cm, dim_w_cm, dim_h_cm, dimensions_lwh } = {}) {
  return Boolean(
    trimOrNull(dim_l_cm)
    || trimOrNull(dim_w_cm)
    || trimOrNull(dim_h_cm)
    || trimOrNull(dimensions_lwh),
  );
}

/** Read optional workshop fields from a quotation_items row or client item. */
export function pickQuoteItemProductionFields(it) {
  const meta = it?.metadata && typeof it.metadata === 'object' ? it.metadata : {};
  let dim_l_cm = trimOrNull(it?.dim_l_cm ?? it?.length_cm ?? meta.dim_l_cm ?? meta.length_cm);
  let dim_w_cm = trimOrNull(it?.dim_w_cm ?? it?.width_cm ?? meta.dim_w_cm ?? meta.width_cm);
  let dim_h_cm = trimOrNull(it?.dim_h_cm ?? it?.height_cm ?? meta.dim_h_cm ?? meta.height_cm);
  if (!dim_l_cm && !dim_w_cm && !dim_h_cm) {
    const legacy = parseLegacyDimensionsLwh(it?.dimensions_lwh ?? meta.dimensions_lwh);
    dim_l_cm = legacy.dim_l_cm;
    dim_w_cm = legacy.dim_w_cm;
    dim_h_cm = legacy.dim_h_cm;
  }
  const dimensions_lwh = formatQuoteDimensionsCm({ dim_l_cm, dim_w_cm, dim_h_cm });
  const accessories = normalizeQuoteItemAccessories(
    it?.accessories ?? it?.included_accessories ?? meta.accessories ?? meta.included_accessories,
  );
  return {
    leather_code: trimOrNull(it?.leather_code ?? meta.leather_code),
    dim_l_cm,
    dim_w_cm,
    dim_h_cm,
    dimensions_lwh,
    color_code: trimOrNull(it?.color_code ?? meta.color_code),
    wood: normalizeCarpentryWoodChoice(it?.wood ?? meta.wood),
    foam_type: normalizeUpholsteryFoamType(it?.foam_type ?? meta.foam_type),
    accessories,
  };
}

/** JSON metadata column payload for quotation_items (omit when empty). */
export function buildQuoteItemMetadataFromPayload(it) {
  const fields = pickQuoteItemProductionFields(it);
  const out = {};
  if (fields.leather_code) out.leather_code = fields.leather_code;
  if (fields.dim_l_cm) out.dim_l_cm = fields.dim_l_cm;
  if (fields.dim_w_cm) out.dim_w_cm = fields.dim_w_cm;
  if (fields.dim_h_cm) out.dim_h_cm = fields.dim_h_cm;
  if (fields.dimensions_lwh) out.dimensions_lwh = fields.dimensions_lwh;
  if (fields.color_code) out.color_code = fields.color_code;
  if (fields.wood) out.wood = fields.wood;
  if (fields.foam_type) out.foam_type = fields.foam_type;
  if (fields.accessories?.length) out.accessories = fields.accessories;
  return Object.keys(out).length ? out : null;
}

/** Format per-line production bullets for Quote PDF (`-Wood`, `-Lcm Length * Wcm Width * Hcm Height`, `-Color Code: ...`, `-Leather Code: ...`). */
export function formatQuoteItemProductionPdfLines(it) {
  const fields = pickQuoteItemProductionFields(it);
  const lines = [];
  if (fields.wood) {
    lines.push(`-${fields.wood}`);
  }
  const dimParts = [];
  const cleanDim = (val) => String(val).replace(/\s*cm$/i, '').trim();
  if (fields.dim_l_cm) dimParts.push(`${cleanDim(fields.dim_l_cm)}cm Length`);
  if (fields.dim_w_cm) dimParts.push(`${cleanDim(fields.dim_w_cm)}cm Width`);
  if (fields.dim_h_cm) dimParts.push(`${cleanDim(fields.dim_h_cm)}cm Height`);
  if (dimParts.length) {
    lines.push(`-${dimParts.join(' * ')}`);
  }
  if (fields.color_code) {
    lines.push(`-Color Code: ${fields.color_code}`);
  }
  if (fields.leather_code) {
    lines.push(`-Leather Code: ${fields.leather_code}`);
  }
  if (fields.foam_type) {
    lines.push(`-Foam Type: ${fields.foam_type}`);
  }
  return lines;
}

/**
 * Delivery-note field rows under a quote product:
 * Product Name
 * -Field 1
 * -Field 2, Field 2 Option 2
 */
export function formatQuoteItemDeliveryNoteFieldLines(it) {
  const lines = formatQuoteItemProductionPdfLines(it).map((s) => String(s || '').replace(/^-/, '').trim())
    .filter(Boolean);
  const fields = pickQuoteItemProductionFields(it);
  if (fields.accessories?.length) {
    lines.push(fields.accessories.join(', '));
  }
  const desc = trimOrNull(it?.description);
  if (desc) lines.push(desc);
  return lines;
}

/** Format `Included Accessories : x, y, z` line for Quote PDF (shown below Description). */
export function formatQuoteItemAccessoriesPdfLine(it) {
  const fields = pickQuoteItemProductionFields(it);
  if (!fields.accessories?.length) return '';
  return `Included Accessories : ${fields.accessories.join(', ')}`;
}

/** Line row stored on quote_production_routing.metadata.lines and returned to workshop apps. */
export function buildProductionLineSummaryRow(it) {
  return {
    id: it.id,
    name: it.name_override || it.name || '',
    description: trimOrNull(it.description),
    quantity: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    ...pickQuoteItemProductionFields(it),
  };
}

export function summarizeProductionQuoteCardExtras(lines, route) {
  const normalized = String(route || '').toLowerCase();
  const list = Array.isArray(lines) ? lines : [];
  const bits = [];
  for (const line of list.slice(0, 3)) {
    if (normalized === 'upholstery') {
      if (line.leather_code) bits.push(`Leather: ${line.leather_code}`);
      const dims = formatQuoteDimensionsCm(line);
      if (dims) bits.push(`L×W×H (cm): ${dims}`);
      if (line.foam_type) bits.push(`Foam: ${line.foam_type}`);
      if (line.wood) bits.push(`Wood: ${line.wood}`);
    }
    if (normalized === 'carpentry') {
      const dims = formatQuoteDimensionsCm(line);
      if (dims) bits.push(`L×W×H (cm): ${dims}`);
      if (line.color_code) bits.push(`Color: ${line.color_code}`);
      if (line.wood) bits.push(`Wood: ${line.wood}`);
      const acc = normalizeQuoteItemAccessories(line.accessories);
      if (acc.length) bits.push(`Included Accessories: ${acc.join(', ')}`);
    }
  }
  return bits.join(' · ');
}
