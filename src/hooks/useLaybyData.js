// Unified layby data hook: fetch one layby statement (RPC preferred) + derived rollups
// Provides consistent shape for LaybyManagement, POS, AllSales, PDF generators.
// Falls back to legacy multi-query approach if RPC disabled or errors out.

import { useCallback, useEffect, useRef, useState } from 'react';
import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { USE_LAYBY_RPC, fetchLaybyStatementRPC } from '../laybyStatementService';
import { fetchLaybyStatement } from '../services/laybyStatement';
import { fetchCanonicalFinancials } from '../utils/financials';

// Contract:
// Input: customerId (uuid), laybyId (uuid)
// Output: { loading, error, statement: { layby, sales, items, payments }, rollups: { total, paid, outstanding }, refresh() }

export function useLaybyData(customerId, laybyId, opts = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statement, setStatement] = useState(null);
  const [rollups, setRollups] = useState({ total: 0, paid: 0, outstanding: 0 });
  const lastIds = useRef({ customerId: null, laybyId: null });

  const computeRollups = useCallback(async (stmt) => {
    if (!stmt || !stmt.sales?.length) {
      const total = Number(stmt?.layby?.total_amount || 0);
      const paid = Number(stmt?.layby?.paid_amount || 0);
      return { total, paid, outstanding: Math.max(0, total - paid) };
    }
    // Use canonical view for authoritative totals
    try {
      const saleIds = stmt.sales.map(s => s.sale_id).filter(v => v != null);
      const finMap = await fetchCanonicalFinancials(db, saleIds);
      let total = 0; let paid = 0;
      saleIds.forEach(id => {
        const fin = finMap.get(String(id));
        if (fin) {
          total += Number(fin.total_due || 0);
          paid += Number(fin.paid_amount || 0);
        }
      });
      return { total, paid, outstanding: Math.max(0, total - paid) };
    } catch (e) {
      const total = Number(stmt?.layby?.total_amount || 0);
      const paid = Number(stmt?.layby?.paid_amount || 0);
      return { total, paid, outstanding: Math.max(0, total - paid) };
    }
  }, []);

  const legacyFetch = useCallback(async (custId, lId, reason) => {
    // DEPRECATION NOTE (2025-10-08): Legacy multi-query fallback gated by ENABLE_LEGACY_LAYBY_FALLBACK.
    // Set ENABLE_LEGACY_LAYBY_FALLBACK=true temporarily for emergency rollback only.
    // Target removal date: 2025-10-22 after two weeks stable.
    if (process.env.NODE_ENV !== 'production') {
      try { console.info('[useLaybyData] legacyFetch invoked', { reason }); } catch {}
    }
  const laybyRow = await fromPublic('laybys').select('*').eq('id', lId).maybeSingle();
    if (laybyRow.error) return { error: laybyRow.error.message };
    if (!laybyRow.data || laybyRow.data.customer_id !== custId) return { error: 'LAYBY_NOT_FOUND' };
  const salesRes = await fromPublic('sales').select('id as sale_id, sale_date, status, discount, currency').eq('layby_id', lId).order('sale_date', { ascending: true });
    const openSales = (salesRes.data || []).filter((s) => {
      const st = String(s?.status || '').trim().toLowerCase();
      return !['completed', 'cancelled', 'voided', 'refunded', 'settled', 'paid'].includes(st);
    });
    const saleIds = openSales.map(s => s.sale_id);
  const itemsRes = saleIds.length ? await fromPublic('sales_items').select('sale_id, product_id, display_name, quantity, unit_price, currency').in('sale_id', saleIds) : { data: [] };
  const paymentsRes = saleIds.length ? await fromPublic('sales_payments').select('id, sale_id, payment_type, amount, discount_amount, currency, payment_date, notes, reference, allocation_batch_uuid').in('sale_id', saleIds).order('payment_date', { ascending: true }) : { data: [] };
    const normPayments = (paymentsRes.data || []).map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }));
    return {
      data: {
        layby: laybyRow.data,
        sales: openSales,
        items: itemsRes.data || [],
        payments: normPayments,
      }
    };
  }, []);

  const load = useCallback(async () => {
    if (!customerId || !laybyId) return;
    setLoading(true); setError(null);
    try {
      let result = null;
      const allowLegacy = String(process.env.REACT_APP_ENABLE_LEGACY_LAYBY_FALLBACK || process.env.ENABLE_LEGACY_LAYBY_FALLBACK || '').toLowerCase() === 'true';
      if (USE_LAYBY_RPC) {
        result = await fetchLaybyStatementRPC(customerId, laybyId);
        if (result.error) {
          const apiRes = await fetchLaybyStatement(customerId);
          if (!apiRes.error) {
            result = { data: { layby: {}, ...(apiRes.data || {}) } };
          } else if (allowLegacy) {
            result = await legacyFetch(customerId, laybyId, 'rpc_error');
          }
        }
      } else {
        const apiRes = await fetchLaybyStatement(customerId);
        if (!apiRes.error) {
          result = { data: { layby: {}, ...(apiRes.data || {}) } };
        } else if (allowLegacy) {
          result = await legacyFetch(customerId, laybyId, 'rpc_disabled');
        } else {
          result = { error: 'LAYBY_RPC_DISABLED_AND_LEGACY_BLOCKED' };
        }
      }
      if (result.error) throw new Error(result.error);
      setStatement(result.data);
      const r = await computeRollups(result.data);
      setRollups(r);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [customerId, laybyId, computeRollups, legacyFetch]);

  // Auto-load when IDs change
  useEffect(() => {
    if (lastIds.current.customerId !== customerId || lastIds.current.laybyId !== laybyId) {
      lastIds.current = { customerId, laybyId };
      load();
    }
  }, [customerId, laybyId, load]);

  return { loading, error, statement, rollups, refresh: load };
}

export default useLaybyData;
