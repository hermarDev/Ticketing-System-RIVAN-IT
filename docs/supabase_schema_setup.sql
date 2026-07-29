-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !! DEPRECATED — DO NOT USE IN PRODUCTION                                  !!
-- !!                                                                         !!
-- !! This file contains wide-open RLS policies (USING (true) WITH CHECK     !!
-- !! (true)) on ALL tables. These policies grant unrestricted read/write     !!
-- !! access to every role including anonymous users.                         !!
-- !!                                                                         !!
-- !! Additionally, tickets.client_id here references public.clients(id),    !!
-- !! which contradicts supabase/schema.sql where it references              !!
-- !! public.profiles(id). The two schemas are incompatible.                 !!
-- !!                                                                         !!
-- !! For production use:                                                     !!
-- !!   - Use supabase/schema.sql for the base schema.                       !!
-- !!   - Apply supabase/production_security_update.sql to harden RLS.       !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- ==============================================================================
-- NetOps Ticket Desk — Supabase Database Schema & RLS Security Policies
-- (LEGACY — kept for reference only)
-- ==============================================================================

-- 1. Create Profiles Table (Staff, Admin, CEO users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin', 'ceo')),
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Clients Table
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  full_name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  site_address TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Tickets Table
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  attachment TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Ticket Replies Table (Live Chat & Comments)
CREATE TABLE IF NOT EXISTS public.ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'client',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;

-- Allow public & authenticated users to read and insert tickets
DROP POLICY IF EXISTS "Allow ticket operations" ON public.tickets;
CREATE POLICY "Allow ticket operations" ON public.tickets FOR ALL USING (true) WITH CHECK (true);

-- Allow public & authenticated users to operate on clients
DROP POLICY IF EXISTS "Allow client operations" ON public.clients;
CREATE POLICY "Allow client operations" ON public.clients FOR ALL USING (true) WITH CHECK (true);

-- Allow public & authenticated users to operate on ticket replies
DROP POLICY IF EXISTS "Allow ticket reply operations" ON public.ticket_replies;
CREATE POLICY "Allow ticket reply operations" ON public.ticket_replies FOR ALL USING (true) WITH CHECK (true);

-- Allow public & authenticated users to operate on profiles
DROP POLICY IF EXISTS "Allow profile operations" ON public.profiles;
CREATE POLICY "Allow profile operations" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- FREE REALTIME WEBSOCKET SUBSCRIPTION ENABLEMENT
-- ==============================================================================

-- Add tickets & ticket_replies to Supabase Realtime publication (Free tier supported)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets, public.ticket_replies;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignores if tables are already in publication
  NULL;
END $$;
