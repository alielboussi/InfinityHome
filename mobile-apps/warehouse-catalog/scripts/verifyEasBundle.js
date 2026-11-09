/**
 * Fail fast before EAS upload if Android bundle cannot be produced.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const catalogRoot = path.resolve(__dirname, '..');
const repoSrcVendor = path.join(catalogRoot, 'shared', 'repoSrc');

execSync('node scripts/materializeSharedForEas.js', { cwd: catalogRoot, stdio: 'inherit' });

if (!fs.existsSync(repoSrcVendor)) {
  console.error('[verifyEasBundle] missing shared/repoSrc after materialize');
  process.exit(1);
}

const required = [
  'shared/repoSrc/utils/warehouseSetMath.js',
  'shared/repoSrc/utils/isMattressCatalogProductName.js',
  'shared/metroInlineRequires.js',
  'shared/expoAndroidLightweight.js',
];
for (const rel of required) {
  const full = path.join(catalogRoot, rel);
  if (!fs.existsSync(full)) {
    console.error('[verifyEasBundle] missing', rel);
    process.exit(1);
  }
}

const outDir = path.join(catalogRoot, '.expo-export-verify');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });

execSync(`npx expo export --platform android --output-dir "${outDir}"`, {
  cwd: catalogRoot,
  stdio: 'inherit',
  env: { ...process.env, CI: '1' },
});

console.log('verifyEasBundle: ok');
