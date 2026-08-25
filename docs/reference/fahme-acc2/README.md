# Mohammad Fahme Acc(2) — reference statement

Signed-off layby statement used as the regression baseline for Acc(2).

| Field | Value |
|-------|-------|
| Customer ID | `efb21cad-1a8d-4d64-9487-51e816fcb429` |
| Reference PDF | [Mohammad_Fahme_Acc2_Layby_Statement_2026-08-25_USD.pdf](./Mohammad_Fahme_Acc2_Layby_Statement_2026-08-25_USD.pdf) |
| Total Sale | $30,965 |
| Total Deposit | $2,000 |
| Total Due | $28,965 |

## Regression check

```bash
node scripts/verifyFahmeAcc2Statement.js
```

This validates live DB sales, line items, merged/deduped payments, and pooled rollup totals against `expected-statement.json`.

## Rollup rules (must stay consistent)

- **Layby Management**, **PDF export**, **WhatsApp**, and **All Sales** customer totals use `computePooledLaybyTotalsByCurrency` from `src/utils/laybyRollup.js` (via `laybyColumnTotals.js`).
- Acc(2) uses **live DB only** — no PDF/telegram fallback JSON (`shouldUseFahmeLiveStatementOnly` in `src/laybyRules.js`).
- Payments in both `sales_payments` and `layby_payments` are **deduped** (`fetchMergedLaybyPayments` + `dedupeLaybyPaymentRows`).
- Sale amounts are **VAT-inclusive** (`vat_inclusive: true`, `vat_apply: false`).

New real sales or deposits on Acc(2) should increase totals correctly; fallback/migration rows must never be reintroduced for this account.
