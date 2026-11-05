/**
 * Remove a stray second `export function textForDisplay` block (Metro parse error).
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'lib', 'productionKioskI18n.js');
let src = fs.readFileSync(filePath, 'utf8');

const fnPattern = /export function textForDisplay\(value, fallback = ''\) \{\s*if \(value === null \|\| value === undefined\) return fallback;\s*const text = String\(value\);\s*return text \|\| fallback;\s*\}/g;
const matches = [...src.matchAll(fnPattern)];
if (matches.length > 1) {
  let seen = 0;
  src = src.replace(fnPattern, (match) => {
    seen += 1;
    return seen === 1 ? match : '';
  });
  fs.writeFileSync(filePath, src);
  console.log('[dedupeTextForDisplayExport] removed', matches.length - 1, 'duplicate block(s)');
} else {
  console.log('[dedupeTextForDisplayExport] ok —', matches.length, 'export function block(s)');
}
