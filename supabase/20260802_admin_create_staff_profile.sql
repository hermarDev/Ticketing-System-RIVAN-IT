-- Admin-only staff/admin/CEO account creation
-- Idempotent: safe to re-run.
--
-- Fix (code review): createStaffAccount's client-side `profiles` upsert could
-- never work against the canonical RLS schema — INSERT allows only the caller's
-- own row with role='client' and UPDATE allows only the caller's own row — so
-- signUp-created auth users ended up as orphaned 'client' profiles (or, under
-- permissive live policies, callers could write arbitrary roles).
--
-- This SECURITY DEFINER function is the only path that may set a staff/admin/ceo
-- role on a profile row. It:
--   1. validates that the CALLER (auth.uid()) is admin or ceo, and
--   2. validates that the target role is in the allowlist,
-- then upserts the profile row for the signUp-created auth user (which the
-- on_auth_user_created trigger seeds with role='client').

CREATE OR REPLACE FUNCTION public.admin_create_staff_profile(
  p_user_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'staff'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  -- Caller must be an admin or CEO. SECURITY DEFINER reads profiles directly
  -- (bypassing RLS); auth.uid() is the caller's id.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'ceo')
  ) THEN
    RAISE EXCEPTION 'Only admins or the CEO can create staff accounts';
  END IF;

  -- Role allowlist — never trust caller-supplied roles.
  IF p_role IS NULL OR p_role NOT IN ('staff', 'admin', 'ceo') THEN
    RAISE EXCEPTION 'Invalid role "%" - must be staff, admin, or ceo', p_role;
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, full_name, email, role, phone)
  VALUES (p_user_id, p_first_name, p_last_name, p_full_name, p_email, p_role, '')
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    full_name = EXCLUDED.full_name,
    email = COALESCE(EXCLUDED.email, profiles.email),
    role = EXCLUDED.role
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

-- Only authenticated callers may invoke it; the function itself enforces admin/ceo.
REVOKE EXECUTE ON FUNCTION public.admin_create_staff_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_staff_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
