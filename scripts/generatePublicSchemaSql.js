/**
 * Convert supabase/sql/schema.sql (JSON introspection dump) into runnable DDL
 * for public base tables only.
 *
 * Usage: node scripts/generatePublicSchemaSql.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT = path.join(ROOT, 'supabase', 'sql', 'schema.sql');
const OUT = path.join(ROOT, 'supabase', 'sql', 'create_public_schema.sql');
const BUNDLE = path.join(ROOT, 'supabase', 'sql', 'bootstrap_new_project.sql');

function asList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function mapType(col) {
  const dt = String(col.data_type || '').toLowerCase();
  const udt = String(col.udt_name || '').toLowerCase();

  if (dt === 'uuid' || udt === 'uuid') return 'uuid';
  if (dt === 'boolean' || udt === 'bool') return 'boolean';
  if (dt === 'text' || udt === 'text') return 'text';
  if (dt === 'jsonb' || udt === 'jsonb') return 'jsonb';
  if (dt === 'json' || udt === 'json') return 'json';
  if (dt === 'integer' || udt === 'int4') return 'integer';
  if (dt === 'bigint' || udt === 'int8') return 'bigint';
  if (dt === 'smallint' || udt === 'int2') return 'smallint';
  if (dt === 'real' || udt === 'float4') return 'real';
  if (dt === 'double precision' || udt === 'float8') return 'double precision';
  if (dt === 'numeric' || udt === 'numeric') {
    if (col.numeric_precision != null && col.numeric_scale != null) {
      return `numeric(${col.numeric_precision},${col.numeric_scale})`;
    }
    return 'numeric';
  }
  if (dt.includes('timestamp with time zone') || udt === 'timestamptz') return 'timestamptz';
  if (dt.includes('timestamp without time zone') || udt === 'timestamp') return 'timestamp';
  if (dt === 'date' || udt === 'date') return 'date';
  if (dt === 'time with time zone' || udt === 'timetz') return 'timetz';
  if (dt === 'time without time zone' || udt === 'time') return 'time';
  if (dt === 'character varying' || udt === 'varchar') {
    if (col.character_maximum_length) return `varchar(${col.character_maximum_length})`;
    return 'varchar';
  }
  if (dt === 'character' || udt === 'bpchar') {
    if (col.character_maximum_length) return `char(${col.character_maximum_length})`;
    return 'char';
  }
  if (dt === 'ARRAY' || dt === 'array' || String(udt).startsWith('_')) {
    const base = udt.startsWith('_') ? udt.slice(1) : 'text';
    if (base === 'text') return 'text[]';
    if (base === 'uuid') return 'uuid[]';
    if (base === 'int4') return 'integer[]';
    if (base === 'varchar') return 'varchar[]';
    return `${base}[]`;
  }
  if (dt === 'user-defined') {
    if (udt === 'transfer_status') return 'public.transfer_status';
    return udt ? `public.${udt}` : 'text';
  }
  return udt || dt || 'text';
}

function normalizeDefault(raw) {
  if (raw == null || raw === '') return null;
  let d = String(raw);
  if (/nextval\s*\(/i.test(d)) return null; // handled as identity
  d = d.replace(/\buuid_generate_v4\s*\(\s*\)/gi, 'gen_random_uuid()');
  return d;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function isViewName(name) {
  return name.startsWith('v_') || name === 'ledger_balances';
}

function primaryKeyCols(constraints, table) {
  const pk = constraints.find(
    (c) =>
      c.table_schema === 'public' &&
      c.table_name === table &&
      String(c.constraint_type).toUpperCase() === 'PRIMARY KEY',
  );
  return pk ? asList(pk.constrained_columns) : [];
}

function buildCreateSql(intro) {
  const columns = intro.columns || [];
  const constraints = intro.constraints || [];
  const foreignKeys = intro.foreign_keys || [];
  const indexes = intro.indexes || [];

  const publicColumns = columns.filter((c) => c.table_schema === 'public');
  const tableNames = [...new Set(publicColumns.map((c) => c.table_name))].sort();
  const baseTables = tableNames.filter((name) => !isViewName(name));

  const lines = [];
  lines.push('-- AUTO-GENERATED from supabase/sql/schema.sql (JSON introspection)');
  lines.push('-- Public base tables + constraints + indexes.');
  lines.push('-- Apply in Supabase SQL Editor on a NEW empty project.');
  lines.push('');
  lines.push('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
  lines.push('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  lines.push('');
  lines.push("-- Custom enums used by public tables");
  lines.push(`DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM ('draft', 'approved', 'dispatched', 'received', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`);
  lines.push('');

  for (const table of baseTables) {
    const cols = publicColumns
      .filter((c) => c.table_name === table)
      .sort((a, b) => (a.ordinal_position || 0) - (b.ordinal_position || 0));
    const pkCols = primaryKeyCols(constraints, table);

    lines.push(`CREATE TABLE IF NOT EXISTS public.${quoteIdent(table)} (`);
    const colDefs = cols.map((col) => {
      const parts = [`  ${quoteIdent(col.column_name)} ${mapType(col)}`];
      const rawDefault = String(col.column_default || '');
      const isSerialDefault = /nextval\s*\(/i.test(rawDefault);
      const isIdentity = String(col.is_identity).toUpperCase() === 'YES';
      const isIntPk =
        pkCols.length === 1 &&
        pkCols[0] === col.column_name &&
        (mapType(col) === 'integer' || mapType(col) === 'bigint');

      if (isIdentity || isSerialDefault || (isIntPk && !rawDefault)) {
        const gen = String(col.identity_generation || 'BY DEFAULT').toUpperCase();
        parts.push(`GENERATED ${gen === 'ALWAYS' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`);
      } else {
        const def = normalizeDefault(col.column_default);
        if (def) parts.push(`DEFAULT ${def}`);
      }

      if (String(col.is_nullable).toUpperCase() === 'NO') parts.push('NOT NULL');
      return parts.join(' ');
    });
    lines.push(colDefs.join(',\n'));
    lines.push(');');
    lines.push('');
  }

  for (const c of constraints) {
    if (c.table_schema !== 'public') continue;
    if (!baseTables.includes(c.table_name)) continue;
    const type = String(c.constraint_type || '').toUpperCase();
    const name = String(c.constraint_name || '');
    // Skip system NOT NULL pseudo-checks
    if (type === 'CHECK' && /_not_null$/.test(name)) continue;

    const cols = asList(c.constrained_columns);
    const table = c.table_name;
    const colList = cols.map(quoteIdent).join(', ');

    if (type === 'PRIMARY KEY' && cols.length) {
      lines.push(
        `DO $$ BEGIN ALTER TABLE public.${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(name)} PRIMARY KEY (${colList}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    } else if (type === 'UNIQUE' && cols.length) {
      lines.push(
        `DO $$ BEGIN ALTER TABLE public.${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(name)} UNIQUE (${colList}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    } else if (type === 'CHECK' && c.check_clause) {
      lines.push(
        `DO $$ BEGIN ALTER TABLE public.${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(name)} CHECK (${c.check_clause}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    }
  }
  lines.push('');

  for (const fk of foreignKeys) {
    const srcSchema = fk.source_schema || 'public';
    const srcTable = fk.source_table;
    const srcCols = asList(fk.source_columns);
    const tgtSchema = fk.target_schema || 'public';
    const tgtTable = fk.target_table;
    const tgtCols = asList(fk.target_columns);
    const name = fk.constraint_name;

    if (srcSchema !== 'public' || !baseTables.includes(srcTable)) continue;
    if (tgtSchema !== 'public') {
      lines.push(`-- Skipped FK ${name}: ${srcTable} -> ${tgtSchema}.${tgtTable}`);
      continue;
    }
    if (!baseTables.includes(tgtTable) || !srcCols.length || !tgtCols.length) continue;

    const onUpdate = fk.update_rule ? ` ON UPDATE ${fk.update_rule}` : '';
    const onDelete = fk.delete_rule ? ` ON DELETE ${fk.delete_rule}` : '';
    lines.push(
      `DO $$ BEGIN ALTER TABLE public.${quoteIdent(srcTable)} ADD CONSTRAINT ${quoteIdent(name)} FOREIGN KEY (${srcCols.map(quoteIdent).join(', ')}) REFERENCES public.${quoteIdent(tgtTable)} (${tgtCols.map(quoteIdent).join(', ')})${onUpdate}${onDelete}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
  }
  lines.push('');

  for (const idx of indexes) {
    const schema = idx.schema_name || idx.table_schema || 'public';
    const table = idx.table_name;
    if (schema !== 'public' || !baseTables.includes(table)) continue;
    let def = String(idx.index_definition || '').trim().replace(/;+\s*$/, '');
    if (!def) continue;
    if (/_pkey\b/i.test(def)) continue;
    if (/^CREATE UNIQUE INDEX /i.test(def)) {
      def = def.replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ');
    } else if (/^CREATE INDEX /i.test(def)) {
      def = def.replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS ');
    }
    lines.push(`${def};`);
  }

  lines.push('');
  return { sql: `${lines.join('\n')}\n`, baseTables };
}

function readMigration(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function main() {
  const parsed = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const intro = parsed[0]?.schema_introspection_json;
  if (!intro) throw new Error('Unexpected schema dump format');

  const { sql, baseTables } = buildCreateSql(intro);
  fs.writeFileSync(OUT, sql);

  const migrations = [
    'supabase/sql/migrations/20260710_stocktake_flow_v3.sql',
    'supabase/sql/migrations/20260711_warehouse_deliveries_workflow.sql',
    'supabase/sql/migrations/20260711_warehouse_delivery_created_by_name.sql',
  ];

  const bundleParts = [
    '-- Infinity Home — bootstrap schema for a NEW Supabase project',
    '-- 1) Paste/run this entire file in SQL Editor',
    '-- 2) Then import backup JSON with: node scripts/importDbBackup.js',
    '',
    sql,
    '',
  ];

  for (const rel of migrations) {
    bundleParts.push(`\n-- ========== ${rel} ==========\n`);
    bundleParts.push(readMigration(rel));
    bundleParts.push('\n');
  }

  fs.writeFileSync(BUNDLE, bundleParts.join('\n'));
  console.log(`Wrote ${OUT}`);
  console.log(`Wrote ${BUNDLE}`);
  console.log(`Tables: ${baseTables.length}`);
}

main();
