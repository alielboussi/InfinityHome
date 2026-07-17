-- Reset identity sequences after importing rows with explicit ids.
-- Run once in Supabase SQL Editor after importDbBackup.js completes.

DO $$
DECLARE
  rec record;
  sequence_name text;
  max_id bigint;
BEGIN
  FOR rec IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND (
        a.attidentity IN ('a', 'd')
        OR pg_get_expr(ad.adbin, ad.adrelid) LIKE '%nextval%'
      )
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    sequence_name := pg_get_serial_sequence(
      rec.schema_name || '.' || rec.table_name,
      rec.column_name
    );

    IF sequence_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT MAX(%I)::bigint FROM %I.%I',
        rec.column_name,
        rec.schema_name,
        rec.table_name
      ) INTO max_id;

      -- is_called=false makes an empty table start at 1; otherwise the next
      -- generated value is MAX(id) + 1.
      PERFORM setval(sequence_name::regclass, COALESCE(max_id, 1), max_id IS NOT NULL);
      RAISE NOTICE 'Reset sequence % for %.% to %',
        sequence_name, rec.table_name, rec.column_name, COALESCE(max_id, 1);
    END IF;
  END LOOP;
END $$;
