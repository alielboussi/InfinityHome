-- Infinity Home — full schema inventory as JSON
-- Run in Supabase SQL Editor → copy the single JSON cell → save as supabase/sql/schema.sql
-- Tip: prefer public (+ any app schemas). auth/storage are included for reference only.

WITH
params AS (
  SELECT ARRAY['public', 'auth', 'storage', 'extensions']::text[] AS schemas
),

columns AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.table_schema, x.table_name, x.ordinal_position), '[]'::jsonb) AS data
  FROM (
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.ordinal_position,
      c.data_type,
      c.udt_name,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_identity,
      c.identity_generation,
      col_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        c.ordinal_position
      ) AS column_comment
    FROM information_schema.columns c
    CROSS JOIN params p
    WHERE c.table_schema = ANY (p.schemas)
  ) x
),

tables_and_views AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name, x.object_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS object_name,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'f' THEN 'foreign table'
        ELSE c.relkind::text
      END AS object_type,
      pg_get_userbyid(c.relowner) AS owner_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN params p
    WHERE n.nspname = ANY (p.schemas)
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  ) x
),

constraints AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.table_schema, x.table_name, x.constraint_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      tc.table_schema,
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      CASE
        WHEN tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY') THEN (
          SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
          FROM information_schema.key_column_usage kcu
          WHERE kcu.constraint_schema = tc.constraint_schema
            AND kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
            AND kcu.table_name = tc.table_name
        )
        ELSE NULL
      END AS constrained_columns,
      cc.check_clause
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.check_constraints cc
      ON cc.constraint_schema = tc.constraint_schema
     AND cc.constraint_name = tc.constraint_name
    CROSS JOIN params p
    WHERE tc.table_schema = ANY (p.schemas)
  ) x
),

foreign_keys AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.source_schema, x.source_table, x.constraint_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      n.nspname AS constraint_schema,
      con.conname AS constraint_name,
      sn.nspname AS source_schema,
      sc.relname AS source_table,
      (
        SELECT string_agg(a.attname, ', ' ORDER BY u.ord)
        FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a
          ON a.attrelid = con.conrelid
         AND a.attnum = u.attnum
      ) AS source_columns,
      tn.nspname AS target_schema,
      tc.relname AS target_table,
      (
        SELECT string_agg(a.attname, ', ' ORDER BY u.ord)
        FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a
          ON a.attrelid = con.confrelid
         AND a.attnum = u.attnum
      ) AS target_columns,
      CASE con.confupdtype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE con.confupdtype::text
      END AS update_rule,
      CASE con.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE con.confdeltype::text
      END AS delete_rule,
      con.condeferrable AS is_deferrable,
      con.condeferred AS initially_deferred
    FROM pg_constraint con
    JOIN pg_class sc ON sc.oid = con.conrelid
    JOIN pg_namespace sn ON sn.oid = sc.relnamespace
    JOIN pg_class tc ON tc.oid = con.confrelid
    JOIN pg_namespace tn ON tn.oid = tc.relnamespace
    JOIN pg_namespace n ON n.oid = con.connamespace
    CROSS JOIN params p
    WHERE con.contype = 'f'
      AND sn.nspname = ANY (p.schemas)
  ) x
),

indexes AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name, x.table_name, x.index_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      schemaname AS schema_name,
      tablename AS table_name,
      indexname AS index_name,
      indexdef AS index_definition
    FROM pg_indexes
    CROSS JOIN params p
    WHERE schemaname = ANY (p.schemas)
  ) x
),

triggers AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.trigger_schema, x.event_object_table, x.trigger_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      trigger_schema,
      trigger_name,
      event_manipulation,
      event_object_schema,
      event_object_table,
      action_timing,
      action_orientation,
      action_statement,
      action_condition
    FROM information_schema.triggers
    CROSS JOIN params p
    WHERE event_object_schema = ANY (p.schemas)
  ) x
),

rls_status AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name, x.table_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN params p
    WHERE n.nspname = ANY (p.schemas)
      AND c.relkind IN ('r', 'p')
  ) x
),

rls_policies AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.schemaname, x.tablename, x.policyname), '[]'::jsonb) AS data
  FROM (
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    CROSS JOIN params p
    WHERE schemaname = ANY (p.schemas)
  ) x
),

enums AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name, x.enum_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      n.nspname AS schema_name,
      t.typname AS enum_name,
      (
        SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_enum e
        WHERE e.enumtypid = t.oid
      ) AS enum_values
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    CROSS JOIN params p
    WHERE t.typtype = 'e'
      AND n.nspname = ANY (p.schemas)
  ) x
),

functions AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name, x.function_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_function_result(p.oid) AS result_type,
      CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        WHEN 'v' THEN 'VOLATILE'
        ELSE p.provolatile::text
      END AS volatility,
      p.prosecdef AS security_definer,
      pg_get_functiondef(p.oid) AS function_definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN params pms
    WHERE n.nspname = ANY (pms.schemas)
      AND p.prokind IN ('f', 'p') -- functions + procedures
  ) x
),

sequences AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sequence_schema, x.sequence_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      sequence_schema,
      sequence_name,
      data_type,
      numeric_precision,
      start_value,
      minimum_value,
      maximum_value,
      increment,
      cycle_option
    FROM information_schema.sequences
    CROSS JOIN params p
    WHERE sequence_schema = ANY (p.schemas)
  ) x
),

views AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.table_schema, x.table_name), '[]'::jsonb) AS data
  FROM (
    SELECT
      table_schema,
      table_name,
      view_definition
    FROM information_schema.views
    CROSS JOIN params p
    WHERE table_schema = ANY (p.schemas)
  ) x
)

SELECT jsonb_pretty(
  jsonb_build_array(
    jsonb_build_object(
      'schema_introspection_json',
      jsonb_build_object(
        'generated_at', now(),
        'schemas', (SELECT schemas FROM params),
        'columns', (SELECT data FROM columns),
        'tables_and_views', (SELECT data FROM tables_and_views),
        'constraints', (SELECT data FROM constraints),
        'foreign_keys', (SELECT data FROM foreign_keys),
        'indexes', (SELECT data FROM indexes),
        'triggers', (SELECT data FROM triggers),
        'rls_status', (SELECT data FROM rls_status),
        'rls_policies', (SELECT data FROM rls_policies),
        'enums', (SELECT data FROM enums),
        'functions', (SELECT data FROM functions),
        'sequences', (SELECT data FROM sequences),
        'views', (SELECT data FROM views)
      )
    )
  )
) AS schema_introspection_json;
