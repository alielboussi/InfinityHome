import assert from 'assert';
import { formatProductionElapsed } from '../src/utils/formatProductionElapsed.js';

assert.strictEqual(formatProductionElapsed(838_000), '00:13:58');
assert.strictEqual(formatProductionElapsed(3_600_000), '01:00:00');
assert.strictEqual(formatProductionElapsed(25 * 3_600_000), '1d 01:00:00');
assert.strictEqual(formatProductionElapsed(31 * 86_400_000), '1mo 1d 00:00:00');

console.log('verifyFormatProductionElapsed: ok');
