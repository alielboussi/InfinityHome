/**
 * Ensures enterprise form/toolbar alignment layer is wired.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const index = read('src/index.js');
assert(index.includes("import './portal-form-layout.css'"), 'index.js must import portal-form-layout.css');

const layout = read('src/portal-form-layout.css');
assert(layout.includes('--portal-control-height'), 'portal-form-layout must define control height');
assert(layout.includes('products-list-toolbar-row'), 'products toolbar row rules required');
assert(layout.includes('overflow-x: clip'), 'app shell must clip horizontal overflow');

console.log('verifyPortalFormLayout: OK');
