# Local development (`npm start`)

The React app no longer uses `src/setupProxy.js`. On **localhost**, all `/api/*` calls go to your **deployed** Vercel app via `REACT_APP_API_BASE`.

## Required: `.env.local`

Create `C:\Projects\Infinity Home\.env.local` (gitignored) with at least:

```env
REACT_APP_API_BASE=https://www.infinity-home.online
```

Use the same host you deploy to (e.g. `https://infinity-home-pi.vercel.app` if that is your preview URL).

If the site uses Vercel Deployment Protection, add:

```env
REACT_APP_VERCEL_BYPASS=your-bypass-token
```

## Optional

```env
# Force server APIs even when REACT_APP_API_BASE is unset (not recommended)
REACT_APP_FORCE_API=1
```

## Production

On Vercel, `REACT_APP_API_BASE` is usually **unset**. The UI uses same-origin `/api/*` and `vercel.json` rewrites — no proxy file involved.

## Notes

- Local UI changes apply immediately; **API behavior** matches whatever is **deployed** at `REACT_APP_API_BASE` until you deploy your branch.
- APIs send `Access-Control-Allow-Origin: *`, so browser calls from `localhost:3000` work without a dev proxy.
