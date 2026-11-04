import { createWarehouseDeliveryNameFormatter } from '../../src/utils/warehouseDeliveryDisplayName.js';

export { createWarehouseDeliveryNameFormatter } from '../../src/utils/warehouseDeliveryDisplayName.js';

export async function loadWarehouseDeliveryNameFormatter(sb) {
  const [{ data: assemblies }, { data: assemblyColors }, { data: colors }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, has_color_variants, item_kind'),
    sb.from('warehouse_assembly_colors').select('assembly_id, color_id'),
    sb.from('warehouse_colors').select('id, name, name_key'),
  ]);
  return createWarehouseDeliveryNameFormatter({
    assemblies: assemblies || [],
    assemblyColors: assemblyColors || [],
    colors: colors || [],
  });
}

export async function loadWarehouseDeliveryColorContext(sb) {
  const [{ data: assemblies }, { data: assemblyColors }, { data: colors }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, has_color_variants, item_kind'),
    sb.from('warehouse_assembly_colors').select('assembly_id, color_id'),
    sb.from('warehouse_colors').select('id, name, name_key'),
  ]);
  return {
    assemblies: assemblies || [],
    assemblyColors: assemblyColors || [],
    colors: colors || [],
  };
}
