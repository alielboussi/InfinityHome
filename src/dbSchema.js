// Centralized helpers to avoid accidental schema regressions.
// Always query the intended schema explicitly via supabase-js v2 .schema() API.
import supabase from './supabase';

export const DB_SCHEMA = 'public';

export function fromPublic(table) {
  // Ensure we always use the schema-qualified client and JSON body inserts.
  // For some proxies, a mistaken CSV mode can be triggered when passing columns=.
  return supabase.schema(DB_SCHEMA).from(table);
}

export function storageSchema() {
  return supabase.storage; // unchanged, here for symmetry if needed
}
