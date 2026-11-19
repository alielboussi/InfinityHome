/**
 * Upholstery app — Expo production push wiring (registration, channel, server targets).
 * Run: node scripts/verifyUpholsteryProductionPush.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const pushJs = read('mobile-apps/warehouse-upholstery/lib/productionPushNotifications.js');
const appConfig = read('mobile-apps/warehouse-upholstery/app.config.js');
const appJs = read('mobile-apps/warehouse-upholstery/App.js');
const hook = read('mobile-apps/warehouse-upholstery/hooks/useProductionPushNotifications.js');
const serverPush = read('server/lib/productionExpoPush.js');

assert(pushJs.includes("app_target: 'upholstery'"), 'upholstery must register app_target upholstery');
assert(pushJs.includes("'production-alerts'"), 'upholstery must create production-alerts Android channel');
assert(pushJs.includes('shouldShowAlert'), 'foreground notification handler must show alerts');
assert(pushJs.includes('subscribeProductionPushListeners'), 'push listeners must be subscribed');

assert(appConfig.includes("defaultChannel: 'production-alerts'"), 'app.config defaultChannel must match production-alerts');
assert(appConfig.includes('POST_NOTIFICATIONS'), 'Android must declare POST_NOTIFICATIONS');
assert(appConfig.includes('expo-notifications'), 'expo-notifications plugin required');

assert(appJs.includes('useProductionPushNotifications'), 'App must wire push hook');
assert(hook.includes('registerProductionPushTokenWithServer'), 'hook must register token when access granted');

assert(serverPush.includes("appTargets: ['upholstery']"), 'server must target upholstery tokens');
assert(serverPush.includes('notifyProductionQuoteOrderSent'), 'quote send must push upholstery/carpentry');
assert(serverPush.includes("channelId: 'production-alerts'"), 'push payload must use production-alerts channel');

const manifest = read('mobile-apps/warehouse-upholstery/shared/mobileAccessManifest.js');
assert(manifest.includes('upholstery_push_settings'), 'User Access must expose push settings screen');

console.log('verifyUpholsteryProductionPush: ok');