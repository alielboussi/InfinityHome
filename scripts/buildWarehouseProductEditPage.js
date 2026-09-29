const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const snippetPath = path.join(root, 'src', '_wh_product_form_snippet.txt');
if (!fs.existsSync(snippetPath)) {
  console.error('Run snippet extract first');
  process.exit(1);
}
let form = fs.readFileSync(snippetPath, 'utf8');
form = form
  .replace(/^\s*\{activeForm === 'product' && canManage && \(\s*\n\s*/, '')
  .replace(/\n\s*\)\}\s*$/, '\n');
form = form.replace(
  /\{editingProductId \? 'Edit product' : 'New product'\}/g,
  "{isNew ? 'New product' : 'Edit product'}",
);
form = form.replace(/onClick=\{closeForms\}/g, "onClick={() => navigate('/warehouse-products')}");

const header = fs.readFileSync(path.join(root, 'scripts', 'warehouseProductEditPage.header.js'), 'utf8');
const page = `${header}
  return (
    <div className="products-container warehouse-products-page" style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>{isNew ? 'New product' : 'Edit product'}</h1>
      </div>
      {error ? <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div> : null}
      {loading || !formReady ? <p>Loading…</p> : (
${form}
      )}
    </div>
  );
}
`;

fs.writeFileSync(path.join(root, 'src', 'WarehouseProductEditPage.js'), page);
console.log('WarehouseProductEditPage.js written');
