-- ============================================================================
-- Stocktake rewrite migration
-- Safe for live sites: does NOT modify inventory quantities or product_locations.
-- ============================================================================
-- 1) Drops ONLY the old multi-user stocktake session tables.
-- 2) Creates the new minimal stocktake tables.
-- 3) Leaves stock_periods / opening_stock_entries / closing_stock_entries /
--    inventory / product_locations untouched.
--
-- Run in Supabase SQL editor (or psql) on a maintenance window if desired.
-- Review carefully before applying to production.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- A) Remove OLD stocktake-only objects
-- --------------------------------------------------------------------------

DROP TABLE IF EXISTS public.stocktake_user_entries CASCADE;
DROP TABLE IF EXISTS public.stocktake_user_sessions CASCADE;

-- Legacy RPC used by older stocktake summary UIs (not used by POS inventory).
DROP FUNCTION IF EXISTS public.stocktake_summary(uuid);
DROP FUNCTION IF EXISTS public.stocktake_summary(p_location uuid);

-- Optional: drop unused conductor column if it exists and is not needed.
-- Uncomment only after confirming nothing reads it.
-- ALTER TABLE public.opening_stock_entries DROP COLUMN IF EXISTS stocktake_conductor;

-- --------------------------------------------------------------------------
-- B) Create NEW minimal stocktake schema (2 tables)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'applied', 'cancelled')),
  notes text NULL,
  created_by_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  applied_at timestamptz NULL,
  applied_by_name text NULL,
  cancelled_at timestamptz NULL
);

COMMENT ON TABLE public.stocktakes IS
  'Location stocktake header. Inventory is updated only when status becomes applied.';

-- At most one active (open/submitted) stocktake per location.
CREATE UNIQUE INDEX IF NOT EXISTS stocktakes_one_active_per_location
  ON public.stocktakes (location_id)
  WHERE status IN ('open', 'submitted');

CREATE INDEX IF NOT EXISTS stocktakes_location_created_idx
  ON public.stocktakes (location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stocktake_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id uuid NOT NULL REFERENCES public.stocktakes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty numeric NOT NULL DEFAULT 0 CHECK (qty >= 0),
  counted_by_name text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stocktake_items_unique_product UNIQUE (stocktake_id, product_id)
);

COMMENT ON TABLE public.stocktake_items IS
  'Counted quantities for a stocktake. One row per product; last write wins.';

CREATE INDEX IF NOT EXISTS stocktake_items_stocktake_idx
  ON public.stocktake_items (stocktake_id);

-- --------------------------------------------------------------------------
-- C) RLS (service role bypasses; enable for safety with authenticated clients)
-- --------------------------------------------------------------------------

ALTER TABLE public.stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stocktakes_service_all ON public.stocktakes;
CREATE POLICY stocktakes_service_all
  ON public.stocktakes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS stocktake_items_service_all ON public.stocktake_items;
CREATE POLICY stocktake_items_service_all
  ON public.stocktake_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================================
-- OPTIONAL TEST SEED (run separately after the migration above)
-- Creates a fake location and links a few existing products WITHOUT changing
-- other locations' inventory quantities.
-- ============================================================================
--
-- BEGIN;
--
-- INSERT INTO public.locations (id, name)
-- VALUES ('00000000-0000-4000-8000-0000000000st', 'TEST STOCKTAKE LAB')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- If locations.id is not manually insertable, use:
-- -- INSERT INTO public.locations (name)
-- -- VALUES ('TEST STOCKTAKE LAB')
-- -- RETURNING id;
--
-- -- Link up to 10 existing products to the test location (no inventory write):
-- -- INSERT INTO public.product_locations (product_id, location_id)
-- -- SELECT p.id, l.id
-- -- FROM public.products p
-- -- CROSS JOIN public.locations l
-- -- WHERE l.name = 'TEST STOCKTAKE LAB'
-- -- ORDER BY p.name
-- -- LIMIT 10
-- -- ON CONFLICT DO NOTHING;
--
-- COMMIT;
