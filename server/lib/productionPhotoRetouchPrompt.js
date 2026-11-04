import {
  PRODUCTION_CARPENTRY_PRESETS,
  PRODUCTION_ITEM_PRESETS,
  PRODUCTION_LEGACY_PRESET_SUFFIXES,
  PRODUCTION_SEATER_PRESETS,
} from '../../src/utils/productionItemName.js';
import { isMattressCatalogProductName } from '../../src/utils/isMattressCatalogProductName.js';
import { isReclinerCatalogProduct } from '../../src/utils/isReclinerCatalogProduct.js';

export { isMattressCatalogProductName };

const SHARED_REQUIREMENTS = `REQUIREMENTS (follow exactly):
1. Background: solid pure white #FFFFFF only — no floor, walls, warehouse, or gradient.
2. Subject: keep the same product — same shape, materials, colors, and proportions. Do not swap or redesign the item. Never stretch or squash the product wider or taller than the real furniture — preserve natural width-to-height ratio.
3. Cleanup: remove people, hands, tags, clutter, and background objects.
4. Lighting: bright, even catalog lighting; sharp focus; optional very soft contact shadow under the base only.
5. Framing: center the product with balanced padding on all sides; the full item must be visible — never crop off arms, back, base, or sides.
6. Composition: keep the product upright and centered in the frame (not pushed to the left or right edge); use roughly 65–85% of the frame for the product with even white margins on all four sides — equal space above and below the silhouette (never parked on the bottom edge with empty space only at the top).
7. Forbidden: text, logos, watermarks, extra furniture, props, or scenery.

OUTPUT: Return ONLY the finished catalog image (no text).`;

/** Input from warehouse-catalog / production camera (any phone hold is valid). */
const CATALOG_SOURCE_PHONE_CAPTURE = `SOURCE PHOTO (portrait or landscape phone — both OK):
- The warehouse photo may be taken with the phone held upright (portrait) or sideways so the camera is horizontal (landscape). Treat either as a valid input; do not reject or distort based on frame aspect ratio alone.
- Identify the furniture in the scene (shape, upholstery, legs) even when the raw image is wider-than-tall or taller-than-wide.
- Your output must use standard catalog gravity and product orientation — rotate/reframe as needed so the finished image looks like a professional catalog shot, independent of how the phone was held when the photo was taken.`;

const MATTRESS_WRAP_REMOVAL = `MATTRESS / BEDDING (critical when plastic or nylon is visible):
- Remove ALL shrink wrap, cellophane, nylon, polyethylene film, and shipping plastic around the mattress or topper. Never leave crinkled wrap, taped corners, or loose nylon flaps.
- Show only the fabric/quilted surface and sides of the mattress — crisp, sharp, color-accurate textile detail.
- Remove warehouse clutter, floor tape, and label stickers on the wrap; do not invent a different pattern or size.`;

const MATTRESS_HERO_FRAMING = `HERO FRAMING (critical — match other finished-goods catalog thumbnails in this app):
- Zoom in so the mattress fills most of the square frame (about 70–90% of height and width). Minimal white padding — same tight crop as sofas and chairs in this catalog, NOT a small mattress floating with huge empty margins.
- Center the product. The full mattress silhouette should read clearly (top face + visible side depth), not an abstract texture patch only.
- Match sibling SKUs in the same product line (e.g. all Sleep Comfort sizes): same tight face-on hero crop — NOT a distant wide shot with large empty white bands above/below.
- Preserve exact fabric pattern, quilt geometry, puff spacing, and colors from the source — only reframe, relight, rotate upright, and clean the background; never replace the design.`;

