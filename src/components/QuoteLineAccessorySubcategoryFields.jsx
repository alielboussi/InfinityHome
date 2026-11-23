import React, { useEffect, useMemo, useState } from 'react';
import { fetchWarehouseCatalog, saveWarehouseAccessorySubcategory } from '../services/warehouseCatalog';
import {
  listAccessoriesForSubcategory,
  listAccessorySubcategories,
  normalizeAccessoryPicks,
  resolveLineAccessorySubcategories,
  slotCountForSubcategory,
  upsertAccessoryPick,
} from '../utils/warehouseAccessoryCatalog';

export default function QuoteLineAccessorySubcategoryFields({ item, locked, onPatch }) {
  const [assemblies, setAssemblies] = useState([]);
  const [addId, setAddId] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const catalog = await fetchWarehouseCatalog();
    setAssemblies(catalog?.assemblies || []);
  };

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) setAssemblies([]);
    });
    return () => { cancelled = true; };
  }, []);

  const catalogSubs = useMemo(() => listAccessorySubcategories(assemblies), [assemblies]);
  const lineSubs = useMemo(
    () => resolveLineAccessorySubcategories({ item, assemblies }),
    [item, assemblies],
  );
  const picks = normalizeAccessoryPicks(item?.accessory_picks);
  const extraSlots = item?.accessory_slot_counts && typeof item.accessory_slot_counts === 'object'
    ? item.accessory_slot_counts
    : {};
  const unusedSubs = catalogSubs.filter((s) => !lineSubs.some((l) => l.id === s.id));
  const storedFields = Array.isArray(item?.accessory_subcategory_fields) ? item.accessory_subcategory_fields : [];
  const lineSubKey = lineSubs.map((s) => s.id).join(',');

  useEffect(() => {
    if (locked) return;
    if (storedFields.length || !lineSubKey) return;
    onPatch({ accessory_subcategory_fields: lineSubs });
    // Persist product defaults onto this line once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, storedFields.length, lineSubKey]);

  const patchFields = (nextFields, extra = {}) => {
    onPatch({
      accessory_subcategory_fields: nextFields,
      accessory_picks: picks,
      ...extra,
    });
  };

  const addSubToLine = (sub) => {
    if (!sub?.id) return;
    if (lineSubs.some((s) => s.id === sub.id)) return;
    patchFields([...lineSubs, { id: sub.id, name: sub.name }]);
    setAddId('');
  };

  const createAndAdd = async () => {
    if (locked || busy || !newSubName.trim()) return;
    setBusy(true);
    try {
      const row = await saveWarehouseAccessorySubcategory(newSubName);
      await load();
      patchFields([...lineSubs, { id: String(row.id), name: String(row.name || newSubName).trim() }]);
      setNewSubName('');
    } catch (err) {
      alert(err?.message || 'Failed to add subcategory');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="quotes-line-accessory-subs">
      {lineSubs.map((sub) => {
        const options = listAccessoriesForSubcategory(assemblies, sub.id);
        const slots = Math.max(
          slotCountForSubcategory(picks, sub.id),
          Math.max(1, Math.floor(Number(extraSlots[sub.id]) || 1)),
        );
        return (
          <div key={sub.id} className="quotes-line-accessory-sub">
            <span className="quotes-line-meta-label">{sub.name}</span>
            {Array.from({ length: slots }, (_, i) => i + 1).map((slot) => {
              const current = picks.find((p) => p.subcategory_id === sub.id && p.slot === slot);
              return (
                <label key={`${sub.id}-${slot}`} className="quotes-line-meta-field quotes-line-accessory-slot">
                  <span className="quotes-line-accessory-num">{slot}</span>
                  <select
                    className="quotes-select quotes-select--slim quotes-line-meta-control"
                    disabled={locked}
                    value={current?.assembly_id || ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      const opt = options.find((o) => o.id === id);
                      onPatch({
                        accessory_subcategory_fields: lineSubs,
                        accessory_picks: upsertAccessoryPick(picks, {
                          subcategory_id: sub.id,
                          subcategory_name: sub.name,
                          slot,
                          assembly_id: opt?.id || '',
                          name: opt?.name || '',
                          sku: opt?.sku || '',
                          image_url: opt?.image_url || '',
                        }),
                      });
                    }}
                    aria-label={`${sub.name} accessory ${slot}`}
                  >
                    <option value="">—</option>
                    {options.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                  {current?.image_url ? (
                    <img src={current.image_url} alt="" className="quotes-line-accessory-thumb" />
                  ) : null}
                </label>
              );
            })}
            {!locked ? (
              <button
                type="button"
                className="quotes-accessories-toggle-btn"
                onClick={() => onPatch({
                  accessory_subcategory_fields: lineSubs,
                  accessory_picks: picks,
                  accessory_slot_counts: { ...extraSlots, [sub.id]: slots + 1 },
                })}
              >
                + {slots + 1}
              </button>
            ) : null}
          </div>
        );
      })}

      {!locked ? (
        <div className="quotes-line-accessory-sub quotes-line-accessory-sub--add">
          <span className="quotes-line-meta-label">Add subcategory to this product</span>
          <select
            className="quotes-select quotes-select--slim quotes-line-meta-control"
            value={addId}
            onChange={(e) => {
              const sub = catalogSubs.find((s) => s.id === e.target.value);
              addSubToLine(sub);
            }}
          >
            <option value="">Choose subcategory…</option>
            {unusedSubs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="warehouse-generate-sku-row" style={{ gap: 8, marginTop: 6 }}>
            <input
              className="quotes-input quotes-input--slim"
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              placeholder="New subcategory"
            />
            <button type="button" className="quotes-accessories-toggle-btn" disabled={busy || !newSubName.trim()} onClick={createAndAdd}>
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
