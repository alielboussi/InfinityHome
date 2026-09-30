#!/usr/bin/env node
/**
 * Regression: transfers included in period variance (Trans In / Out).
 * Run: node scripts/verifyStocktakeTransferVariance.js
 */
import { transferSessionCountsInVariance } from '../src/utils/stocktakeTransferSessions.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('[verifyStocktakeTransferVariance] FAIL:', msg);
    process.exit(1);
  }
}

assert(transferSessionCountsInVariance({ status: 'approved' }), 'approved /transfers session');
assert(transferSessionCountsInVariance({ status: null }), 'legacy null status');
assert(transferSessionCountsInVariance({ status: '' }), 'legacy empty status');
assert(!transferSessionCountsInVariance({ status: 'cancelled' }), 'cancelled excluded');
assert(!transferSessionCountsInVariance({ status: 'failed' }), 'failed excluded');
assert(!transferSessionCountsInVariance({ status: 'pending' }), 'pending excluded');

console.log('[verifyStocktakeTransferVariance] OK — /transfers approved + legacy null-status rules locked.');
