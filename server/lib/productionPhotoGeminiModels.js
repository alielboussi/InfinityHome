/**
 * Model order for production seating photo retouch (image OUT).
 *
 * Google’s dedicated image-output models (2.5 Flash Image, 3.1 Flash Image, etc.) are
 * paid per image on the Developer API — there is no “free image output” tier on those SKUs.
 *
 * With a Google AI Studio API key (free to create), you still get generous **rate limits**
 * on the API; preview / 2.0 image-generation models are tried first when
 * GEMINI_PRODUCTION_PHOTO_PREFER_FREE=true (default) to minimize cost.
 *
 * Override order entirely with GEMINI_PRODUCTION_PHOTO_MODEL (single model, no fallbacks)
 * or GEMINI_PRODUCTION_PHOTO_MODELS=comma,separated,list
 */

const PAID_FALLBACK_MODELS = Object.freeze([
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
]);

/** Lower-cost / preview models — try first when preferring free-tier-friendly usage. */
const FREE_FIRST_MODELS = Object.freeze([
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
  ...PAID_FALLBACK_MODELS,
]);

function parseCsvModels(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getProductionPhotoModelCandidates() {
  const forced = String(process.env.GEMINI_PRODUCTION_PHOTO_MODEL || '').trim();
  if (forced) return [forced];

  const csv = parseCsvModels(process.env.GEMINI_PRODUCTION_PHOTO_MODELS);
  if (csv.length) return csv;

  const preferFree = String(process.env.GEMINI_PRODUCTION_PHOTO_PREFER_FREE ?? 'true')
    .trim()
    .toLowerCase() !== 'false';

  return preferFree ? [...FREE_FIRST_MODELS] : [...PAID_FALLBACK_MODELS, ...FREE_FIRST_MODELS];
}

/** Mandatory AI retouch: paid image-output models only (avoids slow free-preview loops). */
export function getProductionPhotoModelCandidatesForRequireAi() {
  const forced = String(process.env.GEMINI_PRODUCTION_PHOTO_MODEL || '').trim();
  if (forced) return [forced];

  const csv = parseCsvModels(process.env.GEMINI_PRODUCTION_PHOTO_MODELS);
  if (csv.length) return csv.slice(0, 3);

  return [...PAID_FALLBACK_MODELS];
}
