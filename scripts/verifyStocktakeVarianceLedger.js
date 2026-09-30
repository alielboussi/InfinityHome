#!/usr/bin/env node
/**
 * Regression: locked stocktake variance ledger math (all locations / future periods).
 * Run: node scripts/verifyStocktakeVarianceLedger.js
 */
import {
  computeVarianceLedgerQtys,
  resolveOpeningQtyForVariance,
} from '../src/utils/stocktakeVarianceLedger.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('[verifyStocktakeVarianceLedger] FAIL:', msg);
    process.exit(1);
  }
}

function checkCase(label, input, expect) {
  const got = computeVarianceLedgerQtys(input);
  for (const [key, val] of Object.entries(expect)) {
    if (got[key] !== val) {
      console.error(`[verifyStocktakeVarianceLedger] FAIL ${label}: ${key} got ${got[key]} want ${val}`);
      process.exit(1);
    }
  }
  const cur = got.opening_stock_qty + got.transfers_in - got.transfers_out - got.sales;
  assert(cur === got.current_stock_qty, `${label}: current formula`);
  assert(got.variance === got.closing_stock_qty - got.current_stock_qty, `${label}: variance formula`);
}

// Sold through (Lusaka-style): no recorded opening, closing 0
checkCase(
  'sold-through',
  { recordedOpening: 0, sales: 1, transfersIn: 0, transfersOut: 0, closingQty: 0 },
  { opening_stock_qty: 1, sales: 1, current_stock_qty: 0, closing_stock_qty: 0, variance: 0 },
);

// Partial count at close (stripes / optimum / recliner pattern)
checkCase(
  'sold-with-closing',
  { recordedOpening: 0, sales: 1, transfersIn: 0, transfersOut: 0, closingQty: 1 },
  { opening_stock_qty: 2, sales: 1, current_stock_qty: 1, closing_stock_qty: 1, variance: 0 },
);

// Recorded opening wins
checkCase(
  'recorded-opening',
  { recordedOpening: 2, sales: 1, transfersIn: 0, transfersOut: 0, closingQty: 1 },
  { opening_stock_qty: 2, sales: 1, current_stock_qty: 1, closing_stock_qty: 1, variance: 0 },
);

// Transfers in period
checkCase(
  'transfers',
  { recordedOpening: 5, sales: 2, transfersIn: 1, transfersOut: 3, closingQty: 2 },
  { opening_stock_qty: 5, current_stock_qty: 1, variance: 1 },
);

assert(
  resolveOpeningQtyForVariance({
    recordedOpening: 0,
    sales: 1,
    transfersIn: 2,
    transfersOut: 0,
    closingQty: 0,
  }) === 1,
  'imputed opening with trans in',
);

console.log('[verifyStocktakeVarianceLedger] OK — ledger math matches locked pipeline.');
