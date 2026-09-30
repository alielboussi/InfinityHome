# Stocktake PDF pipeline (all locations) — STOCKTAKE_PIPELINE_LOCKED

**Do not change this pipeline unless the product owner explicitly commands a stocktake PDF / variance / period-stock change.** AI agents: see `AGENTS.md` and `.cursor/rules/stocktake-pdf-lock.mdc`.

Applies to every warehouse and outlet location (not location-specific hacks).

## PDF types covered by this lock (all locations)

| PDF | Generator / entry points |
|-----|---------------------------|
| **Opening stock** | `downloadPeriodOpeningAggregationPdf` in `stocktakeAggregationPdf.js`; manual buttons in `StocktakePeriodPdfActions.js`; auto on initial submit / rollover opening via `downloadStocktakeSubmitPdfBundle` |
| **Closing stock** | `downloadPeriodClosingAggregationPdf` in `stocktakeAggregationPdf.js`; manual buttons in `StocktakePeriodPdfActions.js`; auto on rollover via `downloadStocktakeSubmitPdfBundle` |
| **Variance report** | `downloadStocktakeVariancePdf` in `stocktakeVariancePdf.js` |
| **Pre-submit aggregation review** | `downloadStocktakeAggregationPdf` in `stocktakeAggregationPdf.js` (`StocktakeAggregationPage.js`) |
| **Count sheet** | `downloadStocktakeCountSheetPdf` in `stocktakeVariancePdf.js` (`StocktakeControlPage.js`) |

Shared layout for opening/closing/aggregation review: same table chrome (`stocktakePdfTableTheme.js`, `stocktakePdfSetGroups.js`, signatures, page borders). Row data for period opening/closing: `stocktakePeriodPdfRows.js` / variance alignment when closed.

## Period variance inputs (all future periods)

Every closed (and PDF-generated) period uses **`buildVarianceRows`** in `stocktakeVarianceRows.js`:

| Source | Origin in product | Included in variance |
|--------|---------------------|----------------------|
| **Sales** | POS at each location (`/pos` → `sales` + `sales_items`, filtered by `location_id` and period dates via `sumSales`) | **Sales** column; products with sales appear on report (with imputed opening when needed). |
| **Transfers in/out** | `/transfers` (`stock_transfer_sessions` + `stock_transfer_entries`, `sumTransfers` in `stocktakeTransferSessions.js`) | **Trans In** / **Trans Out**; **approved** sessions only for new transfers; **legacy** null/empty status sessions still count. |
| **Opening / closing** | Stocktake period entries + counts | Opening (recorded + imputation), closing from count. |

No manual merging of sales or transfers into PDFs — the same queries run for every location and every period.

## Behaviour (canonical)

1. **Period opening/closing PDFs** — flat component lines only (set scans expanded), A–Z by product name. No set-group header rows.
2. **Period opening/closing PDFs** — row source is `resolveOpeningPdfRows` / `resolveClosingPdfRows` in `stocktakePeriodPdfRows.js`, which always loads **`buildVarianceRows`** (via `getPeriodVariance` when closed, else `getPeriodLedgerVarianceRows`) so **imputed opening** matches the variance report; opening PDF lines use `opening_stock_qty`, closing PDF uses `closing_stock_qty` (zeros included on closing PDF). Fallback to stored period entries only if variance cannot be built.
3. **Variance report** — flat component lines; grid borders; white body cells; `K 1,234` currency (no decimals); **Trans In** / **Trans Out** from `stock_transfer_sessions` in the period (`sumTransfers` in `stocktakeTransferSessions.js`: **approved** new transfers on `/transfers` plus **legacy** product-list sessions with null/empty status); **Current** = Opening + Trans In − Trans Out − Sales; **Variance** = Closing − Current (PDF body recomputes both from row qtys); **Total** amount row. Lines include every product with period **sales**, **closing**, or **transfers**, not only opening-count rows. When recorded opening is 0 but **sales > 0**: impute **Opening** = `Sales + Closing − Trans In + Trans Out` if **Closing > 0**, else `Sales − Trans In + Trans Out`; closed-period **opening stock PDF** uses the same imputed opening qtys from variance.
4. **Set Price column** — consecutive rows sharing `set_combo_id` use one Excel-style merged cell (`rowSpan`), centred text when a price exists; merged cell still spans rows when price is missing.
5. **Set component amounts** — `stocktakeSetComponentPricing.js`: BOM lines without own price use combined component list prices or set promo/standard (location overrides); amounts allocate across BOM qty.
6. **Auto PDFs on admin submit** — `downloadStocktakeSubmitPdfBundle` in `StocktakePeriodPdfActions.js`.
7. **Inventory on period close** — `reconcileInventoryFromVariance` in `api/stocktake.js`.

