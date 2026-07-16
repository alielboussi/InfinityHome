#!/usr/bin/env node
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const LUSAKA_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const EPSILON = 0.000001;

for (const envFile of ['.env.local', '.env', 'vercel.env']) {
  try {
    dotenv.config({ path: path.resolve(process.cwd(), envFile), override: false });
  } catch {}
}

const TABLES = Object.freeze({
  opening: 'opening_stock_entries',
  closing: 'closing_stock_entries',
  salesItems: 'sales_items',
  quotationItems: 'quotation_items',
  transferEntries: 'stock_transfer_entries',
  comboItems: 'combo_items',
  inventoryAdjustments: 'inventory_adjustments',
  factoryStorage: 'factory_sold_storage_items',
  productImages: 'product_images',
  productLocations: 'product_locations',
  inventory: 'inventory',
  products: 'products',
});

function getArgValue(flag) {
  const args = process.argv.slice(2);
  const exact = args.find((arg) => arg.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return '';
}

const applySafe = process.argv.includes('--apply-safe');
const nameFilter = String(getArgValue('--name') || '').trim().toLowerCase();

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function hasPositive(value) {
  return toNumber(value) > EPSILON;
}

function sameId(a, b) {
  return String(a) === String(b);
}

function createSupabase() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL/REACT_APP_SUPABASE_URL or SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

async function fetchRowsByProductId(supabase, tableName, productIds) {
  if (!productIds.length) return [];
  try {
    const { data, error } = await supabase.from(tableName).select('product_id').in('product_id', productIds);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

async function fetchInventoryRows(supabase, productIds) {
  if (!productIds.length) return [];
  const { data, error } = await supabase
    .from(TABLES.inventory)
    .select('product_id,location,quantity')
    .in('product_id', productIds);
  if (error) throw error;
  return data || [];
}

function buildCountMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.product_id || '');
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function buildInventorySummaryMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.product_id || '');
    if (!key) continue;
    const bucket = map.get(key) || { total: 0, kitwe: 0, lusaka: 0, other: 0 };
    const qty = toNumber(row.quantity);
    bucket.total += qty;
    if (sameId(row.location, KITWE_LOCATION_ID)) bucket.kitwe += qty;
    else if (sameId(row.location, LUSAKA_LOCATION_ID)) bucket.lusaka += qty;
    else bucket.other += qty;
    map.set(key, bucket);
  }
  return map;
}

function pickKeeper(rows) {
  const sorted = [...rows].sort((a, b) => {
    const blockedDiff = Number(b.hasHistoryOrStock) - Number(a.hasHistoryOrStock);
    if (blockedDiff !== 0) return blockedDiff;
    const createdAtDiff = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    return String(a.sku || '').localeCompare(String(b.sku || ''));
  });
  return sorted[0] || null;
}

function buildRowReport(row, keeperId) {
  const blockers = [];
  if (hasPositive(row.totalInventoryQty)) blockers.push(`inventory_total=${row.totalInventoryQty}`);
  if (hasPositive(row.kitweQty)) blockers.push(`kitwe_qty=${row.kitweQty}`);
  if (hasPositive(row.lusakaQty)) blockers.push(`lusaka_qty=${row.lusakaQty}`);
  if (hasPositive(row.otherQty)) blockers.push(`other_location_qty=${row.otherQty}`);
  if (row.openingEntryCount > 0) blockers.push(`opening_entries=${row.openingEntryCount}`);
  if (row.closingEntryCount > 0) blockers.push(`closing_entries=${row.closingEntryCount}`);
  if (row.salesItemsCount > 0) blockers.push(`sales_items=${row.salesItemsCount}`);
  if (row.quotationItemsCount > 0) blockers.push(`quotation_items=${row.quotationItemsCount}`);
  if (row.transferEntriesCount > 0) blockers.push(`stock_transfer_entries=${row.transferEntriesCount}`);
  if (row.comboItemsCount > 0) blockers.push(`combo_items=${row.comboItemsCount}`);
  if (row.inventoryAdjustmentsCount > 0) blockers.push(`inventory_adjustments=${row.inventoryAdjustmentsCount}`);
  if (row.factoryStorageCount > 0) blockers.push(`factory_sold_storage_items=${row.factoryStorageCount}`);
  if (sameId(row.id, keeperId)) blockers.push('keeper');

  return {
    id: row.id,
    sku: row.sku,
    created_at: row.created_at,
    kitweQty: row.kitweQty,
    lusakaQty: row.lusakaQty,
    otherQty: row.otherQty,
    totalInventoryQty: row.totalInventoryQty,
    openingEntryCount: row.openingEntryCount,
    closingEntryCount: row.closingEntryCount,
    salesItemsCount: row.salesItemsCount,
    quotationItemsCount: row.quotationItemsCount,
    transferEntriesCount: row.transferEntriesCount,
    comboItemsCount: row.comboItemsCount,
    inventoryAdjustmentsCount: row.inventoryAdjustmentsCount,
    factoryStorageCount: row.factoryStorageCount,
    keeper: sameId(row.id, keeperId),
    deleteCandidate: blockers.length === 0,
    blockers,
  };
}

