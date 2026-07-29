-- ==============================================================================
-- Ticketing System - Production Security Update
-- ==============================================================================
-- Purpose:
--   Harden Supabase RLS policies after the QA audit.
--
-- How to use:
--   1. Back up the Supabase project first.
--   2. Run in Supabase Dashboard -> SQL Editor.
--   3. Replace the commented CEO bootstrap UUID below only if needed.
--
-- Important:
--   This file assumes the production identity model is:
--     public.profiles.id = auth.users.id
--     public.tickets.client_id = public.profiles.id
--     public.tickets.assigned_to = public.profiles.id
--
--   Apply the matching backend code updates before depending on staff assignment
--   or strict production behavior.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Required profile role helpers
-- ------------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ticket_replies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('staff', 'admin', 'ceo')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_ceo()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'ceo')
  );
$$;

-- Optional first-admin bootstrap:
-- After creating your first admin/CEO user in Supabase Auth, uncomment and replace:
-- UPDATE public.profiles
-- SET role = 'ceo'
-- WHERE id = 'PASTE_AUTH_USER_UUID_HERE';

-- ------------------------------------------------------------------------------
-- 2. Remove known unsafe and legacy policies
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow ticket operations" ON public.tickets;
DROP POLICY IF EXISTS "Allow client operations" ON public.clients;
DROP POLICY IF EXISTS "Allow ticket reply operations" ON public.ticket_replies;
DROP POLICY IF EXISTS "Allow profile operations" ON public.profiles;

DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users." ON public.profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

DROP POLICY IF EXISTS "Clients can view their own tickets or staff can view all" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated users can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "Clients or staff can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Allow public insert for ticket submission" ON public.tickets;
DROP POLICY IF EXISTS "Allow public read by ticket_number" ON public.tickets;
DROP POLICY IF EXISTS "Allow public read for tickets" ON public.tickets;
DROP POLICY IF EXISTS "Allow authenticated read for tickets" ON public.tickets;
DROP POLICY IF EXISTS "Allow update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated users can create tickets secure" ON public.tickets;
DROP POLICY IF EXISTS "Allow insert tickets" ON public.tickets;
DROP POLICY IF EXISTS "Clients see own tickets or staff see all" ON public.tickets;
DROP POLICY IF EXISTS "Staff can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Staff can delete tickets" ON public.tickets;

DROP POLICY IF EXISTS "Users can view replies for tickets they have access to" ON public.ticket_replies;
DROP POLICY IF EXISTS "Users can insert replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Public can view replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Public can insert replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated view replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated insert replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated can view related replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated can insert replies" ON public.ticket_replies;

DROP POLICY IF EXISTS "Allow public read clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public insert clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can insert own client profile" ON public.clients;
DROP POLICY IF EXISTS "Allow insert client profile" ON public.clients;
DROP POLICY IF EXISTS "Clients read own record or staff read all" ON public.clients;
DROP POLICY IF EXISTS "Clients update own record" ON public.clients;
DROP POLICY IF EXISTS "Admin can delete client records" ON public.clients;

-- ------------------------------------------------------------------------------
-- 2b. Drop new-style policies if re-running this migration
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Profiles: owner or staff can read" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: authenticated user can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: owner can update own non-admin profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: admin can manage profiles" ON public.profiles;

DROP POLICY IF EXISTS "Clients: owner can insert own client record" ON public.clients;
DROP POLICY IF EXISTS "Clients: owner or staff can read" ON public.clients;
DROP POLICY IF EXISTS "Clients: owner can update own record" ON public.clients;
DROP POLICY IF EXISTS "Clients: admin can delete" ON public.clients;

DROP POLICY IF EXISTS "Tickets: authenticated clients can create own ticket" ON public.tickets;
DROP POLICY IF EXISTS "Tickets: owner or staff can read" ON public.tickets;
DROP POLICY IF EXISTS "Tickets: staff can update" ON public.tickets;
DROP POLICY IF EXISTS "Tickets: admin can delete" ON public.tickets;

DROP POLICY IF EXISTS "Replies: related ticket users can read" ON public.ticket_replies;
DROP POLICY IF EXISTS "Replies: related ticket users can insert" ON public.ticket_replies;

-- ------------------------------------------------------------------------------
-- 3. Profiles policies
-- ------------------------------------------------------------------------------

CREATE POLICY "Profiles: owner or staff can read"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_staff_or_admin()
  );

CREATE POLICY "Profiles: authenticated user can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND role = 'client'
  );

CREATE POLICY "Profiles: owner can update own non-admin profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (
      SELECT p.role
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Profiles: admin can manage profiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_ceo())
  WITH CHECK (public.is_admin_or_ceo());

-- ------------------------------------------------------------------------------
-- 4. Client account policies
-- ------------------------------------------------------------------------------

CREATE POLICY "Clients: owner can insert own client record"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Clients: owner or staff can read"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_staff_or_admin()
  );

CREATE POLICY "Clients: owner can update own record"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Clients: admin can delete"
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_ceo());

-- ------------------------------------------------------------------------------
-- 5. Ticket policies
-- ------------------------------------------------------------------------------

CREATE POLICY "Tickets: authenticated clients can create own ticket"
  ON public.tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    email = (auth.jwt() ->> 'email')
    AND (
      client_id IS NULL
      OR client_id = auth.uid()
    )
  );

CREATE POLICY "Tickets: owner or staff can read"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    client_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR public.is_staff_or_admin()
  );

CREATE POLICY "Tickets: staff can update"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

CREATE POLICY "Tickets: admin can delete"
  ON public.tickets
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_ceo());

-- ------------------------------------------------------------------------------
-- 6. Ticket reply policies
-- ------------------------------------------------------------------------------

CREATE POLICY "Replies: related ticket users can read"
  ON public.ticket_replies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.id = ticket_id
        AND (
          t.client_id = auth.uid()
          OR t.email = (auth.jwt() ->> 'email')
          OR public.is_staff_or_admin()
        )
    )
  );

CREATE POLICY "Replies: related ticket users can insert"
  ON public.ticket_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.id = ticket_id
        AND (
          (
            sender_role = 'client'
            AND (
              t.client_id = auth.uid()
              OR t.email = (auth.jwt() ->> 'email')
            )
          )
          OR (
            sender_role IN ('staff', 'admin', 'ceo')
            AND public.is_staff_or_admin()
          )
        )
    )
  );

-- ------------------------------------------------------------------------------
-- 7. Helpful columns expected by current app code
-- ------------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.ticket_replies
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE IF EXISTS public.tickets
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------------------------
-- 8. Realtime publication, safe if already added
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_replies;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;

-- ==============================================================================
-- Post-run checks
-- ==============================================================================
-- 1. Confirm no unsafe public policies remain:
--
-- SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- 2. Confirm your admin account:
--
-- SELECT id, email, role
-- FROM public.profiles
-- WHERE role IN ('staff', 'admin', 'ceo');
--
-- 3. Production note:
--    Do not store Cloudflare R2 secret keys in Vite/browser environment variables.
--    Use Supabase Edge Function secrets or another backend-only secret store.
-- ==============================================================================
