import { requireBearerUser } from '../lib/verifyBearerUser.js';
import { getDataClient } from '../lib/getDataClient.js';
import { canManageCatalog } from '../../src/accessControl.js';
import { saveUpholsteryProductSelection, saveUpholsteryRawAssemblyLink, saveUpholsteryProductMaterials } from '../lib/upholsteryCatalog.js';
import { buildUpholsteryCatalogPayload } from '../../src/utils/upholsteryCatalogView.js';
import { loadProductionPortalCatalogInputs } from '../lib/loadProductionPortalCatalogInputs.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function requireCatalogUser(req) {
  const user = await requireBearerUser(req);
  if (!canManageCatalog(user)) {
    const err = new Error('Catalog admin access required');
    err.status = 403;
    throw err;
  }
  const db = getDataClient();
  return { db, user };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { db } = await requireCatalogUser(req);
    const body = req.method === 'GET' ? req.query : (req.body || {});
    const op = String(body.op || body.action || 'list').trim().toLowerCase();

    if (op === 'list') {
      const [{ data: assemblies, error }, { data: setItems, error: setItemsErr }] = await Promise.all([
        db.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata'),
        db.from('warehouse_set_items').select('set_assembly_id, component_assembly_id, quantity, location_id'),
      ]);
      if (error) throw new Error(error.message || 'Failed to load catalog');
      if (setItemsErr) throw new Error(setItemsErr.message || 'Failed to load set lines');
      const portalInputs = await loadProductionPortalCatalogInputs(db);
      res.status(200).json(buildUpholsteryCatalogPayload(assemblies || [], setItems || [], portalInputs));
      return;
    }

    if (op === 'save-product') {
      const assemblyId = body.assembly_id || body.assemblyId;
      const selected = body.selected !== false;
      await saveUpholsteryProductSelection(db, assemblyId, selected);
      res.status(200).json({ ok: true });
      return;
    }

    if (op === 'save-raw-link') {
      await saveUpholsteryRawAssemblyLink(
        db,
        body.assembly_id || body.finished_assembly_id,
        body.raw_assembly_id,
      );
      res.status(200).json({ ok: true });
      return;
    }

    if (op === 'save-materials') {
      await saveUpholsteryProductMaterials(db, body.assembly_id || body.assemblyId, body.materials);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown op: ${op}` });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'upholstery-catalog failed' });
  }
}
