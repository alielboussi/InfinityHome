/**
 * html5-qrcode ships broken source-map references. CRA's source-map-loader
 * then floods the console with ENOENT warnings. Strip sourceMappingURL
 * comments from JavaScript before removing the unusable map files.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'html5-qrcode');

function silenceMaps(dir) {
  if (!fs.existsSync(dir)) return 0;
  let changed = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      changed += silenceMaps(full);
    } else if (name.endsWith('.js')) {
      try {
        const source = fs.readFileSync(full, 'utf8');
        const next = source.replace(
          /(?:\r?\n)?\/\/[#@]\s*sourceMappingURL=[^\r\n]*\s*$/gm,
          ''
        );
        if (next !== source) {
          fs.writeFileSync(full, next, 'utf8');
          changed += 1;
        }
      } catch {}
    } else if (name.endsWith('.map')) {
      try {
        fs.unlinkSync(full);
        changed += 1;
      } catch {}
    }
  }
  return changed;
}

const count = silenceMaps(root);
if (process.env.npm_lifecycle_event !== 'postinstall' || count > 0) {
  console.log(`[html5-qrcode] silenced ${count} broken source map reference(s)`);
}
