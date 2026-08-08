-- 2026-08-04 — Realtime Channel Authorization Rules for Private Channels
--
-- Enables Realtime channels (`global_chat_replies_*`, `all_tickets_*`, `ticket_chat_*`, `ticket_presence_*`)
-- when "Allow public access to channels" is turned OFF in Supabase Dashboard.
--
-- Idempotent: safe to run multiple times.

DROP POLICY IF EXISTS "realtime channels read" ON realtime.messages;
CREATE POLICY "realtime channels read"
ON realtime.messages
FOR SELECT
TO authenticated, anon
USING (
  realtime.topic() LIKE 'ticket_chat_%'
  OR realtime.topic() LIKE 'all_tickets_%'
  OR realtime.topic() LIKE 'global_chat_replies_%'
  OR realtime.topic() LIKE 'ticket_presence_%'
);

DROP POLICY IF EXISTS "realtime channels write" ON realtime.messages;
CREATE POLICY "realtime channels write"
ON realtime.messages
FOR INSERT
TO authenticated, anon
WITH CHECK (
  realtime.topic() LIKE 'ticket_chat_%'
  OR realtime.topic() LIKE 'all_tickets_%'
  OR realtime.topic() LIKE 'global_chat_replies_%'
  OR realtime.topic() LIKE 'ticket_presence_%'
);
