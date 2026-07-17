-- Reporting views for Infinity Home (new Supabase project)
-- Run this in Supabase SQL Editor after bootstrap_new_project.sql + data import.
-- These were not included in the table-only bootstrap.

BEGIN;

CREATE OR REPLACE VIEW public.v_sales_pdf_totals AS
WITH item_totals AS (
  SELECT
    si.sale_id,
    SUM(COALESCE(si.unit_price, 0) * COALESCE(si.quantity, 0))::numeric AS subtotal_before_discount
  FROM public.sales_items si
  GROUP BY si.sale_id
),
payment_totals AS (
  SELECT
    sp.sale_id,
    SUM(COALESCE(sp.amount, 0))::numeric AS paid_amount
  FROM public.sales_payments sp
  WHERE lower(COALESCE(sp.payment_type, '')) <> 'credit'
  GROUP BY sp.sale_id
)
SELECT
  s.id AS sale_id,
  s.currency,
  COALESCE(it.subtotal_before_discount, s.total_amount, 0)::numeric AS subtotal_before_discount,
  COALESCE(s.discount, 0)::numeric AS discount_amount,
  GREATEST(
    0,
    COALESCE(it.subtotal_before_discount, s.total_amount, 0)
    - LEAST(COALESCE(s.discount, 0), COALESCE(it.subtotal_before_discount, s.total_amount, 0))
  )::numeric AS total_due,
  COALESCE(pt.paid_amount, 0)::numeric AS paid_amount,
  GREATEST(
    0,
    GREATEST(
      0,
      COALESCE(it.subtotal_before_discount, s.total_amount, 0)
      - LEAST(COALESCE(s.discount, 0), COALESCE(it.subtotal_before_discount, s.total_amount, 0))
    ) - COALESCE(pt.paid_amount, 0)
  )::numeric AS outstanding_amount
FROM public.sales s
LEFT JOIN item_totals it ON it.sale_id = s.id
LEFT JOIN payment_totals pt ON pt.sale_id = s.id;

CREATE OR REPLACE VIEW public.v_sales_financials AS
SELECT
  s.id AS sale_id,
  s.customer_id,
  s.location_id,
  s.sale_date,
  s.status,
  s.currency,
  f.subtotal_before_discount,
  f.discount_amount,
  f.total_due AS net_after_discount,
  f.total_due,
  f.paid_amount,
  f.outstanding_amount,
  NULL::numeric AS vat_amount,
  (
    SELECT MAX(sp.payment_date)
    FROM public.sales_payments sp
    WHERE sp.sale_id = s.id
  ) AS last_payment_at
FROM public.sales s
LEFT JOIN public.v_sales_pdf_totals f ON f.sale_id = s.id;

CREATE OR REPLACE VIEW public.v_sales_financials_canonical AS
SELECT
  s.id AS sale_id,
  s.customer_id,
  s.layby_id,
  s.sale_date,
  s.status,
  s.currency,
  f.total_due,
  f.paid_amount,
  f.outstanding_amount
FROM public.sales s
LEFT JOIN public.v_sales_pdf_totals f ON f.sale_id = s.id;

CREATE OR REPLACE VIEW public.v_sales_totals_canonical AS
SELECT
  s.id AS sale_id,
  s.customer_id,
  s.layby_id,
  s.sale_date,
  s.status,
  s.currency,
  f.total_due
FROM public.sales s
LEFT JOIN public.v_sales_pdf_totals f ON f.sale_id = s.id;

CREATE OR REPLACE VIEW public.v_payments_non_credit AS
SELECT
  sp.id,
  sp.sale_id,
  sp.amount,
  sp.payment_type,
  sp.payment_date,
  sp.reference,
  sp.notes,
  sp.currency
FROM public.sales_payments sp
WHERE lower(COALESCE(sp.payment_type, '')) <> 'credit';

CREATE OR REPLACE VIEW public.v_factory_sold_storage_summary AS
SELECT
  f.product_id,
  f.location_id,
  SUM(COALESCE(f.quantity, 0))::numeric AS total_qty_stored,
  SUM(COALESCE(f.quantity_released, 0))::numeric AS total_qty_released,
  SUM(GREATEST(COALESCE(f.quantity, 0) - COALESCE(f.quantity_released, 0), 0))::numeric AS qty_on_hold,
  COUNT(*) FILTER (WHERE f.status IN ('stored', 'partial'))::bigint AS holding_rows,
  MIN(f.stored_at) AS first_stored_at,
  MAX(f.updated_at) AS last_activity_at
