#!/usr/bin/env node
import 'dotenv/config';
import { cleanupStaleProductionPushTokens } from '../server/lib/productionExpoPush.js';

const maxAgeDays = Number(process.env.PUSH_TOKEN_MAX_AGE_DAYS || 90);
cleanupStaleProductionPushTokens({ maxAgeDays })
  .then((res) => {
    console.log('[cleanupProductionPushTokens]', res);
    process.exit(res.ok === false ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
