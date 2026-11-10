import { getGeminiApiKey } from './geminiImageEmbedding.js';
import {
  ARABIC_TERMS as STATIC_ARABIC_DICTIONARY,
  lookupStaticArabic,
  fallbackTranslatePhraseToArabic,
} from '../../src/utils/quoteArabicTranslate.js';

const MODEL = 'gemini-2.0-flash';

export { STATIC_ARABIC_DICTIONARY, lookupStaticArabic, fallbackTranslatePhraseToArabic };

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