const MATTRESS_CATALOG_ORIENTATION = `ORIENTATION (critical — never lay flat on the floor):
- The mattress must stand UPRIGHT (vertical), the same way other warehouse finished products are photographed for this catalog — NOT lying horizontal on the ground, warehouse floor, or pallet.
- Rotate/repose from flat warehouse shots: prop the mattress on its long edge or end so it stands tall; the TOP sleeping surface (quilted/tufted/patterned fabric) faces the camera forward (straight-on or slight 3/4 hero angle, ~5–20°).
- The customer must see the top design as the main face — not a top-down flat-lay, not a bird's-eye view, not mostly side thickness or end cap only.
- The top quilt plane must be roughly vertical in the output (parallel to the left/right edges of the image), not rotated 90° so quilting runs sideways across the frame.
- Forbidden poses: mattress lying flat, mattress on the ground seen from above, extreme macro crop with no product shape, narrow edge-only profile hiding the quilt pattern, abstract texture fill with no readable mattress outline.
- Side handles or piping are OK at the edges if the top quilt pattern remains the hero.`;

const MATTRESS_CATALOG_REQUIREMENTS = `REQUIREMENTS (follow exactly):
1. Background: solid pure white #FFFFFF only — no floor, walls, warehouse, or gradient.
2. Subject: keep the same mattress — same fabric pattern, colors, and proportions. Do not swap or redesign the item.
3. Cleanup: remove people, hands, tags, clutter, and background objects.
4. Lighting: bright, even catalog lighting; sharp focus on the top quilt and edges; optional very soft contact shadow under the standing base only.
5. Framing: upright hero shot as specified above — zoomed in like other catalog products; NOT distant, NOT flat on the floor, NOT top-down flat-lay.
6. Forbidden: text, logos, watermarks, extra furniture, props, or scenery.

OUTPUT: Return ONLY the finished catalog image (no text).`;

/** Recliner catalog (matches ChatGPT-retouched warehouse thumbnails: centered, white, soft shadow). */
const RECLINER_CATALOG_ORIENTATION = `ORIENTATION (critical — front catalog view, never sideways or rolled):
- Standard e-commerce pose: the recliner faces the camera (straight-on or slight 3/4), seat cushions horizontal left-to-right, backrest vertical, footrests toward the camera or slightly angled — same upright pose as other recliners in this catalog (e.g. walnut leather sets).
- The base/feet line must be parallel to the bottom edge of the image; gravity must read correctly (sofa sitting on the floor, not standing on an arm or back).
- Landscape phone capture (camera held horizontal / sideways) is common in the warehouse — fully supported. Read the recliner correctly from wide landscape frames; output the same front catalog pose as portrait captures.
- Portrait phone capture is also valid. In either case, if pixels look rotated relative to gravity, rotate the output so the product is upright — forbidden: the sofa lying on its side, back/arm running vertically up the frame, 90° roll, or edge-on profile that hides seat width.
- Wide sofas: show the full width from left arm to right arm in one shot; do not crop arms, footrests, or back corners.`;

const RECLINER_CATALOG_FRAMING = `FRAMING / ZOOM (critical — match brown walnut recliner thumbnails in warehouse catalog):
- Zoom OUT like the existing brown leather 2-seater and 3-seater recliner photos: the product should occupy roughly 45–60% of frame height (not 75–90%), centered with generous pure-white padding on all four sides.
- Leave a clear white band between the sofa and every image edge — arms and footrests must NOT touch or bleed into the left/right borders; top of back and base must not touch top/bottom borders.
- If the source is a tight close-up, scale the subject down and add white space so the finished shot matches sibling recliner SKUs (same “small sofa in a big white square” look as brown sets).
- Forbidden: edge-to-edge crop, fill-the-frame zoom, arms cropped by the frame, or less white margin than the brown recliner examples in this catalog.`;

const RECLINER_CATALOG_REQUIREMENTS = `RECLINER CATALOG (match ChatGPT-retouched reference thumbnails in warehouse catalog):
1. Product: upholstered power or manual recliner — preserve channel tufting, seat seams, arm shape, footrest/leg rest, handles, and exact leather or fabric color from the source. Do not turn it into a fixed non-reclining sofa.
2. Background: solid pure white #FFFFFF only — no floor, walls, warehouse, or gradient.
3. Cleanup: remove people, hands, tags, clutter, and background objects.
4. Lighting: bright, even studio catalog lighting; sharp focus; one soft contact shadow under the base only.
5. Framing: apply the zoom-out rules above — full recliner visible with wide even margins; never tight crop or maximum zoom.
6. Composition: same scale and padding as brown leather recliners already in this catalog (centered, readable silhouette, ample white surround — lighter/white upholstery uses the same zoom level, not closer).

OUTPUT: Return ONLY the finished catalog image (no text).`;

