import supabase from "../supabase";

const getApiBase = () => {
  const base = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
  if (!base) return '';
  return base.replace(/\/+$/, '');
};

const isLocalHost = () => {
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(host);
  } catch {
    return false;
  }
};

const shouldUseApi = () => {
  const apiBase = getApiBase();
  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  if (forceApi) return true;
  if (isLocalHost()) return Boolean(apiBase);
  return Boolean(apiBase) || process.env.NODE_ENV === 'production';
};

const wrapLocalDevRlsError = (error) => {
  const message = String(error?.message || error || 'Unknown error');
  if (isLocalHost() && !getApiBase() && /row-level security|permission denied/i.test(message)) {
    return new Error(`${message}. Local dev is calling Supabase directly. Set REACT_APP_API_BASE to your deployed app URL or run vercel dev so /api/combo-locations can use the service-role path.`);
  }
  return error instanceof Error ? error : new Error(message);
};

const wrapComboLocationApiError = (error, url) => {
  const message = String(error?.message || error || 'Unknown error');
  const isRoutingIssue = /Unexpected response from combo locations API|Failed to fetch|NetworkError|Load failed/i.test(message);
  if (isLocalHost() && getApiBase() && isRoutingIssue) {
    return new Error(`${message}. The configured API host at ${url} is not serving /api/combo-locations to localhost. Redeploy the current codebase to that host, or run vercel dev and point REACT_APP_API_BASE at that local serverless endpoint.`);
  }
  return error instanceof Error ? error : new Error(message);
};

async function postComboLocations(payload) {
  const apiBase = getApiBase();
  const url = apiBase ? `${apiBase}/api/combo-locations` : '/api/combo-locations';
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw wrapComboLocationApiError(error, url);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw wrapComboLocationApiError(new Error(`Unexpected response from combo locations API (${response.status})`), url);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw wrapComboLocationApiError(new Error(data?.error || 'Failed to save combo locations.'), url);
  }
  return data || {};
}

const needsManualId = (error) => {
  if (!error || !error.message) return false;
  return /null value in column\s+"id"/i.test(error.message)
    || /duplicate key value violates unique constraint.*combo_locations_pkey/i.test(error.message);
};

const comboLocationKey = (row) => `${coerceNumeric(row.combo_id)}::${row.location_id}`;

const dedupeComboRows = (rows) => {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = comboLocationKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};

const fetchNextComboLocationId = async () => {
  const { data, error } = await supabase
    .from("combo_locations")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("Unable to compute next combo location id", error);
    return 1;
  }
  const latest = Array.isArray(data) && data.length ? Number(data[0].id) : 0;
  return Number.isFinite(latest) ? latest + 1 : 1;
};

const coerceNumeric = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
};

export async function insertComboLocations(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const payload = dedupeComboRows(rows.map((row) => ({
    ...row,
    combo_id: coerceNumeric(row.combo_id),
    location_id: row.location_id,
  })));
  if (!payload.length) return;

  let { error } = await supabase.from("combo_locations").insert(payload);
  if (needsManualId(error)) {
    let nextId = await fetchNextComboLocationId();
    const rowsWithIds = payload.map((row) => ({ ...row, id: nextId++ }));
    ({ error } = await supabase.from("combo_locations").insert(rowsWithIds));
  }

  if (error) {
    throw error;
  }
}

export async function upsertComboLocations(rows) {
  const payload = dedupeComboRows((Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    combo_id: coerceNumeric(row.combo_id),
    location_id: row.location_id,
  })));
  if (!payload.length) return { ok: true, count: 0 };

  if (shouldUseApi()) {
    try {
      return await postComboLocations({ rows: payload, upsert: true });
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || String(process.env.REACT_APP_FORCE_API || '').trim() === '1') {
        throw err;
      }
    }
  }

  const comboIds = [...new Set(payload.map((row) => row.combo_id))];
  const { data: existing, error: existingErr } = await supabase
    .from('combo_locations')
    .select('combo_id, location_id')
    .in('combo_id', comboIds);
  if (existingErr) throw wrapLocalDevRlsError(existingErr);

  const existingKeys = new Set((existing || []).map(comboLocationKey));
  const missing = payload.filter((row) => !existingKeys.has(comboLocationKey(row)));
  if (!missing.length) return { ok: true, count: 0 };

  try {
    await insertComboLocations(missing);
  } catch (error) {
    throw wrapLocalDevRlsError(error);
  }
  return { ok: true, count: missing.length };
}

export async function replaceComboLocations(comboId, rows) {
  const payload = Array.isArray(rows) ? rows : [];

  if (shouldUseApi()) {
    try {
      return await postComboLocations({ replaceComboId: comboId, rows: payload });
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || String(process.env.REACT_APP_FORCE_API || '').trim() === '1') {
        throw err;
      }
    }
  }

  const { error: deleteError } = await supabase.from('combo_locations').delete().eq('combo_id', coerceNumeric(comboId));
  if (deleteError) throw wrapLocalDevRlsError(deleteError);
  try {
    await insertComboLocations(payload);
  } catch (error) {
    throw wrapLocalDevRlsError(error);
  }
  return { ok: true, count: payload.length };
}

export async function deleteComboLocations(comboId) {
  if (!comboId && comboId !== 0) return { ok: true, count: 0 };

  if (shouldUseApi()) {
    try {
      return await postComboLocations({ deleteComboId: comboId });
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || String(process.env.REACT_APP_FORCE_API || '').trim() === '1') {
        throw err;
      }
    }
  }

  const { error } = await supabase.from('combo_locations').delete().eq('combo_id', coerceNumeric(comboId));
  if (error) throw wrapLocalDevRlsError(error);
  return { ok: true, count: 0 };
}
