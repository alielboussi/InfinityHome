import { requireBearerUser } from '../lib/verifyBearerUser.js';
import { getDataClient } from '../lib/getDataClient.js';
import { canManageCatalog } from '../../src/accessControl.js';
import {
  saveCarpentryProductMaterials,
  saveCarpentryProductSelection,
} from '../lib/carpentryCatalog.js';
import { buildCarpentryCatalogPayload } from '../../src/utils/carpentryCatalogView.js';
import { loadProductionPortalCatalogInputs } from '../lib/loadProductionPortalCatalogInputs.js';
import {
  receiveStoreroomMaterial,
  createStoreroomMaterial,
  setStoreroomMaterialStockQty,
  removeStoreroomMaterialStockAtLocation,
  updateStoreroomMaterial,
} from '../../src/utils/storeroomStockMutations.js';
import {
  createMaterialUom,
  listMaterialUoms,
  materialUomSelectOptions,
} from '../../src/utils/materialUomMutations.js';

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
        db.from('warehouse_assemblies').select('id, name, family_sku, item_kind, category_id, metadata'),
        db.from('warehouse_set_items').select('set_assembly_id, component_assembly_id, quantity, location_id'),
      ]);
      if (error) throw new Error(error.message || 'Failed to load catalog');
      if (setItemsErr) throw new Error(setItemsErr.message || 'Failed to load set lines');
      const portalInputs = await loadProductionPortalCatalogInputs(db);
      res.status(200).json(buildCarpentryCatalogPayload(assemblies || [], setItems || [], portalInputs));
      return;
    }

    if (op === 'receive-storeroom') {
      const result = await receiveStoreroomMaterial(db, body);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'create-storeroom-material') {
      const result = await createStoreroomMaterial(db, body);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'set-storeroom-stock') {
      const result = await setStoreroomMaterialStockQty(db, body);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'delete-storeroom-stock') {
      const result = await removeStoreroomMaterialStockAtLocation(db, body);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'update-storeroom-material') {
      const result = await updateStoreroomMaterial(db, body);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'list-material-uoms') {
      const uoms = await listMaterialUoms(db);
      res.status(200).json({ ok: true, uoms, options: materialUomSelectOptions(uoms) });
      return;
    }

    if (op === 'save-material-uom') {
      const uom = await createMaterialUom(db, body);
      res.status(200).json({ ok: true, uom });
      return;
    }

    if (op === 'save-product') {
      const assemblyId = body.assembly_id || body.assemblyId;
      const selected = body.selected !== false;
      await saveCarpentryProductSelection(db, assemblyId, selected);
      res.status(200).json({ ok: true });
      return;
    }

    if (op === 'save-materials') {
      await saveCarpentryProductMaterials(db, body.assembly_id || body.assemblyId, body.materials);
      res.status(200).json({ ok: true });
      return;
    }

    if (op === 'list-floor-runs') {
      const { listCarpentryFloorRunsEnriched } = await import('../lib/carpentryManufacture.js');
      const result = await listCarpentryFloorRunsEnriched(db, { limit: body.limit });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'list-carpentry-jobs') {
      const { listCarpentryProductionJobs } = await import('../lib/carpentryProductionJobs.js');
      const { listProductionQuotesForRoute } = await import('../lib/quoteProductionRouting.js');
      const activeOnly = body.active_only === true || body.activeOnly === true;
      const [result, quoteResult] = await Promise.all([
        listCarpentryProductionJobs(db, {
          activeOnly,
          limit: body.limit ?? 150,
        }),
        listProductionQuotesForRoute(db, 'carpentry', { limit: 150 }).catch(() => ({ rows: [] })),
      ]);
      res.status(200).json({
        ok: true,
        ...result,
        quote_orders: quoteResult?.rows || [],
      });
      return;
    }

    if (op === 'list-painting-jobs') {
      const { listPaintingProductionJobs } = await import('../lib/paintingProductionJobs.js');
      const activeOnly = body.active_only === true || body.activeOnly === true;
      const result = await listPaintingProductionJobs(db, {
        activeOnly,
        limit: body.limit ?? 150,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'add-floor2-product') {
      const { addFloor1ProductToFloor2 } = await import('../lib/carpentryManufacture.js');
      const result = await addFloor1ProductToFloor2(db, {
        assemblyId: body.assembly_id || body.assemblyId,
        productQty: body.product_qty ?? body.productQty ?? body.quantity ?? 1,
        userId: user?.id || user?.uid || null,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'set-floor2-stock') {
      const { setFloor2ProductStockQty } = await import('../lib/carpentryManufacture.js');
      const result = await setFloor2ProductStockQty(db, {
        assemblyId: body.assembly_id || body.assemblyId,
        quantity: body.quantity ?? body.product_qty ?? body.productQty ?? 0,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown op: ${op}` });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'carpentry-catalog failed' });
  }
}
