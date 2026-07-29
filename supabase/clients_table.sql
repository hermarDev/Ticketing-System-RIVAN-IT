-- ==========================================
-- NetOps Ticket Desk - Client Accounts Table
-- Run this in Supabase Dashboard -> SQL Editor -> New Query
-- Clients now authenticate via Supabase Auth (email + password).
-- This table stores additional profile data linked to auth users.
-- ==========================================

-- Create Clients Table (linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  site_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure new columns exist if table was created previously
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Drop any old policies first
DROP POLICY IF EXISTS "Allow public read clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public insert clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can insert own client profile" ON public.clients;
DROP POLICY IF EXISTS "Clients read own record or staff read all" ON public.clients;
DROP POLICY IF EXISTS "Clients update own record" ON public.clients;
DROP POLICY IF EXISTS "Admin can delete client records" ON public.clients;

-- Allow authenticated users and newly registered users to create client profile
DROP POLICY IF EXISTS "Authenticated can insert own client profile" ON public.clients;
DROP POLICY IF EXISTS "Allow insert client profile" ON public.clients;

CREATE POLICY "Allow insert client profile"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Clients can read their own record; staff/admin/ceo can read all
CREATE POLICY "Clients read own record or staff read all"
  ON public.clients FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_staff_or_admin()
  );

-- Clients can update only their own record
CREATE POLICY "Clients update own record"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Only admin/ceo can delete client records
CREATE POLICY "Admin can delete client records"
  ON public.clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ceo')
    )
  );
