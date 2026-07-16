/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import supabase from './supabase';
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
      const [{ data: categoriesData, error: categoriesError }, { data: productsData, error: productsError }] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name')
          .order('name', { ascending: true }),
        supabase
          .from('products')
          .select('category_id')
          .not('category_id', 'is', null),
      ]);
      if (categoriesError) throw categoriesError;
      if (productsError) throw productsError;
      const sorted = (categoriesData || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      );
      const counts = {};
      (productsData || []).forEach((row) => {
        const key = String(row.category_id || '');
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
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
        const { error } = await supabase
          .from('categories')
          .update({ name: nameTrimmed })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        // Manual duplicate check (case-insensitive exact)
        const { data: existingRows, error: fetchErr } = await supabase
          .from('categories')
          .select('id, name');
        if (fetchErr) throw fetchErr;
        const exists = (existingRows || []).some(c => (c.name || '').trim().toLowerCase() === nameTrimmed.toLowerCase());
        if (exists) {
          setError('Category name already exists.');
          setSaving(false);
          return;
        }
        const { error: insertErr } = await supabase
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

  const handleDelete = async (id) => {
    if (!canManageCatalogPage) return;
    if (!window.confirm('Delete this category and all related products?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      fetchCategories();
    } catch (err) {
      setError('Failed to delete category.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
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

  // Removed permission access check

  return (
    <div className="categories-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h2 className="categories-title">Categories</h2>
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
              <th>Name</th>
              {canManageCatalogPage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canManageCatalogPage ? 2 : 1}>Loading...</td></tr>
            ) : filteredCategories.length === 0 ? (
              <tr><td colSpan={canManageCatalogPage ? 2 : 1}>No categories found.</td></tr>
            ) : (
              filteredCategories.map((category) => (
                <tr key={category.id} className={editingId === category.id ? 'editing-row' : ''}>
                  <td>
                    <span>{category.name}</span>
                    {!categoryProductCounts[String(category.id)] && (
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
