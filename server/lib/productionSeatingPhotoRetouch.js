import sharp from 'sharp';
import { getGeminiProductionApiKey } from './geminiImageEmbedding.js';
import { getProductionPhotoModelCandidates } from './productionPhotoGeminiModels.js';

export const PRODUCTION_SEATING_PHOTO_PROMPT = `TASK: Edit this warehouse photo into a single catalog product image of upholstered seating (sofa, sectional, loveseat, or armchair).

REQUIREMENTS (follow exactly):
1. Background: solid pure white #FFFFFF only — no floor, walls, warehouse, or gradient.
2. Subject: keep the same seating piece — same shape, upholstery color, cushion layout, and proportions. Do not swap or redesign the furniture.
3. Cleanup: remove people, hands, tags, clutter, and background objects.
4. Lighting: bright, even catalog lighting; sharp focus; optional very soft contact shadow under the base only.
5. Framing: center the seating with balanced padding; full piece visible.
6. Forbidden: text, logos, watermarks, extra furniture, props, or scenery.

OUTPUT: Return ONLY the finished catalog image (no text).`;

function parseImageBase64Payload(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('Photo data is required.');
  const payload = trimmed.includes(',') ? trimmed.split(',').pop() : trimmed;
  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length) throw new Error('Invalid photo data.');
  return buffer;
}

async function prepareInputJpeg(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
}

function extractGeneratedImage(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inline_data || part.inlineData;
    if (inline?.data) {
      return {
        buffer: Buffer.from(inline.data, 'base64'),
        mime: String(inline.mime_type || inline.mimeType || 'image/png').toLowerCase(),
      };
    }
  }
  return null;
}

function buildGenerationConfig() {
  const config = {
    responseModalities: ['IMAGE'],
    temperature: 0.35,
  };
  const aspect = String(process.env.GEMINI_PRODUCTION_PHOTO_ASPECT || '4:3').trim();
  if (aspect) {
    config.imageConfig = { aspectRatio: aspect };
  }
  return config;
}

async function requestGeminiSeatingRetouch(jpegBuffer) {
  const apiKey = getGeminiProductionApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY_PRODUCTION is not configured for photo retouching.');

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: PRODUCTION_SEATING_PHOTO_PROMPT },
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data: jpegBuffer.toString('base64'),
          },
        },
      ],
    }],
    generationConfig: buildGenerationConfig(),
  };

  const models = getProductionPhotoModelCandidates();
  const errors = [];
  const maxMs = Math.max(5000, Number(process.env.GEMINI_PRODUCTION_PHOTO_MAX_MS) || 18000);
  const deadline = Date.now() + maxMs;

  for (const model of models) {
    if (Date.now() >= deadline) {
      errors.push('time budget exceeded');
      break;
    }
    try {
      const remaining = Math.max(1000, deadline - Date.now());
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(remaining),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = payload?.error?.message || `Gemini image failed (${response.status})`;
        errors.push(`${model}: ${msg}`);
        continue;
      }
      const generated = extractGeneratedImage(payload);
      if (!generated?.buffer?.length) {
        errors.push(`${model}: no image in response`);
        continue;
      }
      return { ...generated, model };
    } catch (err) {
      errors.push(`${model}: ${err?.message || err}`);
    }
  }

  const detail = errors.slice(0, 4).join(' | ');
  throw new Error(
    detail
      ? `Photo retouch failed (${detail}). Check GEMINI_API_KEY_PRODUCTION on Vercel and enable billing or use a preview image model.`
      : 'Photo retouch failed.',
  );
}

async function finalizeCatalogJpeg(buffer, mime) {
  return sharp(buffer, mime.includes('png') ? { density: 150 } : undefined)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/**
 * AI retouch for warehouse production seating photos (white catalog background).
 * @returns {Promise<Buffer>} JPEG
 */
function catalogFallbackWithoutAiEnabled() {
  return String(process.env.PRODUCTION_PHOTO_FALLBACK_NO_AI ?? 'true')
    .trim()
    .toLowerCase() !== 'false';
}

export async function retouchProductionSeatingPhotoFromBase64(imageBase64) {
  const skipAi = String(process.env.PRODUCTION_PHOTO_SKIP_AI || '').trim().toLowerCase() === 'true';
  const input = await prepareInputJpeg(parseImageBase64Payload(imageBase64));
  if (skipAi) {
    return finalizeCatalogJpeg(input, 'image/jpeg');
  }
  try {
    const generated = await requestGeminiSeatingRetouch(input);
    return finalizeCatalogJpeg(generated.buffer, generated.mime);
  } catch (err) {
    if (!catalogFallbackWithoutAiEnabled()) {
      throw err;
    }
    console.warn(
      '[productionSeatingPhotoRetouch] Gemini retouch unavailable; saving with basic catalog prep:',
      err?.message || err,
    );
    return finalizeCatalogJpeg(input, 'image/jpeg');
  }
}
