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

function sameId(a, b) {
  return String(a) === String(b);
}

function hasPositive(value) {
  return toNumber(value) > EPSILON;
}

function describeRow(row) {
  return {
    id: row.id,
    sku: row.sku,
    created_at: row.created_at,
    kitweQty: row.kitweQty,
    lusakaQty: row.lusakaQty,
    lusakaOpeningQty: row.lusakaOpeningQty,
    lusakaClosingQty: row.lusakaClosingQty,
    category_id: row.category_id,
    unit_of_measure_id: row.unit_of_measure_id,
    currency: row.currency,
    hasKitweAssociation: !!row.hasKitweAssociation,
    hasLusakaAssociation: !!row.hasLusakaAssociation,
  };
}

function categoryCompatible(source, target) {
  if (source.category_id == null || target.category_id == null) return true;
  return sameId(source.category_id, target.category_id);
}

function currencyCompatible(source, target) {
  const sourceCurrency = String(source.currency || '').trim();
  const targetCurrency = String(target.currency || '').trim();
  if (!sourceCurrency || !targetCurrency) return true;
  return sourceCurrency === targetCurrency;
}

function unitCompatible(source, target) {
  if (source.unit_of_measure_id == null || target.unit_of_measure_id == null) return true;
  return sameId(source.unit_of_measure_id, target.unit_of_measure_id);
}

function sortTargetCandidates(rows) {
  return [...rows].sort((a, b) => {
    const kitweDiff = toNumber(b.kitweQty) - toNumber(a.kitweQty);
    if (Math.abs(kitweDiff) > EPSILON) return kitweDiff;

    const totalDiff = (toNumber(b.kitweQty) + toNumber(b.lusakaQty) + toNumber(b.lusakaOpeningQty))
      - (toNumber(a.kitweQty) + toNumber(a.lusakaQty) + toNumber(a.lusakaOpeningQty));
    if (Math.abs(totalDiff) > EPSILON) return totalDiff;

    const createdAtDiff = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;

    return String(a.sku || '').localeCompare(String(b.sku || ''));
  });
}

function pickCanonicalTarget(rows) {
  const kitweStockCandidates = rows.filter((row) => hasPositive(row.kitweQty));
  if (kitweStockCandidates.length > 0) {
    return sortTargetCandidates(kitweStockCandidates)[0];
  }

  return null;
}

function isActionableSourceRow(row, target) {
  if (!target || sameId(row.id, target.id)) return false;
  return hasPositive(row.lusakaOpeningQty);
}

