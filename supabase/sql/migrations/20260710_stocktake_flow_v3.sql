-- ============================================================================
-- Stocktake Flow v3
-- Multi-user counting events + period open/close + variance support
-- Does NOT modify existing inventory quantities on migrate.
-- ============================================================================

BEGIN;

-- Old v2 single-cart tables (if present)
DROP TABLE IF EXISTS public.stocktake_items CASCADE;
DROP TABLE IF EXISTS public.stocktakes CASCADE;
DROP TABLE IF EXISTS public.stocktake_user_entries CASCADE;
DROP TABLE IF EXISTS public.stocktake_user_sessions CASCADE;

-- Per-location: initial stocktake completed once forever
CREATE TABLE IF NOT EXISTS public.stocktake_location_state (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  initial_completed boolean NOT NULL DEFAULT false,
  initial_completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Counting event (multiple allowed per location)
CREATE TABLE IF NOT EXISTS public.stocktake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  status text NOT NULL DEFAULT 'counting'
    CHECK (status IN ('counting', 'submitted', 'cancelled')),
  counting_enabled boolean NOT NULL DEFAULT false,
  is_initial boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_by_email text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  submitted_by_email text NULL,
  closed_period_id uuid NULL REFERENCES public.stock_periods(id),
  opened_period_id uuid NULL REFERENCES public.stock_periods(id)
);

CREATE INDEX IF NOT EXISTS stocktake_events_location_idx
  ON public.stocktake_events (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stocktake_events_status_idx
  ON public.stocktake_events (location_id, status);

-- Cumulative count per user per product per event
CREATE TABLE IF NOT EXISTS public.stocktake_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.stocktake_events(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  user_email text NOT NULL,
  qty numeric NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stocktake_counts_unique UNIQUE (event_id, product_id, user_email)
);

CREATE INDEX IF NOT EXISTS stocktake_counts_event_idx
  ON public.stocktake_counts (event_id);

-- Each popup add (audit trail)
CREATE TABLE IF NOT EXISTS public.stocktake_count_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.stocktake_events(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  user_email text NOT NULL,
  qty_added numeric NOT NULL,
  qty_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stocktake_count_log_event_idx
  ON public.stocktake_count_log (event_id, created_at DESC);

-- Set scans (for variance PDF set reconstruction); cart still stores components
-- combos.id is integer (serial), not uuid
DROP TABLE IF EXISTS public.stocktake_set_scans CASCADE;
CREATE TABLE IF NOT EXISTS public.stocktake_set_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.stocktake_events(id) ON DELETE CASCADE,
  combo_id integer NOT NULL REFERENCES public.combos(id),
  user_email text NOT NULL,
  set_qty numeric NOT NULL DEFAULT 0 CHECK (set_qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stocktake_set_scans_unique UNIQUE (event_id, combo_id, user_email)
);

-- Green/red counting gate audit
CREATE TABLE IF NOT EXISTS public.stocktake_gate_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.stocktake_events(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id),
  enabled boolean NOT NULL,
  changed_by_email text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Period date columns for variance reports
ALTER TABLE public.stock_periods
  ADD COLUMN IF NOT EXISTS begin_period_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_period_date timestamptz,
  ADD COLUMN IF NOT EXISTS variance_pdf_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_event_id uuid NULL;

UPDATE public.stock_periods
  SET begin_period_date = COALESCE(begin_period_date, opened_at)
  WHERE begin_period_date IS NULL;

COMMENT ON TABLE public.stocktake_events IS
  'Multi-user stocktake counting event. Inventory/periods update only on submit.';
COMMENT ON TABLE public.stocktake_counts IS
  'Per-user cumulative product counts within an event.';

ALTER TABLE public.stocktake_location_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_count_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_set_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_gate_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY stocktake_location_state_all ON public.stocktake_location_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY stocktake_events_all ON public.stocktake_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY stocktake_counts_all ON public.stocktake_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY stocktake_count_log_all ON public.stocktake_count_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY stocktake_set_scans_all ON public.stocktake_set_scans FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY stocktake_gate_audit_all ON public.stocktake_gate_audit FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
