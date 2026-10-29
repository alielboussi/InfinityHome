# Gemini — production seating photos on Vercel

Upholstery Production uses **`GEMINI_API_KEY_PRODUCTION`** (dedicated key) to retouch warehouse photos (white catalog background) before saving to the packet SKU and printing labels.

This is **separate** from **`GEMINI_API_KEY`**, which powers portal/catalog features (e.g. image embeddings) and may be tied to another app or key on Vercel.

## 1. Create the API key (Google AI Studio)

1. Open [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in with the Google account you use for **Bestrest-Portal-System** (or your org account).
3. Click **Create API key** → choose project **bestrest-portal-system-43108** (or a dedicated GCP project for production photos).
4. Copy the key (starts with `AIza…`). Store it in a password manager — you will not see it again in full.

**Free vs paid (important):**

| What | Free API key (AI Studio) | Dedicated image models |
|------|--------------------------|-------------------------|
| API key cost | Free to create | Same key |
| **Image output** (retouch → new image) | **Preview / 2.0 image-gen models** are tried first (see below) | Models like `gemini-2.5-flash-image` are **paid per image** (~$0.02–$0.04 each) if preview models fail |

Infinity Home defaults to **`GEMINI_PRODUCTION_PHOTO_PREFER_FREE=true`**, which tries cheaper preview models before `gemini-2.5-flash-image`.

If every model returns billing or quota errors, enable **billing** on the GCP project linked to the key (pay-as-you-go) or set `PRODUCTION_PHOTO_SKIP_AI=true` only for local dev (no AI, white flatten only).

## 2. Add environment variables on Vercel

1. [Vercel Dashboard](https://vercel.com) → your **Infinity Home** production project.
2. **Settings** → **Environment Variables**.
3. Add:

| Name | Value | Environments |
|------|--------|----------------|
| `GEMINI_API_KEY_PRODUCTION` | Your production `AIza…` key | **Production** (and **Preview** if you test PRs) |

You already added (keep these):

| Name | Typical value |
|------|----------------|
| `GEMINI_PRODUCTION_PHOTO_PREFER_FREE` | `true` |
| `GEMINI_PRODUCTION_PHOTO_ASPECT` | `4:3` |

**Optional** overrides:

| Name | Example | Purpose |
|------|---------|---------|
| `GEMINI_PRODUCTION_PHOTO_MODEL` | `gemini-2.0-flash-preview-image-generation` | Force a single model (no fallbacks) |
| `GEMINI_PRODUCTION_PHOTO_MODELS` | `gemini-2.0-flash-preview-image-generation,gemini-2.5-flash-image` | Custom fallback order (comma-separated) |
| `PRODUCTION_PHOTO_SKIP_AI` | `true` | **Dev only** — skip AI, upload normalized JPEG |

Do **not** reuse `GEMINI_API_KEY` for production photos unless you intentionally want the same quota/project as another Android app — the code only reads **`GEMINI_API_KEY_PRODUCTION`** for retouch.

4. **Save** each variable.
5. **Deployments** → **Redeploy** the latest production deployment.

### CLI (optional)

```bash
vercel env add GEMINI_API_KEY_PRODUCTION production
vercel --prod
```

## 3. Verify after deploy

1. Save a test item in **Upholstery Production** (camera → save).
2. If retouch fails, check **Vercel** → **Logs** for `Photo retouch failed`.
3. Common fixes:
   - Key missing → add `GEMINI_API_KEY_PRODUCTION` and redeploy.
   - `API key not valid` → wrong key or wrong GCP project.
   - `billing` / `quota` → enable billing or set `GEMINI_PRODUCTION_PHOTO_MODEL=gemini-2.0-flash-preview-image-generation`.

## 4. Prompt (seating + white background)

The retouch prompt is in `server/lib/productionPhotoRetouchPrompt.js` (per preset: upholstery including Curtains/Pillows, and carpentry). After AI output, **sharp** flattens to `#FFFFFF` for clean catalog edges.