function buildPlanForGroup(group) {
  const rows = sortTargetCandidates(group.rows);
  const reasons = [];
  const target = pickCanonicalTarget(rows);

  if (!target) {
    reasons.push('No Kitwe product with positive stock found.');
  }

  const sourceCandidates = target
    ? rows.filter((row) => isActionableSourceRow(row, target))
    : [];

  if (target && sourceCandidates.length === 0) {
    reasons.push('No Lusaka opening-stock duplicate source rows found.');
  }

  if (target) {
    for (const source of sourceCandidates) {
      if (!categoryCompatible(source, target)) {
        reasons.push(`Category mismatch between ${target.sku || target.id} and ${source.sku || source.id}.`);
      }
      if (!currencyCompatible(source, target)) {
        reasons.push(`Currency mismatch between ${target.sku || target.id} and ${source.sku || source.id}.`);
      }
      if (!unitCompatible(source, target)) {
        reasons.push(`Unit mismatch between ${target.sku || target.id} and ${source.sku || source.id}.`);
      }
    }
  }

  const status = reasons.length === 0 ? 'safe' : 'review';
  return {
    name: group.name,
    normalizedName: group.normalizedName,
    status,
    reasons,
    target: target ? describeRow(target) : null,
    sources: sourceCandidates.map(describeRow),
    rows: rows.map(describeRow),
  };
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

async function fetchMergeContext(supabase) {
  const [{ data: products, error: productsErr }, { data: inventory, error: inventoryErr }, { data: periods, error: periodsErr }, { data: productLocations, error: productLocationsErr }] = await Promise.all([
    supabase.from('products').select('id,name,sku,category_id,unit_of_measure_id,currency,created_at'),
    supabase.from('inventory').select('id,product_id,location,quantity'),
    supabase.from('stock_periods').select('id,location_id,status,opened_at').eq('location_id', LUSAKA_LOCATION_ID).in('status', ['open', 'open_locked']).order('opened_at', { ascending: false }).limit(1),
    supabase.from('product_locations').select('product_id,location_id'),
  ]);
  if (productsErr) throw productsErr;
  if (inventoryErr) throw inventoryErr;
  if (periodsErr) throw periodsErr;
  if (productLocationsErr) throw productLocationsErr;

  const latestLusakaSessionId = periods?.[0]?.id || null;

  let openingRows = [];
  let closingRows = [];
  if (latestLusakaSessionId) {
    const [{ data: openingData, error: openingErr }, { data: closingData, error: closingErr }] = await Promise.all([
      supabase.from('opening_stock_entries').select('product_id,qty').eq('session_id', latestLusakaSessionId),
      supabase.from('closing_stock_entries').select('product_id,qty').eq('session_id', latestLusakaSessionId),
    ]);
    if (openingErr) throw openingErr;
    if (closingErr) throw closingErr;
    openingRows = openingData || [];
    closingRows = closingData || [];
  }

  const inventoryByProduct = new Map();
  for (const row of inventory || []) {
    const key = String(row.product_id);
    const bucket = inventoryByProduct.get(key) || { kitweQty: 0, lusakaQty: 0 };
    const qty = toNumber(row.quantity);
    if (sameId(row.location, KITWE_LOCATION_ID)) bucket.kitweQty += qty;
    if (sameId(row.location, LUSAKA_LOCATION_ID)) bucket.lusakaQty += qty;
    inventoryByProduct.set(key, bucket);
  }

  const openingByProduct = new Map();
  for (const row of openingRows) {
    openingByProduct.set(String(row.product_id), toNumber(row.qty));
  }

  const closingByProduct = new Map();
  for (const row of closingRows) {
    closingByProduct.set(String(row.product_id), toNumber(row.qty));
  }

  const locationLinksByProduct = new Map();
  for (const row of productLocations || []) {
    const key = String(row.product_id || '');
    if (!key) continue;
    const set = locationLinksByProduct.get(key) || new Set();
    set.add(String(row.location_id));
    locationLinksByProduct.set(key, set);
  }

  const groups = new Map();
  for (const product of products || []) {
    const normalizedName = normalizeName(product.name);
    if (!normalizedName) continue;
    if (nameFilter && !normalizedName.includes(nameFilter)) continue;

    const stock = inventoryByProduct.get(String(product.id)) || { kitweQty: 0, lusakaQty: 0 };
    const locationLinks = locationLinksByProduct.get(String(product.id)) || new Set();
    const row = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      created_at: product.created_at,
      category_id: product.category_id,
      unit_of_measure_id: product.unit_of_measure_id,
      currency: product.currency,
      kitweQty: stock.kitweQty,
      lusakaQty: stock.lusakaQty,
      lusakaOpeningQty: toNumber(openingByProduct.get(String(product.id)) || 0),
      lusakaClosingQty: toNumber(closingByProduct.get(String(product.id)) || 0),
      hasKitweAssociation: locationLinks.has(KITWE_LOCATION_ID) || hasPositive(stock.kitweQty),
      hasLusakaAssociation: locationLinks.has(LUSAKA_LOCATION_ID)
        || hasPositive(stock.lusakaQty)
        || hasPositive(openingByProduct.get(String(product.id)) || 0)
        || hasPositive(closingByProduct.get(String(product.id)) || 0),
    };
    const group = groups.get(normalizedName) || { normalizedName, name: product.name, rows: [] };
    group.rows.push(row);
    groups.set(normalizedName, group);
  }

  const duplicateGroups = Array.from(groups.values()).filter((group) => group.rows.length > 1);
  const plans = duplicateGroups.map(buildPlanForGroup);
  return {
    latestLusakaSessionId,
    plans,
    duplicateGroupCount: duplicateGroups.length,
  };
}

