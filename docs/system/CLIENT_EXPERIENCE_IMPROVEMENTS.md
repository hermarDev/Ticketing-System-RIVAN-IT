# Industry-Standard & Client-Experience Improvements

Research-based gap analysis for the NetOps Ticket Desk, focused on what
industry-standard ticketing platforms (Zendesk, Freshdesk, HelpScout, Jira
Service Management) do for the CLIENT side, and what is missing here.

Date: 2026-08-02
Status: Research only — no code changed.

---

## 1. Current state (what the client already gets)

Good foundation already in place:

- Modern React portal, responsive, dark/light theme, accessible labels
- Account-tracked ticket creation: request type, urgency, product model,
  site address with map picker, up to 10MB attachments
- Full status workflow: New -> In Progress -> Pending Client -> Resolved -> Closed
- Per-ticket chat thread (real-time replies), timeline visualization,
  resolution-approval banner, ability to reopen
- In-app notifications: toasts, unread badge, activity log drawer
- Google OAuth + email/password login

## 2. The critical gap: email notifications are built but not wired

`supabase/functions/send-email/` exists (Resend integration, staff-role
guarded), but a repo-wide search finds ZERO callers. The landing page
promises "You Get Notified at Every Step" — today that only happens while
the browser tab is open.

Industry standard (benchmarks):
- Customers expect a first response within ~1 hour; email reply benchmarks
  are 2-4 hours for high performers (emailanalytics.com, vida.io 2025/2026).
- Automated acknowledgment on submission is table stakes — every major
  platform sends "ticket received" immediately, then status-change emails.

Minimum viable fix (moderate effort):
- On ticket create: email client "Ticket #XXXX received — we'll reply within
  [SLA]".
- On status change / staff reply: email the client.
- Reuse the existing send-email function; add a `ticketId` lookup so the
  client reply address is the ticket owner's.

## 3. Self-service knowledge base

Industry stats (stealthagents.com, document360 2025/2026):
- ~40% ticket deflection is achievable with a good KB.
- A majority of customers prefer self-service for common issues.
- Also cuts cost per ticket and first-response load.

Recommendation (moderate effort):
- Public FAQ already exists on landing. Turn it into a searchable,
  per-product KB (Cisco / Fortinet / general networking).
- Client dashboard gets a "Guides" tab; article read counts inform which
  articles to expand.
- Optionally link KB articles to ticket categories ("While you wait, see:
  FortiGate VPN setup").

## 4. CSAT / satisfaction feedback on resolution

Industry standard: CSAT (1-5 scale) sent when a ticket is resolved/closed,
plus optional comment. Retently 2026 benchmark: ~77% average CSAT across
industries — a baseline to measure against.

Recommendation (small effort):
- When ticket reaches Resolved, client sees the existing confirmation banner
  + a 1-5 rating and optional comment. Store on ticket row
  (`csat_score`, `csat_comment`, `csat_responded_at`).
- Ops dashboard shows average CSAT + trend. This is the single best
  "is the system working for clients" metric.

## 5. SLA: set expectations, show countdown

Industry standard (freshworks/ITSM guides 2025/2026):
- 3-4 priority tiers with distinct response targets (e.g. Critical 15-30min,
  High 1h, Medium 4h, Low 24h).
- SLAs start/pause/stop on status; "at-risk" alerts; dashboards show
  compliance %.

Recommendation (moderate effort):
- Config table `sla_policies(priority, first_response_target, resolution_target)`.
- Show the client "Expected first response: by [time]" on their ticket.
- Ops queue gets response-deadline + overdue highlighting (computed from
  created_at + priority, no cron needed).

## 6. Progress transparency & expectation setting

Industry pattern (manyrequests.com 2026): "Make progress visible, or silence
will read as inactivity." Portals with submitted / in review / awaiting
feedback / delivered / completed statuses let clients self-serve status.

Recommendation (small-to-moderate effort):
- After submission, show a "What happens next" card (timeline of steps,
  expected response time).
- Add timestamps to timeline steps (created / acknowledged / assigned /
  responded / resolved) so clients see *when* things happened, not just
  what stage.
- Rename or annotate "Pending Client" to make the required action explicit
  ("Action needed: please reply in the chat") — dead-end statuses generate
  the most "where is my ticket?" calls.

## 7. Ticket capture: fewer required fields for logged-in clients

Industry standard: progressive disclosure; logged-in users should not
re-type what the system knows.

Current friction: TicketModal requires firstName, lastName, email, company,
subject, productModel, siteLocation, description even for logged-in clients
whose account already has most of it.

Recommendation (small effort):
- For authenticated clients, prefill and *hide* first/last/email/company
  (show as read-only summary line), requiring only subject + details.
- Keep full form for anonymous submitters.

## 8. Larger / later ideas (noted, not scoped)

- Email-to-ticket: client replies by email create ticket replies
  (needs inbound email handling; moderate-large).
- WhatsApp/Telegram channel for clients (the Telegram bot work started
  earlier; one-way staff alerts first, then client notify).
- Reopen policy: allow client reopen within N days of close, then force
  new ticket (avoids zombie threads).
- Client-side analytics: "average response time" shown on dashboard builds
  trust.
- Attachment preview inline (images) in chat thread.

---

## Suggested priority order

1. Wire email notifications (biggest trust gap, function already built)
2. CSAT on resolution (small, gives you the metric to steer everything)
3. "What happens next" + timestamped timeline (expectation setting)
4. Knowledge base (deflection, medium effort)
5. SLA targets + client-visible response ETA (medium effort)
6. Reduce required fields for logged-in clients (small)
7. Later: multi-channel, email-to-ticket, reopen window

Each item is independent; 1-3 are the highest ratio of client-perceived
value to effort.
