# Fix: Client Ticket Modal Closes on Ops Status/Staff Update

## Symptom

With client (`/`) and ops (`ops.html`) open in the same browser:

1. Client opens a ticket modal.
2. Ops changes **STATUS** or **STAFF** on that ticket.
3. Client modal **closes suddenly**.
4. Reopening the ticket shows the **correct** status/assignment.

Secondary: Admin header badge can show stale status (e.g. "In Progress") while the STATUS dropdown already shows the new value (e.g. "Pending Client").

## Root Cause

Data sync works. The client open-state UI does not.

Ops `updateTicketStatus` / `assignTicketStaff` (`ticketService.js`) write DB + `localStorage`, then notify via:

- Supabase `postgres_changes` realtime
- `BroadcastChannel('netops_live_chat')` → `TICKET_UPDATED`

Client (`ClientDashboardPage.jsx`) reacts on **both** paths and calls `loadTickets`, which merges into `isolatedTicket` but creates a **new ticket object** every time. That churn rebinds `IsolatedTicketModal` effects (`ticket` object + unstable `onClose` Escape listener). The modal only clears via `setIsolatedTicket(null)` from dismiss actions — remote updates make that dismiss path fragile under a refetch storm.

This is **not**:

- Auth storage key clash (already fixed)
- Incorrect status writes / Closed mis-map
- A reason to split apps or non-auth localStorage keys

## Key Files

| Area | File |
|------|------|
| Client open state | `src/features/client/ClientDashboardPage.jsx` |
| Client modal | `src/features/client/components/IsolatedTicketModal.jsx` (or equivalent) |
| Ops writes / broadcast | `src/lib/ticketService.js` |
| Admin drawer / badge | `src/features/admin/components/AdminTicketDrawer.jsx` |
| Admin selection | `src/features/admin/AdminDashboard.jsx` |

## Implementation

### 1. Harden client open state (P0 — frontend)

- Track open ticket by durable ID (`isolatedTicketId` or a ref), separate from ticket data.
- **Never clear** that ID on remote updates; only clear on explicit close (Esc / Back / X / Done).
- Resolve displayed ticket from `tickets` + ID; merge status/assignment/staff **in place**.
- Match IDs by both UUID and `NET-…` (`id` / `ticketNumber` / `ticket_number`).
- Stabilize `onClose` with `useCallback`.
- Modal effects should depend on `ticket.id` (or ID string), not the whole `ticket` object.
- Deduplicate refresh: avoid both realtime **and** BroadcastChannel each calling a full `loadTickets` for the same update (keep list fresh; protect selection chrome).
- Prefer `initial={false}` on enter animation after first open so updates don’t replay open/close motion.

**Done when:** Ops changes status/staff while client modal is open → modal stays open and fields update live.

### 2. Admin badge + selection (P1 — same PR)

- Bind header status badge to the same source as the STATUS control (`selectedStatus`), **or** refresh `adminDrawerTicket` after status/assign success.
- Replace patterns like `setAdminDrawerTicket(updated || null)` / `setSelectedTicket(updated || null)` with keep-previous-if-missing so a missed refetch row doesn’t wipe the workspace.
- Escape should close nested status/staff menus first, then the drawer.

**Done when:** Header badge matches dropdown after change; assign/status never blanks the open workspace if the ticket is still selected.

### 3. Optional sync hygiene (P2 — backend, later)

- Enrich `TICKET_UPDATED` payload so UI can merge without a full list refetch.
- Optional: separate channel for ticket meta vs chat presence.

Not required if step 1 dedupes client listeners.

## Out of Scope

- Splitting client/ops into separate Vite apps or folders
- Splitting non-auth localStorage keys as the primary fix
- Auth/RLS changes
- Removing BroadcastChannel or realtime entirely

## Acceptance Criteria

1. Client modal stays open across ops status and staff changes for the same ticket.
2. Open modal reflects new status/assignment without reopen.
3. Admin header badge matches STATUS control after change.
4. Escape does not dismiss the ticket view while closing a nested admin menu.
5. `npm test`, `npm run lint`, and `npm run build` (if entry/services touched) pass.

## Manual Test

1. Same browser profile: `/` + `ops.html`.
2. Client: open ticket modal (Live Chat or Details).
3. Ops: change STATUS, then STAFF, on that ticket.
4. Expect: client modal stays open; values update; admin badge matches dropdown.
5. Client: Esc / Done Viewing still closes normally.

## Verify After

`audit-qa` (or manual pass) against the acceptance criteria above.