async function mergeInventoryRows(supabase, targetId, sourceIds) {
  const affectedIds = [String(targetId), ...sourceIds.map(String)];
  const { data, error } = await supabase
    .from('inventory')
    .select('id,product_id,location,quantity')
    .in('product_id', affectedIds);
  if (error) throw error;

  const nowIso = new Date().toISOString();
  const rowsByLocation = new Map();
  for (const row of data || []) {
    const key = String(row.location || '');
    if (!rowsByLocation.has(key)) rowsByLocation.set(key, []);
    rowsByLocation.get(key).push(row);
  }

  const deleteIds = new Set();
  const movedQtyByLocation = {};

  for (const [locationId, rows] of rowsByLocation.entries()) {
    const targetRows = rows.filter((row) => sameId(row.product_id, targetId));
    const sourceRows = rows.filter((row) => sourceIds.some((sourceId) => sameId(row.product_id, sourceId)));
    const sourceQty = sourceRows.reduce((sum, row) => sum + toNumber(row.quantity), 0);
    const finalQty = rows.reduce((sum, row) => sum + toNumber(row.quantity), 0);
    const primaryTarget = targetRows[0] || null;
    if (Math.abs(sourceQty) > EPSILON) {
      movedQtyByLocation[locationId] = sourceQty;
    }

    if (Math.abs(finalQty) > EPSILON) {
      if (primaryTarget) {
        const { error: updateErr } = await supabase
          .from('inventory')
          .update({ quantity: finalQty, updated_at: nowIso })
          .eq('id', primaryTarget.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('inventory')
          .insert([{ product_id: targetId, location: locationId, quantity: finalQty, updated_at: nowIso }]);
        if (insertErr) throw insertErr;
      }
      [...targetRows.slice(1), ...sourceRows].forEach((row) => {
        if (row.id != null) deleteIds.add(row.id);
      });
    } else {
      [...targetRows, ...sourceRows].forEach((row) => {
        if (row.id != null) deleteIds.add(row.id);
      });
    }
  }

  if (deleteIds.size > 0) {
    const { error: deleteErr } = await supabase.from('inventory').delete().in('id', Array.from(deleteIds));
    if (deleteErr) throw deleteErr;
  }

  return { movedQtyByLocation };
}

async function mergeSessionEntries(supabase, tableName, targetId, sourceIds) {
  if (sourceIds.length === 0) return { movedQty: 0, sessionsTouched: 0 };
  const affectedIds = [String(targetId), ...sourceIds.map(String)];
  const { data, error } = await supabase
    .from(tableName)
    .select('product_id,qty')
    .select('session_id,product_id,qty')
    .in('product_id', affectedIds);
  if (error) throw error;

  const rowsBySession = new Map();
  for (const row of data || []) {
    const key = String(row.session_id || '');
    if (!rowsBySession.has(key)) rowsBySession.set(key, []);
    rowsBySession.get(key).push(row);
  }

  const upserts = [];
  const zeroQtyTargetSessions = [];
  let movedQty = 0;

  for (const [sessionId, rows] of rowsBySession.entries()) {
    const targetQty = rows
      .filter((row) => sameId(row.product_id, targetId))
      .reduce((sum, row) => sum + toNumber(row.qty), 0);
    const sourceQty = rows
      .filter((row) => sourceIds.some((sourceId) => sameId(row.product_id, sourceId)))
      .reduce((sum, row) => sum + toNumber(row.qty), 0);
    const finalQty = targetQty + sourceQty;
    movedQty += sourceQty;

    if (Math.abs(finalQty) > EPSILON) {
      upserts.push({ session_id: sessionId, product_id: targetId, qty: finalQty });
    } else if (targetQty !== 0 || sourceQty !== 0) {
      zeroQtyTargetSessions.push(sessionId);
    }
  }

  if (upserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from(tableName)
      .upsert(upserts, { onConflict: 'session_id,product_id' });
    if (upsertErr) throw upsertErr;
  }

  if (sourceIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from(tableName)
      .delete()
      .in('product_id', sourceIds);
    if (deleteErr) throw deleteErr;
  }

  if (zeroQtyTargetSessions.length > 0) {
    const { error: deleteTargetErr } = await supabase
      .from(tableName)
      .delete()
      .eq('product_id', targetId)
      .in('session_id', zeroQtyTargetSessions);
    if (deleteTargetErr) throw deleteTargetErr;
  }

  return { movedQty, sessionsTouched: rowsBySession.size };
}

async function mergeProductLocations(supabase, targetId, sourceIds) {
  const affectedIds = [String(targetId), ...sourceIds.map(String)];
  const { data, error } = await supabase
    .from('product_locations')
    .select('product_id,location_id')
    .in('product_id', affectedIds);
  if (error) throw error;

  const targetLocationIds = new Set(
    (data || [])
      .filter((row) => sameId(row.product_id, targetId))
      .map((row) => String(row.location_id))
  );
  const insertRows = Array.from(new Set((data || []).map((row) => String(row.location_id)).filter(Boolean)))
    .filter((locationId) => !targetLocationIds.has(locationId))
    .map((locationId) => ({ product_id: targetId, location_id: locationId }));

  if (insertRows.length > 0) {
    const { error: insertErr } = await supabase.from('product_locations').insert(insertRows);
    if (insertErr) throw insertErr;
  }

  if (sourceIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from('product_locations')
      .delete()
      .in('product_id', sourceIds);
    if (deleteErr) throw deleteErr;
  }
}

async function applyPlan(supabase, sessionId, plan) {
  const targetId = plan.target?.id;
  const sourceIds = (plan.sources || []).map((row) => String(row.id));
  if (!targetId || sourceIds.length === 0) {
    return { name: plan.name, skipped: true, reason: 'Missing target or source rows.' };
  }

  const inventoryResult = await mergeInventoryRows(supabase, targetId, sourceIds);
  const openingResult = await mergeSessionEntries(supabase, 'opening_stock_entries', targetId, sourceIds);
  const closingResult = await mergeSessionEntries(supabase, 'closing_stock_entries', targetId, sourceIds);
  await mergeProductLocations(supabase, targetId, sourceIds);

  return {
    name: plan.name,
    targetId,
    sourceIds,
    inventoryMovedByLocation: inventoryResult.movedQtyByLocation || {},
    openingMovedQty: openingResult.movedQty || 0,
    closingMovedQty: closingResult.movedQty || 0,
  };
}

async function main() {
  const supabase = createSupabase();
  const context = await fetchMergeContext(supabase);
  const safePlans = context.plans.filter((plan) => plan.status === 'safe' && (plan.sources || []).length > 0);
  const reviewPlans = context.plans.filter((plan) => plan.status === 'review');

  const result = {
    dryRun: !applySafe,
    latestLusakaSessionId: context.latestLusakaSessionId,
    summary: {
      duplicateNameGroupCount: context.duplicateGroupCount,
      safeMergeCount: safePlans.length,
      reviewCount: reviewPlans.length,
      nameFilter: nameFilter || null,
    },
    safe: safePlans,
    review: reviewPlans,
    applied: [],
  };

  if (applySafe) {
    for (const plan of safePlans) {
      const applied = await applyPlan(supabase, context.latestLusakaSessionId, plan);
      result.applied.push(applied);
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});