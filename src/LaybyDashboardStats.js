import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { cacheSet } from './utils/staleCache';
import { fetchLaybyCustomerRows } from './services/laybyCustomerRows';
import { formatLaybyTotalsLine, LAYBY_ROWS_CACHE_KEY, sumLaybyCustomerTotalsByCurrency } from './utils/laybyRollup';

const LAYBY_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;

export default function LaybyDashboardStats({ active = true }) {
  const [laybyTotals, setLaybyTotals] = useState({});
  const [laybyStatsTick, setLaybyStatsTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;

    (async () => {
      try {
        const rows = await fetchLaybyCustomerRows();
        if (Array.isArray(rows) && rows.length) {
          cacheSet(LAYBY_ROWS_CACHE_KEY, rows, LAYBY_ROWS_CACHE_TTL_MS);
        }
        if (alive) setLaybyTotals(sumLaybyCustomerTotalsByCurrency(rows || []));
      } catch {
        if (alive) setLaybyTotals({});
      }
    })();

    return () => { alive = false; };
  }, [active, laybyStatsTick]);

  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setLaybyStatsTick((value) => value + 1), 300);
    };

    const channel = supabase
      .channel('layby-dashboard-stats-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laybys' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_payments' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'layby_payments' }, bump)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [active]);

  const fmtLaybyLine = (field) => formatLaybyTotalsLine(laybyTotals, field);

  return (
    <section className="dashboard-section">
      <div className="dashboard-stats-group">
        <div className="dashboard-section-header">
          <h2>Layby</h2>
        </div>
        <div className="ent-stats-grid">
          <div className="ent-stat-card green">
            <div className="ent-stat-label">Total Sale</div>
            <div className="ent-stat-value" style={{ fontSize: '1.15rem', lineHeight: 1.35 }}>{fmtLaybyLine('total')}</div>
          </div>

          <div className="ent-stat-card">
            <div className="ent-stat-label">Total Deposit</div>
            <div className="ent-stat-value" style={{ fontSize: '1.15rem', lineHeight: 1.35 }}>{fmtLaybyLine('paid')}</div>
          </div>

          <div className="ent-stat-card red">
            <div className="ent-stat-label">Total Due</div>
            <div className="ent-stat-value" style={{ fontSize: '1.15rem', lineHeight: 1.35 }}>{fmtLaybyLine('due')}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
