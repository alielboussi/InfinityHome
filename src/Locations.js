/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';

const initialForm = { name: '', address: '', city: '' };

const Locations = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const rtTickLocations = useRealtimeRefresh(['locations']);

  useEffect(() => {
    fetchLocations();
  }, [rtTickLocations]);

  const fetchLocations = async () => {
    setLoading(true);
    try {
  // Perf: fetch only needed columns for listing and editing
  const { data, error } = await supabase.from('locations').select('id, name, address, city');
      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      setError('Failed to fetch locations.');
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
    setError('');
    if (!form.name.trim() && !form.address.trim()) {
      setError('Please enter at least one field (name or address).');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await supabase.from('locations').update(form).eq('id', editingId);
      } else {
        await supabase.from('locations').insert([form]);
      }
      setForm(initialForm);
      setEditingId(null);
      fetchLocations();
    } catch (err) {
      setError('Failed to save location.');
    } finally {
      setSaving(false);
    }
  }

  const handleEdit = (location) => {
    setForm({
      name: location.name || '',
      address: location.address || '',
      city: location.city || ''
    });
    setEditingId(location.id);
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this location and all related data?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('locations').delete().eq('id', id);
      if (error) throw error;
      fetchLocations();
    } catch (err) {
      setError('Failed to delete location.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  return (
    <div className="locations-page">
      <h2>Locations</h2>
      <div className="location-form">
        <input
          type="text"
          placeholder="Location Name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="text"
          placeholder="Address"
          value={form.address}
          onChange={e => setForm({ ...form, address: e.target.value })}
        />
        <input
          type="text"
          placeholder="City"
          value={form.city}
          onChange={e => setForm({ ...form, city: e.target.value })}
        />
        <button className="add-btn" onClick={handleSubmit}>{editingId ? 'Update' : 'Add'}</button>
      </div>
          {error && (!locations || locations.length === 0) && (
            <div className="error-message">{error}</div>
          )}
      <table className="locations-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>City</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {locations.map(loc => (
            <tr key={loc.id}>
              <td>{loc.name}</td>
              <td>{loc.address}</td>
              <td>{loc.city}</td>
              <td>
                <div className="actions-container">
                  <button className="edit-btn" onClick={() => handleEdit(loc)}>Edit</button>
                  <button className="delete-btn" onClick={() => handleDelete(loc.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default Locations;
