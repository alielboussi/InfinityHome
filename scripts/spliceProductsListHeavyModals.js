const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'src/ProductsListPage.js');
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('{factoryStorageModalOpen && factoryStorageModalProduct');
const end = s.indexOf('{/* ======== End fixed modals ======== */}');
if (start < 0 || end < 0) {
  console.error('markers missing', start, end);
  process.exit(1);
}
const insert = `{productsListHeavyModalOpen && (
        <Suspense fallback={null}>
          <ProductsListHeavyModals {...productsListHeavyModalProps} />
        </Suspense>
      )}
      {/* ======== End fixed modals ======== */}`;
s = s.slice(0, start) + insert + s.slice(end);
fs.writeFileSync(p, s);
console.log('spliced heavy modals from ProductsListPage');
