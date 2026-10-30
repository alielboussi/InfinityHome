import {
  PRODUCTION_CARPENTRY_PRESETS,
  PRODUCTION_ITEM_PRESETS,
  PRODUCTION_LEGACY_PRESET_SUFFIXES,
  PRODUCTION_SEATER_PRESETS,
} from '../../src/utils/productionItemName.js';

const SHARED_REQUIREMENTS = `REQUIREMENTS (follow exactly):
1. Background: solid pure white #FFFFFF only — no floor, walls, warehouse, or gradient.
2. Subject: keep the same product — same shape, materials, colors, and proportions. Do not swap or redesign the item.
3. Cleanup: remove people, hands, tags, clutter, and background objects.
4. Lighting: bright, even catalog lighting; sharp focus; optional very soft contact shadow under the base only.
5. Framing: center the product with balanced padding; full item visible.
6. Forbidden: text, logos, watermarks, extra furniture, props, or scenery.

OUTPUT: Return ONLY the finished catalog image (no text).`;

const MATTRESS_WRAP_REMOVAL = `MATTRESS / BEDDING (critical when plastic or nylon is visible):
- Remove ALL shrink wrap, cellophane, nylon, polyethylene film, and shipping plastic around the mattress or topper. Never leave crinkled wrap, taped corners, or loose nylon flaps.
- Show only the fabric/quilted surface and sides of the mattress — crisp, sharp, color-accurate textile detail.
- Remove warehouse clutter, floor tape, and label stickers on the wrap; do not invent a different pattern or size.`;

const MATTRESS_CATALOG_ORIENTATION = `ORIENTATION & FRAMING (critical — customer must see the top design):
- Present the mattress facing forward toward the camera. The top sleeping surface (quilted, tufted, or patterned fabric) must be the main visible face — not a narrow side edge, end cap, or thickness-only profile.
- If the source photo is side-on or mostly shows the edge, re-angle to a standard catalog hero view: slightly elevated three-quarter angle OR straight-on from the foot/head so the full top pattern is readable across the frame.
- Do not crop away the decorative top; keep the entire mattress in frame with the surface design clearly visible (handles on the side are OK if they do not hide the pattern).
- Preserve the real quilt/stitch pattern and colors from the photo — only improve angle, lighting, and background; do not replace the design.`;

/** Subject line per Create-screen preset (upholstery + carpentry). */
export const PRODUCTION_PHOTO_PRESET_SUBJECT = Object.freeze({
  '3 Seater':
    'a three-seat upholstered sofa (three seat cushions; same upholstery and frame as photographed)',
  '2 Seater':
    'a two-seat upholstered sofa or loveseat (same upholstery and frame as photographed)',
  'Single Seater':
    'a single-seat upholstered armchair (one seat; same upholstery and frame as photographed)',
  'Lounge Chair':
    'an upholstered lounge armchair or recliner-style chair (same upholstery and silhouette as photographed)',
  Curtains:
    'curtain panels or drapery (fabric, pleats/folds, heading, and hems; same pattern and color as photographed)',
  Pillows:
    'decorative throw pillows or cushions (same fabric, color, and shape; single pillow or a small matching set)',
  'Coffee Table':
    'a coffee table (low living-room table; same top, legs, and finish as photographed)',
  'Side Table':
    'a side table or end table (same top, legs, and finish as photographed)',
  'Dining Table':
    'a dining table (same tabletop, legs, and finish as photographed)',
  'Dining Chair':
    'a dining chair (same seat, back, and frame as photographed)',
  Buffet:
    'a buffet sideboard or credenza (same doors, top, and finish as photographed)',
  'Buffet Mirror':
    'a buffet mirror (wall mirror associated with a buffet setting; same frame and glass as photographed)',
  'Dresser Table':
    'a dresser table or dressing table (same top, drawers, and finish as photographed)',
  'Dresser Mirror':
    'a dresser mirror or vanity mirror (same frame and glass as photographed)',
  'Dresser Table Mirror':
    'a dresser table with mirror (same table and mirror unit as photographed)',
});

function allPresetSuffixes() {
  return [...PRODUCTION_ITEM_PRESETS, ...PRODUCTION_LEGACY_PRESET_SUFFIXES]
    .sort((a, b) => b.length - a.length);
}

/** Infer preset suffix from finished product name (e.g. "Amara 3 Seater"). */
export function inferProductionPresetFromProductName(productName) {
  const n = String(productName || '').trim();
  if (!n) return '';
  for (const preset of allPresetSuffixes()) {
    const suffix = ` ${preset}`;
    if (n.endsWith(suffix) || n === preset) return preset;
  }
  return '';
}

function defaultSubjectForPreset(preset) {
  const p = String(preset || '').trim();
  if (PRODUCTION_SEATER_PRESETS.includes(p)) {
    return 'an upholstered furniture or soft-furnishing product (same materials and colors as photographed)';
  }
  if (PRODUCTION_CARPENTRY_PRESETS.includes(p)) {
    return 'a wooden furniture piece (same wood, finish, and shape as photographed)';
  }
  return 'a warehouse furniture product (same item as photographed)';
}

/** Mattress / bed / topper names in warehouse catalog (English). */
export function isMattressCatalogProductName(productName) {
  const n = String(productName || '').trim().toLowerCase();
  if (!n) return false;
  return /\bmattress\b/.test(n)
    || /\b(topper|bed base|bedbase)\b/.test(n)
    || (/\bbed\b/.test(n) && !/\bbedside\b|\bbedroom set\b/.test(n));
}

function buildMattressCatalogPhotoRetouchPrompt(productName) {
  const label = String(productName || '').trim() || 'mattress';
  return `TASK: Edit this warehouse photo into a single crisp e-commerce catalog image of a mattress or bedding product (same dimensions, fabric pattern, and colors as photographed).

Product: ${label}.

${MATTRESS_CATALOG_ORIENTATION}

${MATTRESS_WRAP_REMOVAL}

${SHARED_REQUIREMENTS}`;
}

/**
 * Gemini retouch prompt for Production create flow (white catalog background).
 */
export function buildProductionPhotoRetouchPrompt({ productName, preset } = {}) {
  const name = String(productName || '').trim();
  if (isMattressCatalogProductName(name)) {
    return buildMattressCatalogPhotoRetouchPrompt(name);
  }
  const resolved = String(preset || '').trim() || inferProductionPresetFromProductName(productName);
  const subject = PRODUCTION_PHOTO_PRESET_SUBJECT[resolved]
    || defaultSubjectForPreset(resolved);
  const label = resolved || 'furniture product';
  return `TASK: Edit this warehouse photo into a single catalog product image of ${subject}.

Product type: ${label}.

${SHARED_REQUIREMENTS}`;
}

/** @deprecated use buildProductionPhotoRetouchPrompt */
export const PRODUCTION_SEATING_PHOTO_PROMPT = buildProductionPhotoRetouchPrompt({
  preset: '3 Seater',
});