async function buildReport(supabase) {
  const { data: products, error: productsErr } = await supabase
    .from(TABLES.products)
    .select('id,name,sku,created_at')
    .order('created_at', { ascending: true });
  if (productsErr) throw productsErr;

  const groups = new Map();
  for (const product of products || []) {
    const normalized = normalizeName(product.name);
    if (!normalized) continue;
    if (nameFilter && !normalized.includes(nameFilter)) continue;
    const group = groups.get(normalized) || { normalizedName: normalized, name: product.name, rows: [] };
    group.rows.push(product);
    groups.set(normalized, group);
  }

  const duplicateGroups = Array.from(groups.values()).filter((group) => group.rows.length > 1);
  const duplicateIds = duplicateGroups.flatMap((group) => group.rows.map((row) => String(row.id)));

  const [inventoryRows, openingRows, closingRows, salesItemsRows, quotationRows, transferRows, comboRows, adjustmentRows, factoryRows] = await Promise.all([
    fetchInventoryRows(supabase, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.opening, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.closing, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.salesItems, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.quotationItems, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.transferEntries, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.comboItems, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.inventoryAdjustments, duplicateIds),
    fetchRowsByProductId(supabase, TABLES.factoryStorage, duplicateIds),
  ]);

  const inventoryMap = buildInventorySummaryMap(inventoryRows);
  const openingMap = buildCountMap(openingRows);
  const closingMap = buildCountMap(closingRows);
  const salesItemsMap = buildCountMap(salesItemsRows);
  const quotationMap = buildCountMap(quotationRows);
  const transferMap = buildCountMap(transferRows);
  const comboMap = buildCountMap(comboRows);
  const adjustmentMap = buildCountMap(adjustmentRows);
  const factoryMap = buildCountMap(factoryRows);

  const reportGroups = duplicateGroups.map((group) => {
    const enrichedRows = group.rows.map((row) => {
      const inventory = inventoryMap.get(String(row.id)) || { total: 0, kitwe: 0, lusaka: 0, other: 0 };
      const enriched = {
        ...row,
        totalInventoryQty: inventory.total,
        kitweQty: inventory.kitwe,
        lusakaQty: inventory.lusaka,
        otherQty: inventory.other,
        openingEntryCount: openingMap.get(String(row.id)) || 0,
        closingEntryCount: closingMap.get(String(row.id)) || 0,
        salesItemsCount: salesItemsMap.get(String(row.id)) || 0,
        quotationItemsCount: quotationMap.get(String(row.id)) || 0,
        transferEntriesCount: transferMap.get(String(row.id)) || 0,
        comboItemsCount: comboMap.get(String(row.id)) || 0,
        inventoryAdjustmentsCount: adjustmentMap.get(String(row.id)) || 0,
        factoryStorageCount: factoryMap.get(String(row.id)) || 0,
      };
      enriched.hasHistoryOrStock = hasPositive(enriched.totalInventoryQty)
        || enriched.openingEntryCount > 0
        || enriched.closingEntryCount > 0
        || enriched.salesItemsCount > 0
        || enriched.quotationItemsCount > 0
        || enriched.transferEntriesCount > 0
        || enriched.comboItemsCount > 0
        || enriched.inventoryAdjustmentsCount > 0
        || enriched.factoryStorageCount > 0;
      return enriched;
    });

    const keeper = pickKeeper(enrichedRows);
    const rows = enrichedRows.map((row) => buildRowReport(row, keeper?.id || null));
    const deleteCandidates = rows.filter((row) => row.deleteCandidate);
    const reviewReason = deleteCandidates.length > 0
      ? 'Has zero-stock duplicates that can be removed.'
      : 'No fully orphaned duplicates in this group.';
    return {
      name: group.name,
      normalizedName: group.normalizedName,
      keeper: keeper ? { id: keeper.id, sku: keeper.sku } : null,
      deleteCandidates,
      rows,
      reviewReason,
    };
  });

  const deletableIds = reportGroups.flatMap((group) => group.deleteCandidates.map((row) => String(row.id)));
  return {
    summary: {
      duplicateNameGroupCount: reportGroups.length,
      groupsWithDeleteCandidates: reportGroups.filter((group) => group.deleteCandidates.length > 0).length,
      deleteCandidateCount: deletableIds.length,
      nameFilter: nameFilter || null,
    },
    groups: reportGroups,
    deletableIds,
  };
}

async function deleteProductsByIds(supabase, productIds) {
  if (!productIds.length) return [];
  for (const [tableName, column] of [
    [TABLES.productImages, 'product_id'],
    [TABLES.productLocations, 'product_id'],
    [TABLES.inventory, 'product_id'],
    [TABLES.opening, 'product_id'],
    [TABLES.closing, 'product_id'],
    [TABLES.comboItems, 'product_id'],
  ]) {
    const { error } = await supabase.from(tableName).delete().in(column, productIds);
    if (error) throw error;
  }

  const { data: deletedRows, error: deleteErr } = await supabase
    .from(TABLES.products)
    .delete()
    .in('id', productIds)
    .select('id');
  if (deleteErr) throw deleteErr;
  return (deletedRows || []).map((row) => String(row.id));
}

async function main() {
  const supabase = createSupabase();
  const report = await buildReport(supabase);
  const result = {
    dryRun: !applySafe,
    summary: report.summary,
    groups: report.groups,
    appliedDeletedIds: [],
  };

  if (applySafe && report.deletableIds.length > 0) {
    result.appliedDeletedIds = await deleteProductsByIds(supabase, report.deletableIds);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});