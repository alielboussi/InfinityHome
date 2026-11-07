import React, { useCallback, useState } from 'react';
import db from '../dataClient';

/**
 * Read-only SKU location snapshot for Hassan on Quotes board (B7).
 */
export default function WarehouseSkuWhereabouts() {
  const [sku, setSku] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);

  const search = useCallback(async () => {
    const q = String(sku || '').trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setRows([]);
    try {
      const { data: allAsm, error: aErr } = await db
        .from('warehouse_assemblies')
        .select('id, name, family_sku')
        .limit(400);
      const qLower = q.toLowerCase();
      const assemblies = (allAsm || []).filter((a) => {
        const sku = String(a.family_sku || '').toLowerCase();
        const name = String(a.name || '').toLowerCase();
        return sku.includes(qLower) || name.includes(qLower);
      }).slice(0, 8);
      if (aErr) throw new Error(aErr.message || 'Search failed');
      const ids = (assemblies || []).map((a) => a.id).filter(Boolean);
      if (!ids.length) {
        setRows([]);
        return;
      }
      const [{ data: inv, error: iErr }, { data: locs }] = await Promise.all([
        db.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity').in('assembly_id', ids),
        db.from('locations').select('id, name'),
      ]);
      if (iErr) throw new Error(iErr.message || 'Inventory load failed');
      const locMap = new Map((locs || []).map((l) => [String(l.id), l.name]));
      const byAsm = new Map((assemblies || []).map((a) => [String(a.id), a]));
      const out = [];
      for (const row of inv || []) {
        const asm = byAsm.get(String(row.assembly_id));
        if (!asm) continue;
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) continue;
        out.push({
          key: `${row.assembly_id}:${row.location_id}`,
          name: asm.name,
          sku: asm.family_sku,
          location: locMap.get(String(row.location_id)) || row.location_id,
          qty,
        });
      }
      setRows(out.sort((a, b) => a.location.localeCompare(b.location)));
    } catch (e) {
      setError(e?.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }, [sku]);

  return (
    <section className="warehouse-sku-whereabouts" aria-label="SKU whereabouts">
      <h3 className="warehouse-sku-whereabouts__title">SKU whereabouts</h3>
      <div className="warehouse-sku-whereabouts__row">
        <input
          className="warehouse-sku-whereabouts__input"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Scan or type SKU"
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
        />
        <button type="button" className="btn-tier-secondary" disabled={loading} onClick={search}>
          {loading ? '…' : 'Find'}
        </button>
      </div>
      {error ? <p className="warehouse-sku-whereabouts__err">{error}</p> : null}
      {rows.length > 0 ? (
        <table className="data-table-pro warehouse-sku-whereabouts__table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Location</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.name}</td>
                <td>{r.sku}</td>
                <td>{r.location}</td>
                <td>{r.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
