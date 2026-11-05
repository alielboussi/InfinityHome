import {
  saveUpholsteryProductSelection,
  saveUpholsteryRawAssemblyLink,
  saveUpholsteryProductMaterials,
} from '../../src/utils/upholsteryCatalogMutations.js';
import {
  listUpholsteryCatalogProducts,
  parseUpholsteryMeta,
  warehouseCatalogProductCandidates,
} from '../../src/utils/upholsteryCatalogView.js';

export {
  saveUpholsteryProductSelection,
  saveUpholsteryRawAssemblyLink,
  saveUpholsteryProductMaterials,
  listUpholsteryCatalogProducts,
  parseUpholsteryMeta,
  warehouseCatalogProductCandidates,
};

const ASSEMBLIES = 'warehouse_assemblies';

export async function assertUpholsteryCatalogAssembly(sb, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error } = await sb.from(ASSEMBLIES).select('id, metadata').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load product');
  if (!row?.id) throw new Error('Product not found.');
  if (!parseUpholsteryMeta(row).selected) {
    throw new Error('This product is not on the Upholstery catalog. Add it on the web Upholstery page first.');
  }
  return row;
}
