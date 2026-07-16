-- Warehouse Deliveries workflow overhaul
-- Apply manually in Supabase SQL editor (or via migration runner).
-- Extends warehouse_delivery_sessions / warehouse_delivery_entries with
-- delivery numbers, idempotency, audit fields, atomic submit/accept RPCs, and RLS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Session columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_delivery_sessions
  ADD COLUMN IF NOT EXISTS delivery_number text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS last_edited_by uuid,
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

-- Backfill delivery_number for existing rows (stable, sortable)
UPDATE public.warehouse_delivery_sessions
SET delivery_number = 'WD-' || to_char(created_at AT TIME ZONE 'Africa/Lusaka', 'YYYYMMDD')
  || '-' || upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE delivery_number IS NULL;

-- Backfill submitted_at from transfer_datetime / created_at
UPDATE public.warehouse_delivery_sessions
SET submitted_at = COALESCE(submitted_at, transfer_datetime, created_at)
WHERE status IN ('pending', 'submitted', 'accepted', 'completed');

-- Normalize legacy accepted → completed (inventory already moved)
UPDATE public.warehouse_delivery_sessions
SET
  status = 'completed',
  accepted_at = COALESCE(accepted_at, applied_at),
  accepted_by = COALESCE(accepted_by, applied_by),
  completed_at = COALESCE(completed_at, applied_at)
WHERE lower(status) = 'accepted';

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_delivery_sessions_idempotency_key_uidx
  ON public.warehouse_delivery_sessions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_delivery_sessions_delivery_number_uidx
  ON public.warehouse_delivery_sessions (delivery_number)
  WHERE delivery_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_delivery_sessions_to_status
  ON public.warehouse_delivery_sessions (to_location, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_delivery_sessions_delivery_number
  ON public.warehouse_delivery_sessions (delivery_number DESC);

-- ---------------------------------------------------------------------------
-- 2) Entry columns (original vs working quantity)
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_delivery_entries
  ADD COLUMN IF NOT EXISTS original_quantity numeric,
  ADD COLUMN IF NOT EXISTS edited_quantity numeric,
  ADD COLUMN IF NOT EXISTS dest_stock_before numeric,
  ADD COLUMN IF NOT EXISTS expected_dest_stock numeric,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.warehouse_delivery_entries
SET
  original_quantity = COALESCE(original_quantity, quantity),
  edited_quantity = COALESCE(edited_quantity, quantity)
