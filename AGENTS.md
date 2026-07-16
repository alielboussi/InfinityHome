# Repository Rules

## Vercel API Budget

- Keep physical Vercel serverless API files in `api/*.js` below 10 whenever possible.
- Hard limit: never exceed 12 physical files in `api/*.js`.
- When adding backend endpoints, prefer routing through an existing consolidated dispatcher such as `api/admin.js`, `api/transactions.js`, `api/stocktake.js`, `api/customers.js`, `api/labels.js`, `api/notify.js`, or `api/health.js`.
- Preserve public endpoint compatibility with `vercel.json` rewrites instead of creating new top-level API files.
- The build checks this budget in `scripts/checkEnv.js`; do not bypass that check.
