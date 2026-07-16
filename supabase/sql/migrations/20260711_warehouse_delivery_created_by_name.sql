-- Additive: store sender display name on warehouse deliveries.
-- Safe to run after 20260711_warehouse_deliveries_workflow.sql

BEGIN;

ALTER TABLE public.warehouse_delivery_sessions
  ADD COLUMN IF NOT EXISTS created_by_name text;

-- Prefer users.full_name as the WhatsApp / UI "Sent By" name.
UPDATE public.warehouse_delivery_sessions s
SET created_by_name = u.full_name
FROM public.users u
WHERE s.created_by_id = u.id
  AND (s.created_by_name IS NULL OR btrim(s.created_by_name) = '')
  AND u.full_name IS NOT NULL
  AND btrim(u.full_name) <> '';

-- Replace submit RPC so it accepts and resolves created_by_name.
DROP FUNCTION IF EXISTS public.submit_warehouse_delivery(text, uuid, uuid, int, text, jsonb, timestamptz);

CREATE OR REPLACE FUNCTION public.submit_warehouse_delivery(
  p_idempotency_key text,
  p_from_location uuid,
  p_to_location uuid,
  p_created_by_id int,
  p_created_by_email text,
  p_items jsonb,
  p_captured_at timestamptz DEFAULT now(),
  p_created_by_name text DEFAULT NULL
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
  v_name text;
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

  -- Resolve display name: explicit arg → users.full_name → email
  v_name := nullif(btrim(coalesce(p_created_by_name, '')), '');
  IF v_name IS NULL AND p_created_by_id IS NOT NULL THEN
    SELECT nullif(btrim(full_name), '') INTO v_name
    FROM public.users
    WHERE id = p_created_by_id;
  END IF;
  IF v_name IS NULL THEN
    v_name := nullif(btrim(coalesce(p_created_by_email, '')), '');
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
    created_by_name,
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
    v_name,
    public.next_warehouse_delivery_number(),
    p_idempotency_key,
    'synced',
    jsonb_build_object(
      'created_by_id', p_created_by_id,
      'created_by_email', p_created_by_email,
      'created_by_name', v_name,
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
    jsonb_build_object(
      'total_qty', v_total,
      'idempotency_key', p_idempotency_key,
      'created_by_name', v_name
    )
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

REVOKE ALL ON FUNCTION public.submit_warehouse_delivery(text, uuid, uuid, int, text, jsonb, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_warehouse_delivery(text, uuid, uuid, int, text, jsonb, timestamptz, text) TO anon, authenticated, service_role;

COMMIT;
