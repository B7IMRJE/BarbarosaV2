-- Homeowner first-home onboarding support.
-- This migration creates the missing property_memberships contract already
-- expected by the application: property_id, user_id, and status = 'active'.
-- Profiles and properties RLS are intentionally unchanged; RLS is enabled only
-- on property_memberships so this migration stays scoped to membership access.

CREATE TABLE IF NOT EXISTS public.property_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'OWNER',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_memberships_property_id_user_id_key UNIQUE (property_id, user_id)
);

COMMENT ON TABLE public.property_memberships IS
  'Membership contract expected by app code for connecting profiles to properties, including active homeowner memberships.';

CREATE INDEX IF NOT EXISTS property_memberships_user_id_idx
  ON public.property_memberships (user_id);

CREATE INDEX IF NOT EXISTS property_memberships_property_id_idx
  ON public.property_memberships (property_id);

CREATE INDEX IF NOT EXISTS property_memberships_user_id_status_idx
  ON public.property_memberships (user_id, status);

ALTER TABLE public.property_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_memberships_select_own
  ON public.property_memberships;

CREATE POLICY property_memberships_select_own
  ON public.property_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.property_memberships FROM PUBLIC;
REVOKE ALL ON TABLE public.property_memberships FROM anon;
REVOKE ALL ON TABLE public.property_memberships FROM authenticated;
GRANT SELECT ON TABLE public.property_memberships TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.property_memberships FROM authenticated;
GRANT ALL ON TABLE public.property_memberships TO service_role;

-- The RPC is safer than separate client-side inserts because profile
-- validation, property selection or creation, and membership upsert happen in
-- one database transaction after locking the authenticated user's real
-- public.profiles row with FOR UPDATE.
-- Retry idempotency and concurrent retry protection come from that profile row
-- lock, returning an existing active OWNER membership first, reusing the
-- earliest property owned by auth.uid() before creating anything new, and the
-- unique (property_id, user_id) constraint with ON CONFLICT upsert.
CREATE OR REPLACE FUNCTION public.create_homeowner_first_property(
  p_name text,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_zip text DEFAULT NULL,
  p_property_type text DEFAULT 'HOUSE'
)
RETURNS TABLE (
  property_id uuid,
  membership_id uuid,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_property_id uuid;
  v_membership_id uuid;
  v_name text;
  v_address text;
  v_city text;
  v_state text;
  v_zip text;
  v_property_type text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for authenticated user'
      USING ERRCODE = '23503';
  END IF;

  SELECT pm.property_id, pm.id
  INTO v_property_id, v_membership_id
  FROM public.property_memberships AS pm
  WHERE pm.user_id = v_user_id
    AND pm.role = 'OWNER'
    AND pm.status = 'active'
  ORDER BY pm.created_at ASC, pm.id ASC
  LIMIT 1;

  IF v_membership_id IS NOT NULL THEN
    RETURN QUERY SELECT v_property_id, v_membership_id, FALSE;
    RETURN;
  END IF;

  SELECT p.id
  INTO v_property_id
  FROM public.properties AS p
  WHERE p.owner_id = v_user_id
  ORDER BY p.created_at ASC NULLS LAST, p.id ASC
  LIMIT 1;

  IF v_property_id IS NOT NULL THEN
    INSERT INTO public.property_memberships AS pm (
      property_id,
      user_id,
      role,
      status
    )
    VALUES (
      v_property_id,
      v_user_id,
      'OWNER',
      'active'
    )
    ON CONFLICT (property_id, user_id)
    DO UPDATE SET
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      updated_at = now()
    RETURNING pm.id INTO v_membership_id;

    RETURN QUERY SELECT v_property_id, v_membership_id, FALSE;
    RETURN;
  END IF;

  v_name := NULLIF(BTRIM(p_name), '');

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Property name is required'
      USING ERRCODE = '23502';
  END IF;

  v_address := NULLIF(BTRIM(p_address), '');
  v_city := NULLIF(BTRIM(p_city), '');
  v_state := NULLIF(BTRIM(p_state), '');
  v_zip := NULLIF(BTRIM(p_zip), '');
  v_property_type := COALESCE(NULLIF(BTRIM(p_property_type), ''), 'HOUSE');

  INSERT INTO public.properties AS p (
    owner_id,
    name,
    address,
    city,
    state,
    zip,
    property_type
  )
  VALUES (
    v_user_id,
    v_name,
    v_address,
    v_city,
    v_state,
    v_zip,
    v_property_type
  )
  RETURNING p.id INTO v_property_id;

  INSERT INTO public.property_memberships AS pm (
    property_id,
    user_id,
    role,
    status
  )
  VALUES (
    v_property_id,
    v_user_id,
    'OWNER',
    'active'
  )
  ON CONFLICT (property_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING pm.id INTO v_membership_id;

  RETURN QUERY SELECT v_property_id, v_membership_id, TRUE;
END;
$$;

COMMENT ON FUNCTION public.create_homeowner_first_property(text, text, text, text, text, text) IS
  'Atomically returns or creates the authenticated homeowner first property. Safer than separate client inserts because the property and membership writes occur in one SECURITY DEFINER RPC after locking the authenticated user''s real public.profiles row with FOR UPDATE. Retry idempotency returns an existing active OWNER membership first, reuses an existing property owned by auth.uid() second, and uses the unique (property_id, user_id) constraint with ON CONFLICT on the membership contract. Profiles and properties RLS are intentionally unchanged.';

REVOKE ALL ON FUNCTION public.create_homeowner_first_property(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_homeowner_first_property(text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_homeowner_first_property(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_homeowner_first_property(text, text, text, text, text, text) TO service_role;