## File manifest (touch only on explicit user request)

| Area | Paths |
|------|--------|
| Ledger math (locked) | `src/utils/stocktakeVarianceLedger.js` |
| Row sources | `src/utils/stocktakePeriodPdfRows.js`, `src/utils/periodPdfFromVariance.js`, `src/utils/stocktakeVarianceRows.js` |
| Set pricing + merge plan | `src/utils/stocktakeSetComponentPricing.js` |
| PDF generators | `src/utils/stocktakeVariancePdf.js`, `src/utils/stocktakeAggregationPdf.js` |
| Table chrome | `src/utils/stocktakePdfTableTheme.js`, `src/utils/stocktakePdfSetGroups.js`, `src/utils/stocktakePdfPageNumbers.js`, `src/utils/stocktakePdfSignatures.js`, `src/utils/stocktakePdfFormat.js` |
| UI actions | `src/components/StocktakePeriodPdfActions.js`, `src/StocktakeAggregationPage.js` (submit PDF bundle + review PDF), `src/StocktakeControlPage.js` (count sheet), `src/StocktakePeriodsPage.js` / `src/StocktakeControlPage.js` (period PDF buttons) |
| API close | `api/stocktake.js` (`reconcileInventoryFromVariance` path) |

## Automated period lifecycle (no manual fixes)

Every location follows the same path; no one-off scripts or hand-edited PDF rows for normal closes.

| Step | What happens |
|------|----------------|
| **Initial submit** | Scanned counts → `opening_stock_entries`; auto **opening stock PDF** from scan (`downloadStocktakeSubmitPdfBundle`). |
| **During period** | Sales, transfers (`/transfers` approved + legacy null-status sessions), adjustments feed `buildVarianceRows` when PDFs are generated. |
| **Rollover submit** | Scans → `closing_stock_entries`; period **closed**; `buildVarianceRows` → **`reconcileInventoryFromVariance`** (live stock = variance closing); next period `opening_stock_entries` from scan totals; auto-download **closing PDF**, **variance PDF**, and **next period opening PDF** (opening qtys = prior variance **closing**, via `rolloverOpeningPdfRowsFromClosedVariance`). |
| **Any time (closed period)** | Manual buttons use `resolveOpeningPdfRows` / `resolveClosingPdfRows` → same `buildVarianceRows` rows as variance (imputed opening included). |

**Single ledger math module:** `src/utils/stocktakeVarianceLedger.js` (`resolveOpeningQtyForVariance`, `computeVarianceLedgerQtys`). Variance PDF recomputes Current/Variance from those columns in `stocktakeVariancePdf.js`.

**Regression (prebuild):**

- `node scripts/verifyStocktakeVarianceLedger.js` — ledger formulas + imputation
- `node scripts/verifyStocktakeTransferVariance.js` — `/transfers` approved + legacy transfer rules
- `node scripts/verifyStocktakeLockMarkers.js` — lock tags present on core files

**Reference validation:** Lusaka period `2026-08-02` → `2026-09-30` (opening/closing/variance PDFs) verified against sold-through and partial-close patterns; future periods use the same code path automatically.

## AI agents

- **No** refactors, formatting sweeps, or “consistency” edits in the manifest without an explicit user instruction naming stocktake PDFs (including **opening** and **closing**), variance reports, or period stock behaviour.
- **No** reverting to `opening_aggregation` / set-group rows for period PDFs.
- **No** location-specific variance/PDF forks or manual “fixup” scripts for routine period close (use `buildVarianceRows` + submit bundle).
- When the user does request changes, update this doc if behaviour shifts and extend `verifyStocktakeVarianceLedger.js` if ledger rules change.
