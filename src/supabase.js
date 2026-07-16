// src/supabase.js

import { createClient } from '@supabase/supabase-js';

// Known project URL — used when env is missing or accidentally set to the app/API host.
const KNOWN_SUPABASE_URL = 'https://ayuufehhzsrinvtlmyqm.supabase.co';

// Fetch Supabase credentials from environment variables
let SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// Normalize common misconfigurations to avoid name resolution failures
function normalizeSupabaseUrl(urlLike) {
	if (!urlLike) return KNOWN_SUPABASE_URL;
	let u = String(urlLike).trim();
	// If someone pasted the project ref only, build the full URL
	// Project refs are 20+ lowercase alphanumeric characters
	if (/^[a-z0-9]{15,}$/i.test(u) && !u.includes('http')) {
		u = `https://${u}.supabase.co`;
	}
	// Fix accidental .com domain
	u = u.replace(/\.supabase\.com\b/i, '.supabase.co');
	// Ensure protocol
	if (!/^https?:\/\//i.test(u)) {
		u = 'https://' + u;
	}
	u = u.replace(/\/+$/, '');

	// Guard: Vercel/app hosts must never be used as the Supabase API base.
	// A wrong value makes auth hit the SPA (POST → 405 Method Not Allowed).
	const host = u.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
	const looksLikeSupabase = host.endsWith('.supabase.co') || host === 'supabase.co';
	const looksLikeAppHost = /(^|\.)vercel\.app$/i.test(host)
		|| /(^|\.)infinityhome\.app$/i.test(host)
		|| host === 'localhost'
		|| host.startsWith('127.');
	if (!looksLikeSupabase || looksLikeAppHost) {
		// eslint-disable-next-line no-console
		console.error('[Supabase] REACT_APP_SUPABASE_URL is invalid; using known project URL.', { configured: u });
		return KNOWN_SUPABASE_URL;
	}
	return u;
}

SUPABASE_URL = normalizeSupabaseUrl(SUPABASE_URL);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
	// Provide a clear diagnostic in the console to speed up local setup
	// eslint-disable-next-line no-console
	console.error('[Supabase] Missing configuration. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your environment.');
}

// Create a Supabase client instance with a default DB schema to avoid
// "relation does not exist" issues when proxies or environments drop schema headers
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	// Force PostgREST to use the public schema explicitly on every request.
	db: { schema: 'public' },
	global: {
		headers: {
			// These headers make the target schema unambiguous even if a proxy
			// or environment drops the default Accept/Content profile headers.
			'Accept-Profile': 'public',
			'Content-Profile': 'public',
		},
	},
	auth: {
    // Be explicit to avoid environments that disable persistence or refresh
    persistSession: true,
    autoRefreshToken: true,
    // Required for Google OAuth return on /login and /stocktake/count (localhost + Vercel).
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export default supabase;
