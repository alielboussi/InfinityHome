# Repository Rules

## Vercel API Budget

- Keep physical Vercel serverless API files in `api/*.js` below 10 whenever possible.
- Hard limit: never exceed 12 physical files in `api/*.js`.
- When adding backend endpoints, prefer routing through an existing consolidated dispatcher such as `api/admin.js`, `api/transactions.js`, `api/stocktake.js`, `api/customers.js`, `api/labels.js`, `api/notify.js`, or `api/health.js`.
- Preserve public endpoint compatibility with `vercel.json` rewrites instead of creating new top-level API files.
- The build checks this budget in `scripts/checkEnv.js`; do not bypass that check.

## Layby column totals

- **Single source of truth:** `src/utils/laybyColumnTotals.js`
- Layby Management table, PDF export, and WhatsApp resend must all use `computePooledLaybyTotalsByCurrency` / `buildLaybyCurrencyBucket` from that module (via `laybyRollup.js`).
- **Total Sale** = net contract value (after sale discount + VAT). **Total Due** = Total Sale − deposits − payment discounts only. Never subtract sale discount twice.
- Regression check: `node scripts/verifyLaybyColumnTotals.js`
- Fahme Acc(2) signed-off statement: `docs/reference/fahme-acc2/` — run `node scripts/verifyFahmeAcc2Statement.js`
- Primary Mohammad Fahme signed-off statement: `docs/reference/fahme-primary/` — run `node scripts/verifyFahmePrimaryStatement.js`

## Fahme signed-off statement lock

- Locked customer IDs and frozen totals live in `src/data/fahmeStatementLocks.json`.
- Helpers: `src/utils/fahmeStatementLock.js` — filters sales/payments and forces PDF totals for Layby table, PDF, WhatsApp, and `/api/layby-statement`.
- **Do not** add new sales/deposits for locked Fahme accounts in normal ops; payment create/delete is blocked server-side (403).
- To change a locked statement, update the reference JSON/PDF under `docs/reference/fahme-*`, then adjust `fahmeStatementLocks.json` and re-run the matching verify script.
