import { getGeminiApiKey } from './geminiImageEmbedding.js';

const MODEL = 'gemini-2.0-flash';

function parseJsonArray(raw) {
  if (!raw) return [];
  const cleaned = String(raw).replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s || '').trim()).filter(Boolean);
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.accessories)) {
      return parsed.accessories.map((s) => String(s || '').trim()).filter(Boolean);
    }
  } catch {
  }
  return [];
}

/**
 * Gemini — common aluminum fabrication accessories for a product line (quoter picker).
 */
export async function suggestAluminumAccessoriesForProduct(productName = '') {
  const name = String(productName || '').trim() || 'Aluminum fabrication item';
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('AI accessory suggest is not configured (missing Gemini API key).');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const prompt = [
      'You help a furniture / shopfitting workshop quote aluminum fabrication jobs.',
      `Product line: "${name}".`,
      'List 14–22 commonly used aluminum accessories, hardware, or fabrication add-ons',
      '(handles, locks, glazing beads, rubber gaskets, hinges, corner cleats, powder coat extras, etc.).',
      'Use short English product names only (2–5 words each). No duplicates.',
      'Return ONLY a JSON object: { "accessories": ["...", "..."] }',
    ].join('\n');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini failed (${res.status})`);
    }
    const payload = await res.json().catch(() => ({}));
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const list = parseJsonArray(rawText);
    const seen = new Set();
    const out = [];
    for (const label of list) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
      if (out.length >= 24) break;
    }
    if (!out.length) throw new Error('AI returned no accessories — try again.');
    return out;
  } finally {
    clearTimeout(timeout);
  }
}