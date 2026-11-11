/**
 * Portal stale-while-revalidate: paint cached snapshot immediately; spinner only on miss.
 * Run: node scripts/verifyPortalSwrCache.js
 */
import {
  applyPortalSnapshot,
  cacheClear,
  cachePeek,
  cacheSet,
} from '../src/utils/staleCache.js';

const KEY = 'verify:portal-swr';
cacheClear(KEY);

let painted = null;
let loadingCalls = [];
const setLoading = (v) => { loadingCalls.push(v); };

const miss = applyPortalSnapshot(KEY, (snap) => { painted = snap; }, setLoading);
if (miss !== false) throw new Error('expected miss on empty cache');
if (painted != null) throw new Error('apply must not paint on miss');
if (loadingCalls[0] !== true) throw new Error('first visit must request spinner');

cacheSet(KEY, { quotes: [{ id: 1 }], mostSoldProduct: { name: 'Chair', qty: 3 } }, 50);

loadingCalls = [];
painted = null;
const hit = applyPortalSnapshot(KEY, (snap) => { painted = snap; }, setLoading);
if (hit !== true) throw new Error('expected hit after cacheSet');
if (!painted || painted.quotes?.[0]?.id !== 1) throw new Error('snapshot must paint immediately');
if (loadingCalls[0] !== false) throw new Error('revisit must skip spinner');

await new Promise((r) => setTimeout(r, 60));
const expired = cachePeek(KEY);
if (!expired || expired.quotes?.[0]?.id !== 1) {
  throw new Error('cachePeek must keep expired snapshot for instant revisit');
}

cacheClear(KEY);
console.log('portal SWR cache: OK');
