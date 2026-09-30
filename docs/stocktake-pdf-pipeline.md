# Stocktake PDF pipeline (all locations) — LOCKED

**Do not change this pipeline unless the product owner explicitly commands a stocktake PDF / variance / period-stock change.**

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

## Behaviour (canonical)

1. **Period opening/closing PDFs** — flat component lines only (set scans expanded), A–Z by product name. No set-group header rows.
2. **Closed periods** — opening/closing qtys match the variance report (`periodLedgerPdfRowsFromVariance` ← `stocktakeVarianceRows.js`).
3. **Variance report** — flat component lines; grid borders; white body cells; `K 1,234` currency (no decimals); **Variance** column; **Total** amount row.
4. **Set Price column** — consecutive rows sharing `set_combo_id` use one Excel-style merged cell (`rowSpan`), centred text when a price exists; merged cell still spans rows when price is missing.
5. **Set component amounts** — `stocktakeSetComponentPricing.js`: BOM lines without own price use combined component list prices or set promo/standard (location overrides); amounts allocate across BOM qty.
6. **Auto PDFs on admin submit** — `downloadStocktakeSubmitPdfBundle` in `StocktakePeriodPdfActions.js`.
7. **Inventory on period close** — `reconcileInventoryFromVariance` in `api/stocktake.js`.

## File manifest (touch only on explicit user request)

| Area | Paths |
|------|--------|
| Row sources | `src/utils/stocktakePeriodPdfRows.js`, `src/utils/periodPdfFromVariance.js`, `src/utils/stocktakeVarianceRows.js` |
| Set pricing + merge plan | `src/utils/stocktakeSetComponentPricing.js` |
| PDF generators | `src/utils/stocktakeVariancePdf.js`, `src/utils/stocktakeAggregationPdf.js` |
| Table chrome | `src/utils/stocktakePdfTableTheme.js`, `src/utils/stocktakePdfSetGroups.js`, `src/utils/stocktakePdfPageNumbers.js`, `src/utils/stocktakePdfSignatures.js`, `src/utils/stocktakePdfFormat.js` |
| UI actions | `src/components/StocktakePeriodPdfActions.js`, `src/StocktakeAggregationPage.js` (submit PDF bundle + review PDF), `src/StocktakeControlPage.js` (count sheet), `src/StocktakePeriodsPage.js` / `src/StocktakeControlPage.js` (period PDF buttons) |
| API close | `api/stocktake.js` (`reconcileInventoryFromVariance` path) |

## AI agents

- **No** refactors, formatting sweeps, or “consistency” edits in the manifest without an explicit user instruction naming stocktake PDFs (including **opening** and **closing**), variance reports, or period stock behaviour.
- **No** reverting to `opening_aggregation` / set-group rows for period PDFs.
- When the user does request changes, update this doc if behaviour shifts.