const RECLINER_PHOTO_PRESET_SUBJECT = Object.freeze({
  '3 Seater':
    'a three-seat recliner sofa (three reclining seats with matching upholstery and footrests; same configuration as photographed)',
  '2 Seater':
    'a two-seat recliner loveseat (two reclining seats with footrests; same upholstery as photographed)',
  'Single Seater':
    'a single-seat recliner armchair (one reclining seat with footrest; same upholstery as photographed)',
  'Lounge Chair':
    'a single recliner lounge chair (recliner armchair with footrest; same upholstery and silhouette as photographed)',
});

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

function defaultSubjectForPreset(preset, { seaterPresets, carpentryPresets } = {}) {
  const p = String(preset || '').trim();
  const seater = seaterPresets || PRODUCTION_SEATER_PRESETS;
  const carpentry = carpentryPresets || PRODUCTION_CARPENTRY_PRESETS;
  if (seater.includes(p)) {
    return 'an upholstered furniture or soft-furnishing product (same materials and colors as photographed)';
  }
  if (carpentry.includes(p)) {
    return 'a wooden furniture piece (same wood, finish, and shape as photographed)';
  }
  return 'a warehouse furniture product (same item as photographed)';
}

function buildMattressCatalogPhotoRetouchPrompt(productName) {
  const label = String(productName || '').trim() || 'mattress';
  return `TASK: Edit this warehouse photo into a single crisp e-commerce catalog image of a mattress or bedding product (same dimensions, fabric pattern, and colors as photographed).

Product: ${label}.

${MATTRESS_HERO_FRAMING}

${MATTRESS_CATALOG_ORIENTATION}

${MATTRESS_WRAP_REMOVAL}

${MATTRESS_CATALOG_REQUIREMENTS}`;
}

/**
 * Gemini retouch prompt for Production create flow (white catalog background).
 */
export function buildProductionPhotoRetouchPrompt({
  productName,
  preset,
  categoryName,
  seaterPresets,
  carpentryPresets,
} = {}) {
  const name = String(productName || '').trim();
  if (isMattressCatalogProductName(name)) {
    throw new Error('Mattress products do not use AI photo retouch.');
  }
  const recliner = isReclinerCatalogProduct({ productName: name, categoryName });
  const suffixSource = [
    ...(seaterPresets || PRODUCTION_SEATER_PRESETS),
    ...(carpentryPresets || PRODUCTION_CARPENTRY_PRESETS),
    ...PRODUCTION_LEGACY_PRESET_SUFFIXES,
  ].sort((a, b) => b.length - a.length);
  let resolved = String(preset || '').trim();
  if (!resolved) {
    for (const candidate of suffixSource) {
      const suffix = ` ${candidate}`;
      if (name.endsWith(suffix) || name.toLowerCase() === candidate.toLowerCase()) {
        resolved = candidate;
        break;
      }
    }
  }
  const subjectMap = recliner ? RECLINER_PHOTO_PRESET_SUBJECT : PRODUCTION_PHOTO_PRESET_SUBJECT;
  const subject = subjectMap[resolved]
    || defaultSubjectForPreset(resolved, { seaterPresets, carpentryPresets });
  const label = resolved || 'furniture product';
  const requirements = recliner ? RECLINER_CATALOG_REQUIREMENTS : SHARED_REQUIREMENTS;
  const orientationBlock = recliner ? `${RECLINER_CATALOG_ORIENTATION}\n\n` : '';
  const framingBlock = recliner ? `${RECLINER_CATALOG_FRAMING}\n\n` : '';
  return `TASK: Edit this warehouse photo into a single catalog product image of ${subject}.

Product type: ${label}.

${CATALOG_SOURCE_PHONE_CAPTURE}

${framingBlock}${orientationBlock}${requirements}`;
}

/** @deprecated use buildProductionPhotoRetouchPrompt */
export const PRODUCTION_SEATING_PHOTO_PROMPT = buildProductionPhotoRetouchPrompt({
  preset: '3 Seater',
});
