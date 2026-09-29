const fs = require('fs');
const p = 'src/WarehouseProductsPage.js';
let s = fs.readFileSync(p, 'utf8');
const marker = '{false && activeForm === \'product\'';
const start = s.indexOf(marker);
const end = s.indexOf('{loading ?', start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
s = s.slice(0, start) + s.slice(end);
fs.writeFileSync(p, s);
console.log('ok');
