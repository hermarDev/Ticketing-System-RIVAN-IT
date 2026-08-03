-- 2026-08-03 — Realtime Authorization Rules for ticket presence/broadcast channels.
--
-- Gates the `ticket_presence_<ticket-uuid>` Realtime channel (presence + typing
-- broadcast) used by subscribeToTicketPresence in src/lib/ticketService.js.
-- Without these policies, any holder of the anon key could join the channel,
-- read presence metadata (display names / online status) and spoof typing events.
--
-- Requires (dashboard step, user action):
--   1. Run this file in the Supabase SQL editor (or `supabase db push`).
--   2. Dashboard > Project > Realtime > Settings: disable "Allow public access"
--      (private channels are only enforced when public access is off).
-- The client connects with { config: { private: true } } (see ticketService.js).
--
-- Idempotent: safe to run multiple times.

drop policy if exists "ticket presence read" on realtime.messages;
create policy "ticket presence read"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id::text = substring((select realtime.topic()) from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
      and realtime.messages.extension in ('broadcast', 'presence')
      and (
        t.client_id = (select auth.uid())
        or t.email = ((current_setting('request.jwt.claims', true))::json ->> 'email')
        or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('staff', 'admin', 'ceo'))
      )
  )
);

drop policy if exists "ticket presence write" on realtime.messages;
create policy "ticket presence write"
on realtime.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tickets t
    where t.id::text = substring((select realtime.topic()) from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
      and realtime.messages.extension in ('broadcast', 'presence')
      and (
        t.client_id = (select auth.uid())
        or t.email = ((current_setting('request.jwt.claims', true))::json ->> 'email')
        or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('staff', 'admin', 'ceo'))
      )
  )
);
