import { createClient } from '@supabase/supabase-js';

const ALLOWED_VIEWER_EMAIL = 'alielboussi00@gmail.com';

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceKey) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL (or REACT_APP_SUPABASE_URL)');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE');
    const error = new Error('Supabase service environment variables missing');
    error.status = 500;
    error.details = { missing };
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

function getSupabaseAnonClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL (or REACT_APP_SUPABASE_URL)');
    if (!anonKey) missing.push('SUPABASE_ANON_KEY (or REACT_APP_SUPABASE_ANON_KEY)');
    const error = new Error('Supabase anon environment variables missing');
    error.status = 500;
    error.details = { missing };
    throw error;
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

async function getRequestUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const supabase = getSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    const authError = new Error(error.message || 'Invalid session');
    authError.status = 401;
    throw authError;
  }
  return data?.user || null;
}

function isViewer(actor) {
  return String(actor?.email || '').trim().toLowerCase() === ALLOWED_VIEWER_EMAIL;
}

function resolveActor(row, usersById = new Map()) {
  const userUid = row?.user_uid ? String(row.user_uid) : null;
  const matchedUser = userUid ? usersById.get(userUid) : null;
  const userEmail = row?.user_email || matchedUser?.email || null;
  const userName = row?.user_name || matchedUser?.full_name || userEmail || 'Unknown User';
  return {
    userUid,
    userKey: userUid || (userEmail ? `email:${userEmail}` : 'unknown'),
    userName,
    userEmail,
    userRole: matchedUser?.role || null,
  };
}

function mapLogRow(row, usersById = new Map()) {
  const actorInfo = resolveActor(row, usersById);
  return {
    id: `log-${row.id}`,
    timestamp: row.created_at,
    actionType: row.action_type,
    actionLabel: row.action_label,
    userKey: actorInfo.userKey,
    userUid: actorInfo.userUid,
    userName: actorInfo.userName,
    userEmail: actorInfo.userEmail,
    userRole: actorInfo.userRole,
    details: row.details || '',
    reference: row.reference || null,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    route: row.route || null,
  };
}

async function loadLoggedActivities(supabase, limit, usersById = new Map()) {
  const { data, error } = await supabase
    .from('user_activity_log')
    .select('id, created_at, user_uid, user_email, user_name, action_type, action_label, details, reference, entity_type, entity_id, route, metadata')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message || '')) {
      return [];
    }
    throw error;
  }
  return (data || []).map((row) => mapLogRow(row, usersById));
}

async function handlePost(req, res) {
  const actor = await getRequestUser(req);
  if (!actor) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const actionType = String(body.actionType || '').trim();
  const actionLabel = String(body.actionLabel || '').trim();
  if (!actionType || !actionLabel) {
    res.status(400).json({ ok: false, error: 'actionType and actionLabel are required' });
    return;
  }

  const supabase = getSupabaseServiceClient();
  const userMeta = actor.user_metadata && typeof actor.user_metadata === 'object' ? actor.user_metadata : {};

  let resolvedName = userMeta.full_name || userMeta.name || null;
  if (!resolvedName && actor.id) {
    const { data: profile } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', actor.id)
      .maybeSingle();
    resolvedName = profile?.full_name || profile?.email || null;
  }

  const insertRow = {
    user_uid: actor.id || null,
    user_email: actor.email || null,
    user_name: resolvedName || actor.email || null,
    action_type: actionType,
    action_label: actionLabel,
    details: body.details != null ? String(body.details) : null,
    reference: body.reference != null ? String(body.reference) : null,
    entity_type: body.entityType != null ? String(body.entityType) : null,
    entity_id: body.entityId != null ? String(body.entityId) : null,
    route: body.route != null ? String(body.route) : null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };

  const { data, error } = await supabase
    .from('user_activity_log')
    .insert([insertRow])
    .select('id')
    .maybeSingle();

  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message || '')) {
      res.status(503).json({
        ok: false,
        error: 'user_activity_log table is missing. Run supabase/sql/user_activity_log.sql first.',
      });
      return;
    }
    throw error;
  }

  res.status(200).json({ ok: true, id: data?.id || null });
}

async function handleGet(req, res) {
  const actor = await getRequestUser(req);
  if (!actor) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }
  if (!isViewer(actor)) {
    res.status(403).json({ ok: false, error: 'Access denied' });
    return;
  }

  const supabase = getSupabaseServiceClient();
  const rawLimit = Number(req.query?.limit || 250);
  const limit = Number.isFinite(rawLimit) ? Math.max(50, Math.min(500, rawLimit)) : 250;

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .limit(500);

  if (usersError) throw usersError;

  const usersById = new Map((users || []).map((row) => [String(row.id), row]));
  const activities = await loadLoggedActivities(supabase, limit, usersById);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).json({
    ok: true,
    source: 'user_activity_log',
    activities,
    users: (users || []).map((row) => ({
      id: row.id,
      full_name: row.full_name || null,
      email: row.email || null,
      role: row.role || null,
    })),
  });
}

async function handleDelete(req, res) {
  const actor = await getRequestUser(req);
  if (!actor) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }
  if (!isViewer(actor)) {
    res.status(403).json({ ok: false, error: 'Access denied' });
    return;
  }

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('user_activity_log')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message || '')) {
      res.status(503).json({
        ok: false,
        error: 'user_activity_log table is missing. Run supabase/sql/user_activity_log.sql first.',
      });
      return;
    }
    throw error;
  }

  res.status(200).json({ ok: true, cleared: true });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === 'POST') {
      await handlePost(req, res);
      return;
    }
    if (req.method === 'GET') {
      await handleGet(req, res);
      return;
    }
    if (req.method === 'DELETE') {
      await handleDelete(req, res);
      return;
    }
    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      ok: false,
      error: err?.message || 'Unexpected error',
      details: err?.details || null,
    });
  }
}
