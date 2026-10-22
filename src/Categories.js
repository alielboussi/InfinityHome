/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { useNavigate } from 'react-router-dom';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { canManageCatalog, getCurrentUser } from './accessControl';
// Levenshtein distance function for fuzzy matching
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Helper to normalize category names for comparison
const normalize = str => str.toLowerCase().replace(/\s+/g, '');

function escapeCsv(value) {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

// Removed user permissions logic

const initialForm = { name: '' };

const Categories = () => {
  const canManageCatalogPage = canManageCatalog(getCurrentUser());
  const [categories, setCategories] = useState([]);
  const [categoryProductCounts, setCategoryProductCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const navigate = useNavigate();
  const rtTickCategories = useRealtimeRefresh(['categories']);

  useEffect(() => {
    fetchCategories();
  }, [rtTickCategories]);

  // Removed permissions fetching logic

  const fetchCategories = async () => {
    setLoading(true);
    try {
      // Perf: fetch only needed columns
      const [
        { data: categoriesData, error: categoriesError },
        { data: productsData, error: productsError },
        { data: combosData, error: combosError },
        { data: assembliesData, error: assembliesError },
      ] = await Promise.all([
        db
          .from('categories')
          .select('id, name')
          .order('name', { ascending: true }),
        db
          .from('products')
          .select('category_id')
          .not('category_id', 'is', null),
        db
          .from('combos')
          .select('category_id')
          .not('category_id', 'is', null),
        db
          .from('warehouse_assemblies')
          .select('category_id')
          .not('category_id', 'is', null),
      ]);
      if (categoriesError) throw categoriesError;
      if (productsError) throw productsError;
      if (combosError) throw combosError;
      if (assembliesError) throw assembliesError;
      const sorted = (categoriesData || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      );
      const counts = {};
      const bump = (row) => {
        const key = String(row.category_id || '');
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      };
      (productsData || []).forEach(bump);
      (combosData || []).forEach(bump);
      (assembliesData || []).forEach(bump);
      setCategories(sorted);
      setCategoryProductCounts(counts);
    } catch (err) {
      setError('Failed to fetch categories.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManageCatalogPage) return;
    setSaving(true);
    try {
      const nameTrimmed = (form.name || '').trim();
      if (!nameTrimmed) {
        setError('Please enter a category name.');
        setSaving(false);
        return;
      }
      if (editingId) {
        const { error } = await db
          .from('categories')
          .update({ name: nameTrimmed })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        // Manual duplicate check (case-insensitive exact)
        const { data: existingRows, error: fetchErr } = await db
          .from('categories')
          .select('id, name');
        if (fetchErr) throw fetchErr;
        const exists = (existingRows || []).some(c => (c.name || '').trim().toLowerCase() === nameTrimmed.toLowerCase());
        if (exists) {
          setError('Category name already exists.');
          setSaving(false);
          return;
        }
        const { error: insertErr } = await db
          .from('categories')
          .insert([{ name: nameTrimmed }]);
        if (insertErr) throw insertErr;
      }
      setForm(initialForm);
      setSearch('');
      setEditingId(null);
      fetchCategories();
    } catch (err) {
      setError('Failed to save category.' + (err?.message ? ` ${err.message}` : ''));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category) => {
    if (!canManageCatalogPage) return;
    setForm({ name: category.name || '' });
    setEditingId(category.id);
  };

  const deleteCategoriesByIds = async (ids) => {
    const unique = [...new Set((ids || []).filter((id) => id != null && id !== ''))];
    if (!unique.length) return;
    const clears = await Promise.all([
      db.from('products').update({ category_id: null }).in('category_id', unique),
      db.from('combos').update({ category_id: null }).in('category_id', unique),
      db.from('warehouse_assemblies').update({ category_id: null }).in('category_id', unique),
    ]);
    const clearErr = clears.find((r) => r.error)?.error;
    if (clearErr) throw clearErr;
    const { error } = await db.from('categories').delete().in('id', unique);
    if (error) throw error;
  };

  const handleDelete = async (id) => {
    if (!canManageCatalogPage) return;
    const linked = categoryProductCounts[String(id)] || 0;
    const confirmMsg = linked > 0
      ? `Delete this category? ${linked} linked item(s) will be left without a category (not deleted).`
      : 'Delete this category?';
    if (!window.confirm(confirmMsg)) return;
    setSaving(true);
    setError('');
    try {
      await deleteCategoriesByIds([id]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fetchCategories();
    } catch (err) {
      setError('Failed to delete category.' + (err?.message ? ` ${err.message}` : ''));
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!canManageCatalogPage) return;
    const ids = [...selectedIds];
    if (!ids.length) return;
    const linkedTotal = ids.reduce(
      (sum, id) => sum + (categoryProductCounts[String(id)] || 0),
      0,
    );
    const confirmMsg = linkedTotal > 0
      ? `Delete ${ids.length} categor${ids.length === 1 ? 'y' : 'ies'}? ${linkedTotal} linked item(s) will be left without a category (not deleted).`
      : `Delete ${ids.length} selected categor${ids.length === 1 ? 'y' : 'ies'}?`;
    if (!window.confirm(confirmMsg)) return;
    setSaving(true);
    setError('');
    try {
      await deleteCategoriesByIds(ids);
      setSelectedIds(new Set());
      fetchCategories();
    } catch (err) {
      setError('Failed to delete categories.' + (err?.message ? ` ${err.message}` : ''));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleExportCategoriesCsv = () => {
    const header = ['uuid', 'name'];
    const lines = categories.map((category) => [
      category.id,
      category.name,
    ].map(escapeCsv).join(','));
    const csv = [header.map(escapeCsv).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Categories_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Filter categories by search (show all if search is empty)
  const filteredCategories = search.trim() === ''
    ? categories
    : categories.filter(cat =>
        cat.name.toLowerCase().includes(search.toLowerCase())
      );

  // All actions always accessible
  const canAdd = canManageCatalogPage;
  const canEdit = canManageCatalogPage;
  const canDelete = canManageCatalogPage;

  const filteredCategoryIds = filteredCategories.map((c) => c.id);
  const allFilteredSelected = filteredCategoryIds.length > 0
    && filteredCategoryIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredCategoryIds.some((id) => selectedIds.has(id));

  const toggleCategorySelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredCategoryIds.forEach((id) => next.delete(id));
      } else {
        filteredCategoryIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const tableColSpan = canManageCatalogPage ? 3 : 1;

  // Removed permission access check

  return (
    <div className="categories-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h2 className="categories-title">Categories</h2>
        <button
          type="button"
          className="save-btn"
          onClick={handleExportCategoriesCsv}
          disabled={loading || categories.length === 0}
          style={{ marginLeft: 'auto' }}
        >
          Export CSV
        </button>
      </div>
      {canManageCatalogPage ? (
      <form className="category-form" onSubmit={handleSubmit}>
        <input
          name="name"
          type="text"
          placeholder="Search or Add Category"
          value={editingId ? form.name : search}
          onChange={e => {
            if (editingId) {
              setForm({ ...form, name: e.target.value });
            } else {
              setSearch(e.target.value);
              setForm({ ...form, name: e.target.value });
            }
          }}
          required
        />
        <button type="submit" disabled={saving} className="save-btn">
          {editingId ? 'Update' : 'Add'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={handleCancelEdit}
            className="cancel-btn"
          >
            Cancel
          </button>
        )}
        {selectedIds.size > 0 && (
          <button
            type="button"
            className="delete-btn"
            onClick={handleBulkDelete}
            disabled={saving}
          >
            Delete selected ({selectedIds.size})
          </button>
        )}
      </form>
      ) : (
        <div className="categories-error" style={{ marginBottom: '1rem' }}>
          Category create, edit, and delete controls are disabled for this user.
        </div>
      )}
      {error && <div className="categories-error">{error}</div>}
      <div className="categories-table-wrapper">
        <table className="categories-table">
          <thead>
            <tr>
              {canManageCatalogPage && (
                <th className="categories-table__check-col">
                  <input
                    type="checkbox"
                    aria-label="Select all categories in this list"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                    }}
                    onChange={toggleSelectAllFiltered}
                    disabled={saving || filteredCategories.length === 0}
                  />
                </th>
              )}
              <th>Name</th>
              {canManageCatalogPage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={tableColSpan}>Loading...</td></tr>
            ) : filteredCategories.length === 0 ? (
              <tr><td colSpan={tableColSpan}>No categories found.</td></tr>
            ) : (
              filteredCategories.map((category) => (
                <tr key={category.id} className={editingId === category.id ? 'editing-row' : ''}>
                  {canManageCatalogPage && (
                    <td className="categories-table__check-col">
                      <input
                        type="checkbox"
                        aria-label={`Select ${category.name}`}
                        checked={selectedIds.has(category.id)}
                        onChange={() => toggleCategorySelected(category.id)}
                        disabled={saving}
                      />
                    </td>
                  )}
                  <td>
                    <span>{category.name}</span>
                    {!(categoryProductCounts[String(category.id)] > 0) && (
                      <span
                        style={{
                          marginLeft: '8px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: '#3a1f1f',
                          color: '#ffb3b3',
                          border: '1px solid #ff6b6b',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px'
                        }}
                      >
                        Unused
                      </span>
                    )}
                  </td>
                  {canManageCatalogPage && <td>
                    <div className="actions-container">
                      {canEdit && <button className="edit-btn" onClick={() => handleEdit(category)} disabled={saving}>Edit</button>}
                      {canDelete && <button className="delete-btn" onClick={() => handleDelete(category.id)} disabled={saving}>Delete</button>}
                    </div>
                  </td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Categories;
