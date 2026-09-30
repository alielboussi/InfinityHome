# Repository Rules

## Local `npm start` (no dev proxy)

- `src/setupProxy.js` is removed. Localhost calls production APIs through `src/utils/apiUrl.js` when `REACT_APP_API_BASE` is set in `.env.local`.
- See `docs/local-development.md`.

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
- Mohammad Fahme accounts use the same pooled statement rollup as all layby customers (no frozen totals or payment blocks).
- Optional reference snapshots for regression: `docs/reference/fahme-acc2/` (`node scripts/verifyFahmeAcc2Statement.js`), `docs/reference/fahme-primary/` (`node scripts/verifyFahmePrimaryStatement.js`).

## Stocktake PDFs (all locations) — STOCKTAKE_PIPELINE_LOCKED

**AI agents: do not edit stocktake / period / count / variance / PDF code unless the user explicitly asks to change that behaviour in the current message.** This lock covers **stock periods**, **stocktake counts**, **every** stocktake PDF at **every** location, period-close inventory, and variance inputs (**POS sales** + **`/transfers`**). No drive-by fixes, refactors, or “improvements”. Full spec: **`docs/stocktake-pdf-pipeline.md`**; file-pattern rule: **`.cursor/rules/stocktake-locked-files.mdc`**.

Summary (all locations):

- **Opening / closing PDFs:** flat component lines A–Z; qtys from `buildVarianceRows` (imputed opening when needed); shared grid/signatures/borders via `stocktakeAggregationPdf.js` + table theme helpers.
- **Variance PDF:** white grid cells; merged **Price** for consecutive `set_combo_id` rows (including empty price), centred when present; **Current** and **Variance** from locked formulas in `stocktakeVarianceLedger.js`.
- **Automation:** rollover submit closes period → variance rows → inventory reconcile → auto closing/variance/next-opening PDFs; no manual PDF fixups per period.
- **Regression:** `node scripts/verifyStocktakeVarianceLedger.js`, `node scripts/verifyStocktakeTransferVariance.js`, `node scripts/verifyStocktakeLockMarkers.js` (also run on `npm run build` via `checkEnv.js`)
- **Variance data:** period sales from POS (`sumSales`); transfers from `/transfers` approved + legacy sessions (`sumTransfers`)
- **Submit / UI:** `StocktakePeriodPdfActions.js`, `StocktakeAggregationPage.js` bundle; inventory close via `reconcileInventoryFromVariance` in `api/stocktake.js`.
