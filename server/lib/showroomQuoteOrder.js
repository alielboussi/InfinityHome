import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveQuoteLineQuantity } from '../../src/utils/quotationDisplay.js';
import { buildProductionLineSummaryRow } from '../../src/utils/quoteProductionItemFields.js';
import { assertSingleShowroomRoute, inferShowroomWorkshopRoute } from '../../src/utils/quoteShowroomOrder.js';
import { sendQuoteToProduction } from './quoteProductionRouting.js';
import { newUuid } from './uuid.js';

const ROUTING = 'quote_production_routing';
const FLOOR2_LOC = 'warehouse_floor_2_staging';

async function nextQuoteNumber(sb) {
  const { data: recent, error } = await sb
    .from('quotations')
    .select('quote_number, created_at')
    .ilike('quote_number', 'QT#%')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message || 'Failed to generate quote number');
  let maxNum = 0;
  (recent || []).forEach((r) => {
    const m = String(r.quote_number || '').match(/^QT#(\d+)$/i);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  return `QT#${maxNum + 1}`;
}

export async function loadFloor2QtyMap(sb, assemblyIds) {
  const ids = [...new Set((assemblyIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await sb
    .from('warehouse_assembly_inventory')
    .select('assembly_id, quantity')
    .eq('location_id', FLOOR2_LOC)
    .in('assembly_id', ids);
  if (error) throw new Error(error.message || 'Failed to load Floor 2 stock');
  const map = new Map();
  (data || []).forEach((row) => {
    map.set(String(row.assembly_id), Math.max(0, Number(row.quantity) || 0));
  });
  return map;
}

/**
 * Create a zero-price showroom quote from Floor 2 WIP lines and send to production immediately.
 */
export async function createShowroomQuoteAndSend(sb, body, user) {
  const linesIn = Array.isArray(body?.lines) ? body.lines : [];
  if (!linesIn.length) throw new Error('Add at least one Floor 2 product.');

  const assemblyIds = linesIn.map((l) => String(l.assembly_id || '').trim()).filter(Boolean);
  if (assemblyIds.length !== linesIn.length) throw new Error('Each line must include assembly_id.');

  const { data: assemblies, error: asmErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, metadata, category_id, image_url')
    .in('id', assemblyIds);
  if (asmErr) throw new Error(asmErr.message || 'Failed to load products');
  const asmById = new Map((assemblies || []).map((a) => [String(a.id), a]));

  const routes = [];
  const normalizedLines = [];
  for (const line of linesIn) {
    const aid = String(line.assembly_id || '').trim();
    const asm = asmById.get(aid);
    if (!asm) throw new Error(`Unknown Floor 2 product: ${aid}`);
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 0));
    const route = String(line.route || inferShowroomWorkshopRoute(asm)).toLowerCase();
    routes.push(route);
    normalizedLines.push({ assembly: asm, assembly_id: aid, quantity: qty, route });
  }

  const workshopRoute = assertSingleShowroomRoute(routes);
  const qtyMap = await loadFloor2QtyMap(sb, assemblyIds);

  const nowIso = new Date().toISOString();
  const quote_number = await nextQuoteNumber(sb);
  const quoteId = newUuid();

  const { error: insErr } = await sb.from('quotations').insert([{
    id: quoteId,
    customer_id: null,
    quote_number,
    discount: 0,
    vat_apply: false,
    vat_inclusive: false,
    vat_rate: 0,
    currency: 'K',
    subtotal: 0,
    total: 0,
    status: 'quote',
    created_at: nowIso,
    updated_at: nowIso,
  }]);
  if (insErr) throw new Error(insErr.message || 'Failed to create showroom quote');

  const itemRows = normalizedLines.map((line, idx) => {
    const name = String(line.assembly.name || '').trim();
    return {
      id: newUuid(),
      quotation_id: quoteId,
      quote_product_id: null,
      product_id: null,
      name_override: name,
      description: null,
      unit_id: null,
      quantity: resolveQuoteLineQuantity(line.quantity, 0),
      unit_price: 0,
      sort_order: idx + 1,
      metadata: {
        showroom_order: true,
        floor2_assembly_id: line.assembly_id,
        floor2_image_url: line.assembly.metadata?.floor2_image_url || line.assembly.image_url || null,
        production_route: line.route,
        floor2_stock_at_order: qtyMap.get(line.assembly_id) ?? 0,
      },
    };
  });

  const { error: itemsErr } = await sb.from('quotation_items').insert(itemRows);
  if (itemsErr) throw new Error(itemsErr.message || 'Failed to save quote lines');

  const lineSummary = itemRows.map((it) => buildProductionLineSummaryRow(it));
  const primary_assembly_id = normalizedLines[0].assembly_id;

  const { data: existingRoute } = await sb.from(ROUTING).select('*').eq('quote_id', quoteId).maybeSingle();
  const routeRow = {
    quote_id: quoteId,
    route: workshopRoute,
    metadata: {
      ...(existingRoute?.metadata || {}),
      showroom_order: true,
      customer_order: false,
      primary_assembly_id,
      quote_number,
      lines: lineSummary,
      floor2_source: true,
    },
    updated_at: nowIso,
  };
  if (existingRoute?.quote_id) {
    const { error: updErr } = await sb.from(ROUTING).update(routeRow).eq('quote_id', quoteId);
    if (updErr) throw new Error(updErr.message || 'Failed to save routing');
  } else {
    const { error: rtErr } = await sb.from(ROUTING).insert([{ ...routeRow, created_at: nowIso }]);
    if (rtErr) throw new Error(rtErr.message || 'Failed to save routing');
  }

  const sendResult = await sendQuoteToProduction(sb, quoteId, user?.id);
  return {
    ...sendResult,
    quote_id: quoteId,
    quote_number,
    route: workshopRoute,
    showroom_order: true,
    factory_location: WAREHOUSE_FACTORY_LOCATION_ID,
  };
}

function collectFloor2NeedsFromItems(items = []) {
  const needs = new Map();
  for (const line of items || []) {
    const meta = line?.metadata && typeof line.metadata === 'object' ? line.metadata : {};
    const aid = String(meta.floor2_assembly_id || line?.floor2_assembly_id || '').trim();
    if (!aid) continue;
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 0));
    needs.set(aid, (needs.get(aid) || 0) + qty);
  }
  return needs;
}

/**
 * Shortfall snapshot for workshop quote list cards (no throw).
 */
export async function computeFloor2ShortfallForQuoteLines(sb, lines = []) {
  const needs = collectFloor2NeedsFromItems(lines);
  if (!needs.size) {
    return { floor2_wip_required: false, floor2_ready: true, floor2_shortfalls: [] };
  }
  const qtyMap = await loadFloor2QtyMap(sb, [...needs.keys()]);
  const { data: assemblies } = await sb
    .from('warehouse_assemblies')
    .select('id, name')
    .in('id', [...needs.keys()]);
  const nameById = new Map((assemblies || []).map((a) => [String(a.id), String(a.name || a.id)]));
  const shortfalls = [];
  for (const [aid, need] of needs.entries()) {
    const have = qtyMap.get(aid) ?? 0;
    if (have < need) {
      shortfalls.push({
        assembly_id: aid,
        name: nameById.get(aid) || aid,
        need,
        have,
        shortfall: need - have,
      });
    }
  }
  return {
    floor2_wip_required: true,
    floor2_ready: shortfalls.length === 0,
    floor2_shortfalls: shortfalls,
  };
}

/**
 * Block starting workshop production until Floor 2 WIP covers Floor 2-linked quote lines.
 */
export async function assertFloor2StockForQuoteItems(sb, items = []) {
  const { floor2_wip_required, floor2_shortfalls } = await computeFloor2ShortfallForQuoteLines(sb, items);
  if (!floor2_wip_required || !floor2_shortfalls.length) return;
  const first = floor2_shortfalls[0];
  throw new Error(
    `Manufacture "${first.name}" to Floor 2 before starting this order (need ${first.need} on Floor 2, have ${first.have}).`,
  );
}