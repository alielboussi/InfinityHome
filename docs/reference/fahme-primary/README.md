# Mohammad Fahme (primary) — reference statement

Signed-off layby statement baseline for the primary Mohammad Fahme account.

| Field | Value |
|-------|-------|
| Customer ID | `d8e756ae-b8ea-4f90-b99a-70c1120f52b9` |
| Reference PDF | [Mohammad_Fahme_Layby_Statement_2026-07-29_USD.pdf](./Mohammad_Fahme_Layby_Statement_2026-07-29_USD.pdf) |
| Total Sale | $193,570 |
| Total Deposit | $152,390 |
| Total Due | $41,180 (PDF footer: "Due Remaining") |

Settlement: 13 payments totaling $152,390. PDF equation: $193,570 − $152,390 = **$41,180**.

## Rebuild expected data from PDF

```bash
node scripts/buildFahmePrimaryExpected.js
```

## Reset live DB to match PDF

```bash
node scripts/resetFahmePrimaryLaybyData.js --apply
```

## Regression check

```bash
node scripts/verifyFahmePrimaryStatement.js
```

## Notes

- 42 dated layby sales (Jan–Dec 2025) with line items from the PDF
- 13 settlement deposits (includes Jul 2026 $20,000 from latest PDF)
- Sale on 17 Jun 2025 carries a $600 discount per the PDF
- Live data only — no PDF fallback JSON in rollups (`shouldUseFahmeLiveStatementOnly`)
