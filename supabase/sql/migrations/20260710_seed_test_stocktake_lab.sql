-- ============================================================================
-- Seed: TEST STOCKTAKE LAB (location only)
-- Safe: does not create products, sets, or change inventory elsewhere.
-- ============================================================================

BEGIN;

INSERT INTO public.locations (name, city, address)
SELECT 'TEST STOCKTAKE LAB', 'Test', 'Stocktake sandbox — add your own products'
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations WHERE name = 'TEST STOCKTAKE LAB'
);

-- Reset lab so the next stocktake submit is treated as INITIAL
INSERT INTO public.stocktake_location_state (location_id, initial_completed, initial_completed_at, updated_at)
SELECT l.id, false, NULL, now()
FROM public.locations l
WHERE l.name = 'TEST STOCKTAKE LAB'
ON CONFLICT (location_id) DO UPDATE
SET initial_completed = false,
    initial_completed_at = NULL,
    updated_at = now();

COMMIT;

SELECT id, name, city, address
FROM public.locations
WHERE name = 'TEST STOCKTAKE LAB';
