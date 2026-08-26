import React, { useState, useEffect } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { cacheGet, cacheSet } from './utils/staleCache';
// Removed unused navigate import (was not used, eliminating CI lint error)
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { parseStartingDueInput, parseStartingDueDateInput } from './utils/startingDueBalance';
// Removed user permissions logic

const initialForm = {
  name: '',
  phonePrefix: '+260',
  phone: '',
  address: '',
  city: '',
  tpin: '',
  currency: 'K',
  starting_due_balance: '',
  starting_due_balance_date: '',
};

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  // Removed user permissions state
  // navigate removed – dashboard navigation handled elsewhere
  // Realtime: refresh whenever customers table changes
  const rtTickCustomers = useRealtimeRefresh(['customers']);

  const handleExportCsv = () => {
    const header = ['id', 'name', 'phone', 'address', 'city', 'tpin'];
    const escapeCsv = (value) => {
      const raw = value == null ? '' : String(value);
      if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
      return raw;
    };
    const lines = (customers || []).map(c => [
      c.id,
      c.name,
      c.phone,
      c.address,
      c.city,
      c.tpin,
    ].map(escapeCsv).join(','));
    const csv = [header.map(escapeCsv).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Customers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  useEffect(() => {
    fetchCustomers();
  }, [rtTickCustomers]);

  // Removed permissions fetching logic

  const fetchCustomers = async () => {
    // Serve cached snapshot immediately for instant UI
    try {
      const cached = cacheGet('customers:list:v1');
      if (cached && Array.isArray(cached)) {
        setCustomers(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch { setLoading(true); }
    try {
      const { data, error } = await db.from('customers').select('id, name, phone, address, city, tpin, currency, starting_due_balance, starting_due_balance_date, created_at');
      if (error) throw error;
      setCustomers(data || []);
      try { cacheSet('customers:list:v1', data || [], 5 * 60 * 1000); } catch {}
    } catch (err) {
      setError('Failed to fetch customers.');
    } finally {
      setLoading(false);
    }
  };

  // Back to Dashboard handled via header button

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Capitalize first letter of each word in a string, ensure single spaces
  const capitalizeWords = (str) =>
    str
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Capitalize name and normalize fields before saving
      const buildPayload = (f) => {
        const { phonePrefix, ...rest } = f;
        // Build phone in E.164-like format using selected prefix
        const fullPhone = (() => {
          const raw = (rest.phone || '').trim();
          const prefix = (phonePrefix || '').trim();
          if (!raw) return '';
          const digits = raw.replace(/\D/g, '');
          const normalized = digits.replace(/^0+/, '');
          const prefixDigits = (prefix || '').replace(/\D/g, '');
          const finalDigits = normalized.startsWith(prefixDigits) ? normalized : `${prefixDigits}${normalized}`;
          return `+${finalDigits}`;
        })();
        const payload = {
          ...rest,
          name: capitalizeWords(f.name),
          phone: fullPhone,
          currency: (f.currency || 'K').trim() || 'K',
          starting_due_balance: (() => {
            const parsed = parseStartingDueInput(f.starting_due_balance);
            return Number.isFinite(parsed) ? parsed : 0;
          })(),
          starting_due_balance_date: (() => {
            const parsedBalance = parseStartingDueInput(f.starting_due_balance);
            if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) return null;
            return parseStartingDueDateInput(f.starting_due_balance_date);
          })(),
        };
        return payload;
      };
      const formToSave = buildPayload(form);
      if (!Number.isFinite(parseStartingDueInput(form.starting_due_balance))) {
        setError('Enter a valid starting due balance or leave blank.');
        setSaving(false);
        return;
      }
      if (
        parseStartingDueInput(form.starting_due_balance) > 0
        && form.starting_due_balance_date
        && !parseStartingDueDateInput(form.starting_due_balance_date)
      ) {
        setError('Enter a valid starting due balance date or leave blank.');
        setSaving(false);
        return;
      }
      // Phone, address, city, tpin are optional
      if (editingId) {
        // Update
        const { error } = await db
          .from('customers')
          .update(formToSave)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await db
          .from('customers')
          .insert([formToSave]);
        if (error) throw error;
      }
      setForm(initialForm);
      setEditingId(null);
      fetchCustomers();
      if (searchTerm.trim()) {
        await runSearch(searchTerm.trim());
      }
    } catch (err) {
      setError('Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    // Infer phone prefix from existing phone if available
    const inferPrefix = (phone) => {
      const p = (phone || '').toString();
      if (p.startsWith('+44')) return '+44';
      if (p.startsWith('+243')) return '+243';
      if (p.startsWith('+260')) return '+260';
      return '+260';
    };
    setForm({
      name: customer.name || '',
      phonePrefix: inferPrefix(customer.phone),
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      tpin: customer.tpin || '',
      currency: customer.currency || 'K',
      starting_due_balance: customer.starting_due_balance != null && Number(customer.starting_due_balance) > 0
        ? String(customer.starting_due_balance)
        : '',
      starting_due_balance_date: customer.starting_due_balance_date
        ? String(customer.starting_due_balance_date).slice(0, 10)
        : '',
    });
    setEditingId(customer.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    setSaving(true);
    try {
      const { error } = await db.from('customers').delete().eq('id', id);
      if (error) throw error;
      fetchCustomers();
    } catch (err) {
      setError('Failed to delete customer.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  // Removed permission helpers
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  // Removed permission access check

  const runSearch = async (term) => {
    const t = term.trim();
    if (!t) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const pattern = `%${t}%`;
      const { data, error } = await db
      .from('customers')
      .select('id, name, phone, address, city, tpin, currency, starting_due_balance, starting_due_balance_date')
      .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
      .order('name', { ascending: true });
      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      setError('Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    await runSearch(searchTerm);
  };

  // Auto-search as the user types (debounced)
  useEffect(() => {
    const trimmed = searchTerm.trim();
    const handle = setTimeout(() => {
      if (!trimmed) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      runSearch(trimmed);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const customerMeta = loading ? 'Loading customers…' : `${customers.length} saved customer${customers.length === 1 ? '' : 's'}`;

  const latestCustomers = React.useMemo(() => {
    const list = Array.isArray(customers) ? [...customers] : [];
    list.sort((a, b) => {
      const aTime = Date.parse(a?.created_at || 0) || 0;
      const bTime = Date.parse(b?.created_at || 0) || 0;
      return bTime - aTime;
    });
    return list.slice(0, 5);
  }, [customers]);


  return (
    <div className="customers-page-container">
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="customers-title" style={{ margin: 0 }}>Customers</h1>
        <button type="button" onClick={handleExportCsv} disabled={customers.length === 0}>
          Export CSV
        </button>
      </div>
      <div style={{ color: '#8ab', margin: '4px 0 12px' }}>{customerMeta}</div>
      {canAdd && (
        <form className="customer-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <input
              name="name"
              type="text"
              placeholder="Name or Business Name"
              value={form.name}
              onChange={handleChange}
              required
            />
            <div className="phone-row">
              <select
                name="phonePrefix"
                value={form.phonePrefix}
                onChange={handleChange}
                title="Phone country code"
              >
                <option value="+260">+260</option>
                <option value="+243">+243</option>
                <option value="+44">+44</option>
              </select>
              <input
                name="phone"
                type="text"
                placeholder="Phone Number (optional)"
                value={form.phone}
                onChange={handleChange}
              />
            </div>
            <input
              name="address"
              type="text"
              placeholder="Address (optional)"
              value={form.address}
              onChange={handleChange}
            />
            <input
              name="city"
              type="text"
              placeholder="City (optional)"
              value={form.city}
              onChange={handleChange}
            />
          </div>
          <div className="form-row">
            <input
              name="tpin"
              type="text"
              placeholder="TPIN (optional)"
              value={form.tpin}
              onChange={handleChange}
            />
            <select
              name="currency"
              value={form.currency}
              onChange={handleChange}
              title="Currency for starting due balance"
            >
              <option value="K">Kwacha (K)</option>
              <option value="USD">US Dollar ($)</option>
            </select>
            <input
              name="starting_due_balance"
              type="number"
              min="0"
              step="0.01"
              placeholder="Starting due balance (optional)"
              value={form.starting_due_balance}
              onChange={handleChange}
            />
            <input
              name="starting_due_balance_date"
              type="date"
              title="Date for starting due balance"
              value={form.starting_due_balance_date}
              onChange={handleChange}
            />
            <div className="form-actions">
              <button type="submit" disabled={saving} className="save-btn">
                {editingId ? 'Update' : 'Add'}
              </button>
              {editingId && (
                <button type="button" onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
              )}
            </div>
          </div>
        </form>
      )}
      {canAdd && (
        <div style={{ color: '#8ab', fontSize: '0.9rem', margin: '0 0 12px' }}>
          Starting due balance is added to layby/POS customer dues. Set the date when the balance started. Down payments reduce it like any other balance.
        </div>
      )}
      {error && <div className="customers-error">{error}</div>}

      <div className="customer-search">
        <h3>Find a customer</h3>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by name or phone number"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </form>
      </div>

      <div className="customers-latest">
        <h3>Latest added customers</h3>
        {latestCustomers.length === 0 ? (
          <div className="customers-hint">No customers added yet.</div>
        ) : (
          <table className="customers-table">
            <thead>
              <tr>
                <th>Name/Business</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {latestCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="customers-table-wrapper">
        {!searchTerm.trim() && !searching && searchResults.length === 0 && (
          <div className="customers-hint">Enter a name or phone to search customers.</div>
        )}
        {searching && <div className="customers-hint">Searching...</div>}
        {!searching && searchTerm.trim() && searchResults.length === 0 && (
          <div className="customers-hint">No customers found.</div>
        )}
        {!searching && searchResults.length > 0 && (
          <table className="customers-table">
            <thead>
              <tr>
                <th>Name/Business</th>
                <th>Phone</th>
                <th>City</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((customer) => (
                <tr key={customer.id} className={editingId === customer.id ? 'editing-row' : ''}>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.city}</td>
                  <td>{customer.address}</td>
                  <td className="actions-cell">
                    {canEdit && <button className="edit-btn" onClick={() => handleEdit(customer)} disabled={saving}>Edit</button>}
                    {canDelete && <button className="delete-btn" onClick={() => handleDelete(customer.id)} disabled={saving}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Customers;
