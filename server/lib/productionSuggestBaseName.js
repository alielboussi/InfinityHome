import { getGeminiApiKey } from './geminiImageEmbedding.js';
import {
  buildProductionItemName,
  normalizeProductionNameInput,
  pickRandomProductionBaseName,
} from '../../src/utils/productionItemName.js';

const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

const SUGGEST_PROMPT = `You name luxury upholstered seating products for a furniture warehouse.
Reply with exactly ONE short product title (1 or 2 words only): either an elegant feminine first name OR a famous beautiful place in the world.
No punctuation, no explanation, no "3 seater", no brand names.
Good examples: Capri, Valentina, Santorini, Riviera, Aurora, Monaco, Layla, Como.`;

function sanitizeModelName(raw) {
  const line = String(raw || '')
    .trim()
    .split(/\n/)[0]
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!,;:].*$/, '')
    .trim();
  if (!line || line.length > 32) return '';
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length > 2) return '';
  return normalizeProductionNameInput(words.join(' '));
}

async function generateProductionBaseNameWithGemini() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SUGGEST_PROMPT }] }],
        generationConfig: {
          temperature: 1.05,
          maxOutputTokens: 16,
          candidateCount: 1,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini suggest failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  const name = sanitizeModelName(text);
  return name || null;
}

/** One base name (AI when GEMINI_API_KEY is set, else curated random). */
export async function suggestProductionBaseName() {
  try {
    const ai = await generateProductionBaseNameWithGemini();
    if (ai) return ai;
  } catch (err) {
    console.warn('[productionSuggestBaseName]', err?.message || err);
  }
  return pickRandomProductionBaseName();
}

/**
 * @param {(fullProductName: string) => Promise<boolean>} isNameTaken — true if unavailable
 * @param {string} [preset] — seater preset to build full name for uniqueness
 */
export async function suggestUniqueProductionBaseName(isNameTaken, preset = '') {
  const p = String(preset || '').trim();
  for (let attempt = 0; attempt < 35; attempt += 1) {
    const base = await suggestProductionBaseName();
    const full = p ? buildProductionItemName(base, p) : base;
    const taken = await isNameTaken(full);
    if (!taken) return base;
  }
  throw new Error('Could not find an unused name. Enter one manually.');
}