WHERE original_quantity IS NULL OR edited_quantity IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Audit / event log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.warehouse_delivery_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id text,
  actor_email text,
  detail jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_delivery_events_session
  ON public.warehouse_delivery_events (session_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Delivery number helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_warehouse_delivery_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  day_key text := to_char((now() AT TIME ZONE 'Africa/Lusaka'), 'YYYYMMDD');
  seq int;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(delivery_number, '^WD-' || day_key || '-', ''), '')::int
  ), 0) + 1
  INTO seq
  FROM public.warehouse_delivery_sessions
  WHERE delivery_number ~ ('^WD-' || day_key || '-[0-9]+$');

  RETURN 'WD-' || day_key || '-' || lpad(seq::text, 4, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Atomic submit (header + items, idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_warehouse_delivery(
  p_idempotency_key text,
  p_from_location uuid,
  p_to_location uuid,
  p_created_by_id int,
  p_created_by_email text,
  p_items jsonb,
  p_captured_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.warehouse_delivery_sessions%ROWTYPE;
  v_session public.warehouse_delivery_sessions%ROWTYPE;
  v_item jsonb;
  v_total numeric := 0;
  v_qty numeric;
  v_kind text;
  v_from constant uuid := '39ffaa82-8aee-4a33-8de8-06584cbaffcf'::uuid;
  v_to constant uuid := '454a092c-5b12-441e-b99d-216f6fa72198'::uuid;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'idempotency_key required';
  END IF;
  IF p_from_location IS DISTINCT FROM v_from OR p_to_location IS DISTINCT FROM v_to THEN
    RAISE EXCEPTION 'Transfer locations are locked to Factory → Kitwe';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one delivery item is required';
  END IF;

  SELECT * INTO v_existing
  FROM public.warehouse_delivery_sessions
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'session', to_jsonb(v_existing)
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_kind := coalesce(v_item->>'kind', 'product');
    IF v_kind = 'set-parent' THEN
      CONTINUE;
    END IF;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', coalesce(v_item->>'name', v_item->>'sku', '?');
    END IF;
    v_total := v_total + v_qty;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Delivery total quantity must be > 0';
  END IF;

  INSERT INTO public.warehouse_delivery_sessions (
    from_location,
    to_location,
    created_at,
    transfer_datetime,
    submitted_at,
    status,
    total_qty,
    created_by_id,
    created_by_email,
    delivery_number,
    idempotency_key,
    sync_status,
    metadata
  ) VALUES (
    v_from,
    v_to,
    coalesce(p_captured_at, now()),
    coalesce(p_captured_at, now()),
    coalesce(p_captured_at, now()),
    'pending',
    v_total,
    p_created_by_id,
    p_created_by_email,
    public.next_warehouse_delivery_number(),
    p_idempotency_key,
    'synced',
    jsonb_build_object(
      'created_by_id', p_created_by_id,
      'created_by_email', p_created_by_email,
      'source', 'warehouse_transfers_app'
    )
  )
  RETURNING * INTO v_session;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 AND coalesce(v_item->>'kind', 'product') <> 'set-parent' THEN
      CONTINUE;
    END IF;
    INSERT INTO public.warehouse_delivery_entries (
      session_id,
      product_id,
      combo_id,
      kind,
      name,
      sku,
      quantity,
      original_quantity,
      edited_quantity,
      per_set_qty,
      max_qty
    ) VALUES (
      v_session.id,
      NULLIF(v_item->>'product_id', '')::uuid,
      NULLIF(v_item->>'combo_id', '')::int,
      coalesce(v_item->>'kind', 'product'),
      coalesce(v_item->>'name', ''),
      NULLIF(v_item->>'sku', ''),
      v_qty,
      v_qty,
      v_qty,
      NULLIF(v_item->>'per_set_qty', '')::numeric,
      NULLIF(v_item->>'max_qty', '')::numeric
    );
  END LOOP;

  INSERT INTO public.warehouse_delivery_events (session_id, event_type, actor_id, actor_email, detail)
  VALUES (
    v_session.id,
    'submitted',
    coalesce(p_created_by_id::text, ''),
    p_created_by_email,
    jsonb_build_object('total_qty', v_total, 'idempotency_key', p_idempotency_key)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'session', to_jsonb(v_session)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.warehouse_delivery_sessions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'session', to_jsonb(v_existing)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_warehouse_delivery(text, uuid, uuid, int, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_warehouse_delivery(text, uuid, uuid, int, text, jsonb, timestamptz) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Atomic accept + inventory move
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_warehouse_delivery(
  p_session_id uuid,
  p_accepted_by uuid,
  p_accepted_by_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.warehouse_delivery_sessions%ROWTYPE;
  v_from constant uuid := '39ffaa82-8aee-4a33-8de8-06584cbaffcf'::uuid;
  v_to constant uuid := '454a092c-5b12-441e-b99d-216f6fa72198'::uuid;
  v_hassan constant uuid := '6b992ac8-8e39-4f31-a323-2271a974da8c'::uuid;
  r record;
  v_qty numeric;
  v_src numeric;
  v_dst numeric;
  v_src_id uuid;
  v_dst_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session id required';
  END IF;
  IF p_accepted_by IS DISTINCT FROM v_hassan THEN
    RAISE EXCEPTION 'Only the authorised receiver can accept warehouse deliveries';
  END IF;

  SELECT * INTO v_session
  FROM public.warehouse_delivery_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF v_session.from_location IS DISTINCT FROM v_from
     OR v_session.to_location IS DISTINCT FROM v_to THEN
    RAISE EXCEPTION 'Delivery locations do not match Factory → Kitwe';
  END IF;

  IF lower(v_session.status) IN ('completed', 'accepted') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_completed', true,
      'session', to_jsonb(v_session)
    );
  END IF;

  IF lower(v_session.status) NOT IN ('pending', 'submitted') THEN
    RAISE EXCEPTION 'Delivery status % cannot be accepted', v_session.status;
  END IF;

  FOR r IN
    SELECT *
    FROM public.warehouse_delivery_entries
    WHERE session_id = p_session_id
      AND coalesce(kind, 'product') <> 'set-parent'
      AND coalesce(edited_quantity, quantity, 0) > 0
      AND product_id IS NOT NULL
  LOOP
    v_qty := coalesce(r.edited_quantity, r.quantity, 0);

    SELECT id, quantity INTO v_src_id, v_src
    FROM public.inventory
    WHERE product_id = r.product_id AND location = v_from
    FOR UPDATE;
    v_src := coalesce(v_src, 0);
    IF v_src < v_qty THEN
      RAISE EXCEPTION 'Insufficient Factory stock for % (have %, need %)',
        coalesce(r.name, r.sku, r.product_id::text), v_src, v_qty;
    END IF;

    SELECT id, quantity INTO v_dst_id, v_dst
    FROM public.inventory
    WHERE product_id = r.product_id AND location = v_to
    FOR UPDATE;
    v_dst := coalesce(v_dst, 0);

    UPDATE public.warehouse_delivery_entries
    SET
      quantity = v_qty,
      edited_quantity = v_qty,
      original_quantity = coalesce(original_quantity, quantity, v_qty),
      dest_stock_before = v_dst,
      expected_dest_stock = v_dst + v_qty,
      updated_at = v_now
    WHERE id = r.id;

    IF v_src_id IS NULL THEN
      RAISE EXCEPTION 'Missing Factory inventory row for %', coalesce(r.name, r.product_id::text);
    END IF;
    UPDATE public.inventory
    SET quantity = v_src - v_qty, updated_at = v_now
    WHERE id = v_src_id;

    IF v_dst_id IS NULL THEN
      INSERT INTO public.inventory (product_id, location, quantity, updated_at)
      VALUES (r.product_id, v_to, v_qty, v_now);
    ELSE
      UPDATE public.inventory
      SET quantity = v_dst + v_qty, updated_at = v_now
      WHERE id = v_dst_id;
    END IF;
  END LOOP;

  UPDATE public.warehouse_delivery_sessions
  SET
    status = 'completed',
    applied_by = p_accepted_by,
    applied_at = v_now,
    accepted_by = p_accepted_by,
    accepted_at = v_now,
    completed_at = v_now,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'accepted_by', p_accepted_by,
      'accepted_at', v_now,
      'accepted_by_email', p_accepted_by_email
    )
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  INSERT INTO public.warehouse_delivery_events (session_id, event_type, actor_id, actor_email, detail)
  VALUES (
    p_session_id,
    'completed',
    p_accepted_by::text,
    p_accepted_by_email,
    jsonb_build_object('status', 'completed')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'session', to_jsonb(v_session)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_warehouse_delivery(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_warehouse_delivery(uuid, uuid, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Admin edit pending delivery quantities (no inventory move)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_warehouse_delivery_items(
  p_session_id uuid,
  p_items jsonb,
  p_edited_by uuid,
  p_edited_by_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.warehouse_delivery_sessions%ROWTYPE;
  v_item jsonb;
  v_entry_id uuid;
  v_qty numeric;
  v_total numeric := 0;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_session
  FROM public.warehouse_delivery_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF lower(v_session.status) IN ('completed', 'accepted') THEN
    RAISE EXCEPTION 'Completed deliveries cannot be edited here';
  END IF;
  IF lower(v_session.status) NOT IN ('pending', 'submitted') THEN
    RAISE EXCEPTION 'Delivery status % cannot be edited', v_session.status;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    v_entry_id := NULLIF(v_item->>'id', '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    IF v_entry_id IS NULL THEN
      CONTINUE;
    END IF;
    IF v_qty < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative';
    END IF;

    UPDATE public.warehouse_delivery_entries
    SET
      quantity = v_qty,
      edited_quantity = v_qty,
      original_quantity = coalesce(original_quantity, quantity),
      updated_at = v_now
    WHERE id = v_entry_id
      AND session_id = p_session_id;
  END LOOP;

  SELECT coalesce(sum(coalesce(edited_quantity, quantity, 0)), 0)
  INTO v_total
  FROM public.warehouse_delivery_entries
  WHERE session_id = p_session_id
    AND coalesce(kind, 'product') <> 'set-parent';

  UPDATE public.warehouse_delivery_sessions
  SET
    total_qty = v_total,
    last_edited_by = p_edited_by,
    last_edited_at = v_now,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_edited_by', p_edited_by,
      'last_edited_at', v_now,
      'last_edited_by_email', p_edited_by_email
    )
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  INSERT INTO public.warehouse_delivery_events (session_id, event_type, actor_id, actor_email, detail)
  VALUES (
    p_session_id,
    'edited',
    coalesce(p_edited_by::text, ''),
    p_edited_by_email,
    jsonb_build_object('total_qty', v_total, 'items', p_items)
  );

  RETURN jsonb_build_object('ok', true, 'session', to_jsonb(v_session));
END;
$$;

REVOKE ALL ON FUNCTION public.update_warehouse_delivery_items(uuid, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_warehouse_delivery_items(uuid, jsonb, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) RLS — permissive enough for existing anon-key Android + authenticated web
--    Inventory remains protected; accept/submit run as SECURITY DEFINER.
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_delivery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_delivery_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wd_sessions_select ON public.warehouse_delivery_sessions;
DROP POLICY IF EXISTS wd_sessions_insert ON public.warehouse_delivery_sessions;
DROP POLICY IF EXISTS wd_sessions_update ON public.warehouse_delivery_sessions;
DROP POLICY IF EXISTS wd_entries_select ON public.warehouse_delivery_entries;
DROP POLICY IF EXISTS wd_entries_insert ON public.warehouse_delivery_entries;
DROP POLICY IF EXISTS wd_entries_update ON public.warehouse_delivery_entries;
DROP POLICY IF EXISTS wd_entries_delete ON public.warehouse_delivery_entries;
DROP POLICY IF EXISTS wd_events_select ON public.warehouse_delivery_events;
DROP POLICY IF EXISTS wd_events_insert ON public.warehouse_delivery_events;

CREATE POLICY wd_sessions_select ON public.warehouse_delivery_sessions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY wd_sessions_insert ON public.warehouse_delivery_sessions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY wd_sessions_update ON public.warehouse_delivery_sessions
  FOR UPDATE TO anon, authenticated
  USING (lower(status) IN ('pending', 'submitted'))
  WITH CHECK (true);

CREATE POLICY wd_entries_select ON public.warehouse_delivery_entries
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY wd_entries_insert ON public.warehouse_delivery_entries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY wd_entries_update ON public.warehouse_delivery_entries
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY wd_entries_delete ON public.warehouse_delivery_entries
  FOR DELETE TO authenticated USING (true);

CREATE POLICY wd_events_select ON public.warehouse_delivery_events
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY wd_events_insert ON public.warehouse_delivery_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

COMMIT;
