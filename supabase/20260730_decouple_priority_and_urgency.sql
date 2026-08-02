-- WP-BE-1: Decouple client urgency from operational priority
-- Idempotent: safe to re-run. Additive columns only; existing priority values stay as-is.
--
-- client_urgency: Low | Normal | High | Critical (client-reported)
-- priority:       Low | Medium | High | Urgent   (ops-owned; existing CHECK retained)
-- priority_updated_at / priority_updated_by: set on staff triage only (null on create)

-- 1. Add columns (nullable first so backfill can map from historical priority)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS client_urgency TEXT;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS priority_updated_at TIMESTAMPTZ;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS priority_updated_by TEXT;

-- 2. Backfill client_urgency from existing priority (never blind copy priority → urgency)
UPDATE public.tickets
SET client_urgency = CASE priority
  WHEN 'Low' THEN 'Low'
  WHEN 'Medium' THEN 'Normal'
  WHEN 'High' THEN 'High'
  WHEN 'Urgent' THEN 'Critical'
  ELSE 'Normal'
END
WHERE client_urgency IS NULL
   OR client_urgency NOT IN ('Low', 'Normal', 'High', 'Critical');

-- 3. Defaults for future inserts (after backfill)
ALTER TABLE public.tickets
  ALTER COLUMN client_urgency SET DEFAULT 'Normal';

UPDATE public.tickets
SET client_urgency = 'Normal'
WHERE client_urgency IS NULL;

-- 4. Named CHECKs only if missing (drop/recreate is avoided when already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_client_urgency_check'
      AND conrelid = 'public.tickets'::regclass
  ) THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_client_urgency_check
      CHECK (client_urgency IN ('Low', 'Normal', 'High', 'Critical'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_priority_check'
      AND conrelid = 'public.tickets'::regclass
  ) THEN
    -- Greenfield schema.sql uses an inline CHECK; older DBs may lack a named constraint.
    -- Only add when no priority CHECK exists at all.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.tickets'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%priority%IN%'
    ) THEN
      ALTER TABLE public.tickets
        ADD CONSTRAINT tickets_priority_check
        CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent'));
    END IF;
  END IF;
END $$;
