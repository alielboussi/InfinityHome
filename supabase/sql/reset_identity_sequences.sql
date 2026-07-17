-- Reset identity sequences after importing rows with explicit ids.
-- Run once in Supabase SQL Editor after importDbBackup.js completes.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%nextval%'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true)',
      rec.schema_name || '.' || rec.table_name,
      rec.column_name,
      rec.column_name,
      rec.schema_name,
      rec.table_name
    );
    RAISE NOTICE 'Reset sequence for %.%', rec.table_name, rec.column_name;
  END LOOP;
END $$;
