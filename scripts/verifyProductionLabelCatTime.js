import {
  formatProductionLabelBlockDate,
  formatProductionLabelBlockTime,
  PRODUCTION_LABEL_TIME_ZONE,
} from '../server/lib/warehouseProductionLabelCatTime.js';

if (PRODUCTION_LABEL_TIME_ZONE !== 'Africa/Lusaka') {
  console.error('[verifyProductionLabelCatTime] unexpected timezone:', PRODUCTION_LABEL_TIME_ZONE);
  process.exit(1);
}

const utc = new Date('2026-10-26T12:49:00.000Z');
const date = formatProductionLabelBlockDate(utc);
const time = formatProductionLabelBlockTime(utc);

if (!date.includes('26') || !date.includes('10') || !date.includes('2026')) {
  console.error('[verifyProductionLabelCatTime] bad date for CAT:', date);
  process.exit(1);
}
if (time.replace(/\s/g, '') !== '14:49') {
  console.error('[verifyProductionLabelCatTime] expected 14:49 CAT, got:', time);
  process.exit(1);
}

console.log('[verifyProductionLabelCatTime] ok');
