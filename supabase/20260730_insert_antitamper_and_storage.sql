-- WP-SEC: Ticket INSERT anti-tamper + attachments storage hardening
-- Idempotent: safe to re-run.
--
-- Part A: BEFORE INSERT on public.tickets
--   - Normalize client_urgency (incl. legacy priority → urgency map)
--   - Force ops priority from auto-triage (Critical→High, never auto-Urgent)
--   - Clear priority_updated_* (staff triage is UPDATE-only)
--   - Force status = 'New', assigned_to = NULL (clients cannot pre-assign / spoof status)
--
-- Part B: storage.buckets + storage.objects policies for bucket "attachments"
--   Compatible with current app: flat object keys + getPublicUrl (bucket stays public).
--   Authenticated users may upload; anyone may read public objects; staff/admin/ceo may delete.
--   Making the bucket private requires an app change to createSignedUrl — do not flip public=false yet.

-- =============================================================================
-- Part A — INSERT anti-tamper
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tickets_enforce_create_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  urgency TEXT;
BEGIN
  -- 1) Resolve client_urgency (locked enum)
  urgency := NULLIF(BTRIM(COALESCE(NEW.client_urgency, '')), '');

  IF urgency IS NULL OR urgency NOT IN ('Low', 'Normal', 'High', 'Critical') THEN
    -- Legacy / tamper path: treat ops-looking priority as urgency input
    urgency := CASE NULLIF(BTRIM(COALESCE(NEW.priority, '')), '')
      WHEN 'Low' THEN 'Low'
      WHEN 'Medium' THEN 'Normal'
      WHEN 'High' THEN 'High'
      WHEN 'Urgent' THEN 'Critical'
      ELSE 'Normal'
    END;
  END IF;

  NEW.client_urgency := urgency;

  -- 2) Always auto-triage ops priority (ignore client-supplied priority)
  NEW.priority := CASE urgency
    WHEN 'Critical' THEN 'High'
    WHEN 'High' THEN 'Medium'
    WHEN 'Normal' THEN 'Medium'
    WHEN 'Low' THEN 'Low'
    ELSE 'Medium'
  END;

  -- 3) Triage audit columns are staff UPDATE only
  NEW.priority_updated_at := NULL;
  NEW.priority_updated_by := NULL;

  -- 4) Lock create-time workflow fields
  NEW.status := 'New';
  NEW.assigned_to := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_enforce_create_defaults ON public.tickets;

CREATE TRIGGER tickets_enforce_create_defaults
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tickets_enforce_create_defaults();

COMMENT ON FUNCTION public.tickets_enforce_create_defaults() IS
  'Forces create-time urgency→priority auto-triage and clears spoofable status/assignment/triage fields.';

-- =============================================================================
-- Part B — attachments bucket + storage RLS
-- =============================================================================
-- Requires: public.is_staff_or_admin() from production_security_update.sql (already live).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  true,                          -- keep true while app uses getPublicUrl
  10485760,                      -- 10 MiB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
  allowed_mime_types = COALESCE(storage.buckets.allowed_mime_types, EXCLUDED.allowed_mime_types);

-- Drop prior policy names we (re)create so re-runs are clean
DROP POLICY IF EXISTS "Attachments: authenticated can upload" ON storage.objects;
DROP POLICY IF EXISTS "Attachments: public can read" ON storage.objects;
DROP POLICY IF EXISTS "Attachments: owner or staff can update" ON storage.objects;
DROP POLICY IF EXISTS "Attachments: staff can delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can read attachments" ON storage.objects;

CREATE POLICY "Attachments: authenticated can upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments');

-- Public bucket reads (matches getPublicUrl). If you later set public=false, replace with signed URLs + authenticated SELECT.
CREATE POLICY "Attachments: public can read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'attachments');

CREATE POLICY "Attachments: owner or staff can update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      owner = auth.uid()
      OR public.is_staff_or_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND (
      owner = auth.uid()
      OR public.is_staff_or_admin()
    )
  );

CREATE POLICY "Attachments: staff can delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.is_staff_or_admin()
  );