FROM public.factory_sold_storage_items f
GROUP BY f.product_id, f.location_id;

CREATE OR REPLACE VIEW public.v_factory_sold_storage_active AS
SELECT
  f.*
FROM public.factory_sold_storage_items f
WHERE f.status IN ('stored', 'partial')
  AND GREATEST(COALESCE(f.quantity, 0) - COALESCE(f.quantity_released, 0), 0) > 0;

CREATE OR REPLACE VIEW public.v_location_transfer_totals AS
SELECT
  loc.location_id,
  COALESCE(SUM(loc.transfer_in_qty), 0)::numeric AS transfer_in_qty,
  COALESCE(SUM(loc.transfer_out_qty), 0)::numeric AS transfer_out_qty
FROM (
  SELECT
    sts.to_location AS location_id,
    COALESCE(SUM(ste.quantity), 0)::numeric AS transfer_in_qty,
    0::numeric AS transfer_out_qty
  FROM public.stock_transfer_entries ste
  JOIN public.stock_transfer_sessions sts ON sts.id = ste.session_id
  GROUP BY sts.to_location
  UNION ALL
  SELECT
    sts.from_location AS location_id,
    0::numeric AS transfer_in_qty,
    COALESCE(SUM(ste.quantity), 0)::numeric AS transfer_out_qty
  FROM public.stock_transfer_entries ste
  JOIN public.stock_transfer_sessions sts ON sts.id = ste.session_id
  GROUP BY sts.from_location
) loc
GROUP BY loc.location_id;

CREATE OR REPLACE VIEW public.v_negative_inventory AS
SELECT
  i.product_id,
  p.name AS product_name,
  p.sku,
  i.location,
  l.name AS location_name,
  i.quantity,
  now() AS snapshot_at,
  CASE
    WHEN i.quantity < 0 THEN 'negative'
    ELSE 'zero'
  END AS severity
FROM public.inventory i
LEFT JOIN public.products p ON p.id = i.product_id
LEFT JOIN public.locations l ON l.id = i.location
WHERE COALESCE(i.quantity, 0) <= 0;

CREATE OR REPLACE VIEW public.v_transfer_sessions_totals AS
SELECT
  sts.id AS session_id,
  sts.from_location,
  sts.to_location,
  COALESCE(SUM(ste.quantity), 0)::numeric AS total_qty
FROM public.stock_transfer_sessions sts
LEFT JOIN public.stock_transfer_entries ste ON ste.session_id = sts.id
GROUP BY sts.id, sts.from_location, sts.to_location;

CREATE OR REPLACE VIEW public.ledger_balances AS
SELECT
  le.currency,
  SUM(
    CASE
      WHEN le.direction = 'credit' THEN le.amount
      ELSE -le.amount
    END
  )::numeric AS balance,
  COUNT(*)::bigint AS entry_count,
  MAX(le.created_at) AS last_entry_at
FROM public.ledger_entries le
GROUP BY le.currency;

CREATE OR REPLACE VIEW public.v_customer_layby_outstanding AS
SELECT
  l.id AS layby_id,
  l.customer_id,
  l.status AS layby_status,
  l.notes AS layby_notes,
  COALESCE(f.total_due, l.total_amount, 0)::numeric AS layby_total_due,
  COALESCE(f.paid_amount, l.paid_amount, 0)::numeric AS layby_paid_amount,
  COALESCE(f.outstanding_amount, GREATEST(0, COALESCE(l.total_amount, 0) - COALESCE(l.paid_amount, 0)), 0)::numeric AS layby_outstanding,
  (
    SELECT MIN(s.sale_date)
    FROM public.sales s
    WHERE s.layby_id = l.id OR s.id = l.sale_id
  ) AS first_sale_date,
  (
    SELECT MAX(s.sale_date)
    FROM public.sales s
    WHERE s.layby_id = l.id OR s.id = l.sale_id
  ) AS last_sale_date,
  (
    SELECT MAX(sp.payment_date)
    FROM public.sales_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
    WHERE s.layby_id = l.id OR s.id = l.sale_id
  ) AS last_payment_at
FROM public.laybys l
LEFT JOIN public.v_sales_pdf_totals f ON f.sale_id = l.sale_id;

COMMIT;
