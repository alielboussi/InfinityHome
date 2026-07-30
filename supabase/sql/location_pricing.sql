-- Per-location standard and promotional prices for products and sets (combos).
-- Run once in Supabase SQL editor (or psql) before deploying the app update.
--
-- After running, every product/set gets a price row for every location, copied
-- from the current global prices on products / combos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_location_prices (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  price numeric(10,2),
  promotional_price numeric(10,2),
  promo_start_date timestamptz,
  promo_end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.combo_location_prices (
  combo_id integer NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  combo_price numeric(10,2),
  promotional_price numeric(10,2),
  promo_start_date timestamptz,
  promo_end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (combo_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_product_location_prices_location
  ON public.product_location_prices (location_id);

CREATE INDEX IF NOT EXISTS idx_combo_location_prices_location
  ON public.combo_location_prices (location_id);

-- Seed: copy current global product prices to every location
INSERT INTO public.product_location_prices (
  product_id,
  location_id,
  price,
  promotional_price,
  promo_start_date,
  promo_end_date
)
SELECT
  p.id,
  l.id,
  p.price,
  p.promotional_price,
  p.promo_start_date,
  p.promo_end_date
FROM public.products p
CROSS JOIN public.locations l
ON CONFLICT (product_id, location_id) DO UPDATE SET
  price = EXCLUDED.price,
  promotional_price = EXCLUDED.promotional_price,
  promo_start_date = EXCLUDED.promo_start_date,
  promo_end_date = EXCLUDED.promo_end_date,
  updated_at = now();

-- Seed: copy current global combo/set prices to every location
INSERT INTO public.combo_location_prices (
  combo_id,
  location_id,
  combo_price,
  promotional_price,
  promo_start_date,
  promo_end_date
)
SELECT
  c.id,
  l.id,
  COALESCE(c.combo_price, c.standard_price),
  c.promotional_price,
  c.promo_start_date,
  c.promo_end_date
FROM public.combos c
CROSS JOIN public.locations l
ON CONFLICT (combo_id, location_id) DO UPDATE SET
  combo_price = EXCLUDED.combo_price,
  promotional_price = EXCLUDED.promotional_price,
  promo_start_date = EXCLUDED.promo_start_date,
  promo_end_date = EXCLUDED.promo_end_date,
  updated_at = now();

COMMIT;
