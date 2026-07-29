-- ==========================================
-- NetOps Ticket Desk - Supabase Database Schema
-- Run this script in your Supabase Dashboard -> SQL Editor -> New Query
-- ==========================================

-- 1. Create Profiles Table (Syncs with Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('client', 'staff', 'admin', 'ceo')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure new columns exist if table was created previously
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing profile policies if present to prevent errors
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users." ON public.profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Helper function to check if the current user is staff/admin/ceo without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('staff', 'admin', 'ceo')
  );
$$;

-- Automatic trigger to create a profile row with role='client' for every new auth user (Email or Google OAuth)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extracted_full_name TEXT;
  extracted_first_name TEXT;
  extracted_last_name TEXT;
BEGIN
  extracted_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    SPLIT_PART(NEW.email, '@', 1)
  );

  extracted_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    SPLIT_PART(extracted_full_name, ' ', 1)
  );

  extracted_last_name := COALESCE(
    NEW.raw_user_meta_data->>'last_name',
    NULLIF(SUBSTRING(extracted_full_name FROM LENGTH(extracted_first_name) + 2), '')
  );

  INSERT INTO public.profiles (id, first_name, last_name, full_name, email, role)
  VALUES (
    NEW.id,
    extracted_first_name,
    extracted_last_name,
    extracted_full_name,
    NEW.email,
    'client'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- Profiles Policies: Users see their own profile; staff/admin/ceo see all
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_staff_or_admin()
  );

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND role = 'client'
  );

CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 2. Create Tickets Table
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  category TEXT NOT NULL,
  priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  attachment TEXT,
  status TEXT DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'Pending Client', 'Resolved', 'Closed')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure attachment column exists if table was created previously
ALTER TABLE public.tickets 
  ADD COLUMN IF NOT EXISTS attachment TEXT;

-- Enable RLS for tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing ticket policies if present
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

-- Tickets Policies: Allow anon & authenticated users to create tickets; clients see own tickets; staff see all
CREATE POLICY "Allow insert tickets"
  ON public.tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    email = (auth.jwt() ->> 'email')
    AND (client_id IS NULL OR client_id = auth.uid())
  );

CREATE POLICY "Clients see own tickets or staff see all"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (
    client_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR public.is_staff_or_admin()
  );

CREATE POLICY "Staff can update tickets"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (public.is_staff_or_admin());

CREATE POLICY "Staff can delete tickets"
  ON public.tickets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ceo')
    )
  );

-- 3. Create Ticket Replies Table
CREATE TABLE IF NOT EXISTS public.ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'staff', 'admin', 'ceo')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for ticket_replies
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;

-- Drop existing reply policies if present
DROP POLICY IF EXISTS "Users can view replies for tickets they have access to" ON public.ticket_replies;
DROP POLICY IF EXISTS "Users can insert replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Public can view replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Public can insert replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated view replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated insert replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated can view related replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Authenticated can insert replies" ON public.ticket_replies;

-- Reply Policies: Users can view replies on tickets they can access; authenticated can insert
CREATE POLICY "Authenticated can view related replies"
  ON public.ticket_replies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (
        t.client_id = auth.uid()
        OR t.email = (auth.jwt() ->> 'email')
        OR public.is_staff_or_admin()
      )
    )
  );

CREATE POLICY "Authenticated can insert replies"
  ON public.ticket_replies FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (
        (sender_role = 'client' AND (t.client_id = auth.uid() OR t.email = (auth.jwt() ->> 'email')))
        OR (sender_role IN ('staff', 'admin', 'ceo') AND public.is_staff_or_admin())
      )
    )
  );

-- 4. Trigger to automatically handle updated_at timestamp on tickets
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tickets_updated_at ON public.tickets;

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 5. Realtime WebSockets Publication Setup
-- Enable real-time change events for tickets and chat messages
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_replies;
