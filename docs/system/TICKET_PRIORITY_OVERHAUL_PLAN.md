# Ticket Priority Architecture Overhaul Plan

**Document Status:** Revised / Ready for implementation planning  
**Date:** July 2026  
**Verdict:** GO WITH CHANGES (urgency/priority split only; no SLA/ITIL matrix this round)  
**Target Subsystems:** `supabase/*.sql`, `src/lib/ticketService.js`, `src/lib/formValidation.js`, `src/config/serviceOptions.js`, client submit/dashboard (`src/features/inquiries/`, `src/features/client/`), ops portal (`src/features/admin/`)

---

## 1. Problem & outcome

**Today:** Clients choose operational `priority` (`Low` | `Medium` | `High` | `Urgent`) at submit. Ops/admin drawers show priority as a read-only badge and cannot reclassify it. That invites priority inflation and blocks triage.

**Outcome:** Split **client urgency** (reported work impact) from **operational priority** (staff-owned queue signal). System sets an initial priority from urgency; staff can override. Clients do not control ops priority.

---

## 2. Goals / non-goals

### Goals

- Clients report `client_urgency` only (friendly UI labels; locked storage enums).
- `createTicket` always derives `priority` from urgency (ignores client-supplied `priority`).
- Staff/admin/CEO can change `priority` in the ops UI via `updateTicketPriority`.
- Persist `client_urgency`, `priority_updated_at`, `priority_updated_by`.
- Preserve local-storage fallback parity and existing `netops_ticket_updated` broadcast patterns.
- Keep single-page client submit UX (one choice, no extra steps).

### Non-goals (explicit)

- Full ITIL **Impact × Urgency** matrix / Impact field.
- SLA deadline calculation, timers, or escalation automation.
- Priority change history table or audit log UI.
- Client editing urgency (or priority) after submit.
- Landing marketing copy updates unless submit UX becomes misleading (optional follow-up).

---

## 3. Locked domain model

### Enums (storage values — do not invent synonyms in DB/API)

| Field | Allowed values | Owner |
| :--- | :--- | :--- |
| `client_urgency` | `Low` \| `Normal` \| `High` \| `Critical` | Client at create (read-only after) |
| `priority` | `Low` \| `Medium` \| `High` \| `Urgent` | System default, then staff triage |

UI may show friendlier labels (e.g. “Critical — Complete work blockage”) but **persist** the locked values above.

### Auto-triage (default — pending product confirm)

| `client_urgency` | Initial `priority` |
| :--- | :--- |
| `Critical` | `High` |
| `High` | `Medium` |
| `Normal` | `Medium` |
| `Low` | `Low` |

**Anti-inflation:** `Critical` never auto-maps to `Urgent`. Staff must promote to `Urgent`. See §12 if product wants `Critical → Urgent`.

### Client visibility (default recommendation)

- **Clients:** show **Reported Urgency** only.
- **Ops:** show urgency (context) + editable **Priority**.
- Marked as product decision; default above until overturned.

### Target flow

```
CLIENT SUBMIT
  select client_urgency (Low|Normal|High|Critical)
       │
       ▼
createTicket
  - ignore client-supplied priority
  - client_urgency = validated urgency (or legacy priority→urgency map)
  - priority = auto-triage(urgency)
       │
       ▼
OPS DRAWER / DASHBOARD
  - display Client Urgency (read-only)
  - editable Priority dropdown
  - updateTicketPriority → DB + local fallback + broadcast
```

---

## 4. Current footprint (grounded)

| Area | Current | Gap |
| :--- | :--- | :--- |
| Schema | `priority TEXT` + CHECK in `supabase/schema.sql` | No `client_urgency` / triage audit columns |
| Config | `src/config/serviceOptions.js` → `priorities` | Need `urgencies` (or equivalent) |
| Create | `createTicket` in `ticketService.js` writes `ticketData.priority` | Must ignore client priority; write urgency + derived priority |
| Format | `formatTicketRow` maps `priority` only | Must expose `clientUrgency` / `client_urgency` |
| Update | `updateTicketStatus`, `assignTicketStaff` | Need `updateTicketPriority` (same patterns) |
| Client form | `TicketModal.jsx` Priority select | Relabel → Urgency; send urgency |
| Ops drawer | `AdminTicketDrawer.jsx` read-only badge | Editable Priority + urgency pill |
| Ops queue | `AdminDashboard.jsx` filters/stats on `priority` | Keep ops priority; optional urgency display |
| Client views | dashboard / `IsolatedTicketModal` / `ClientPortalModal` | Show urgency (not ops priority) by default |

**API name note:** Use `createTicket` — there is no `createPublicTicket`.

---

## 5. Schema & migration (canonical)

### Canonical sources

1. **Primary:** new migration under `supabase/` (e.g. `supabase/20260730_decouple_priority_and_urgency.sql`).
2. **Keep in sync:** `supabase/schema.sql` (canonical schema for greenfield / reference).
3. **Optional mirror only:** `docs/supabase_schema_setup.sql` — **deprecated / unsafe RLS** historically; if touched, mirror columns with a short note that production RLS lives in `supabase/production_security_update.sql` / `schema.sql`, not the docs setup file.

### Phase 1 columns (one migration, all together)

| Column | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `client_urgency` | `TEXT` | `'Normal'` | CHECK `(client_urgency IN ('Low','Normal','High','Critical'))` |
| `priority` | existing | `'Medium'` | Keep CHECK `(priority IN ('Low','Medium','High','Urgent'))` |
| `priority_updated_at` | `TIMESTAMPTZ` | `NULL` | Set on staff triage (not on create auto-triage unless product wants otherwise — default: **null until staff override**) |
| `priority_updated_by` | TBD | `NULL` | Open decision: email/name `TEXT` vs `UUID` → `profiles.id` (see §12) |

Migration must be **idempotent**: `ADD COLUMN IF NOT EXISTS`, add CHECKs only if missing (or drop/recreate named constraints safely).

### Backfill (never blind copy)

```sql
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
```

Do **not** `SET client_urgency = priority`.

Existing `priority` values stay as-is (historical ops signal). New creates use auto-triage going forward.

### RLS reality (accurate)

- Production policies: **staff / admin / CEO** (`is_staff_or_admin()`) may **UPDATE** ticket rows (row-level, not column-level).
- **Clients must not UPDATE** tickets (including priority/urgency). Do not add a client UPDATE path for these fields.
- **No new column-level UPDATE grants** are required for staff triage.
- Hardening that matters: on **INSERT**, service layer **overwrites** any client-supplied `priority` so JWT holders cannot self-assign `Urgent` via crafted payloads. RLS INSERT still allows clients to create tickets; trust boundary is application mapping + CHECKs.

Who may triage in UI: default **all staff/admin/ceo** (matches RLS). Narrowing to admin/CEO is a product decision (§12) and would need UI gating only unless policies are tightened later.

---

## 6. Service & validation rules

### Urgency validation

- Accept only `Low | Normal | High | Critical`.
- Prefer shared constants (e.g. in `serviceOptions.js` + validators in `formValidation.js` / pure helpers next to ticket service tests).

### Legacy POST fallback (rollout safety)

During / after client UI relabel, older clients may still send `priority`:

1. If `clientUrgency` / `client_urgency` / `urgency` present → validate as urgency.
2. Else if legacy `priority` present → map through **same backfill map** (`Medium→Normal`, `Urgent→Critical`, …) into `client_urgency`.
3. Always set `priority` from auto-triage(urgency). **Never** persist client-supplied priority as ops priority.

### `createTicket`

- Write `client_urgency` + derived `priority`.
- Ignore client `priority` for the ops column.
- Local-storage path must store both fields.

### `formatTicketRow`

- Include `clientUrgency` (from `t.client_urgency`) with UI fallback helper documented below.

### `updateTicketPriority(ticketId, newPriority, staffIdentity)`

Mirror `updateTicketStatus`:

1. Normalize/validate priority enum; throw on invalid.
2. If Supabase configured: update `priority`, `priority_updated_at`, `priority_updated_by`, `updated_at` first; on failure do not pretend success.
3. Update local-storage tickets array (match by `id` / `ticketNumber` / `ticket_number`).
4. Broadcast `netops_ticket_updated` with a payload consistent with status updates, e.g. `{ type: 'PRIORITY_UPDATED', ticketId, priority }` (and BroadcastChannel `netops_live_chat` if status updates do).
5. Return updated list / enough data for optimistic UI consumers.

### Tests

- Auto-triage map, legacy priority→urgency map, invalid enums, local-storage update behavior (pure helpers / extracted functions as existing `ticketService.test.js` pattern allows).
- Prefer extending `ticketService.test.js` / small `ticketPriority` helpers + `formValidation` tests over brittle full Supabase imports.

---

## 7. UI work

### Ops (ship after backend — early value)

**`AdminTicketDrawer.jsx`**

- Priority dropdown beside Status / Staff (same interaction patterns: optimistic local state, await service, rollback on error).
- Read-only **Client Urgency** pill in details.
- Do not require a new toast framework; match existing status/assign error handling.

**`AdminDashboard.jsx`**

- Queue badges / “Urgent” stats continue to use ops `priority`.
- Detail panel: add priority control if status/staff controls exist there too (keep behavior consistent with drawer).

### Client submit

**`TicketModal.jsx`**

- Replace Priority control with Urgency / Work Impact.
- Options (storage → example label):
  - `Normal` — Routine / non-critical (default)
  - `Low` — Minor request or suggestion
  - `High` — Key feature impaired
  - `Critical` — Complete work blockage / outage
- Submit `clientUrgency` (not ops priority).

### Client views (default)

**`ClientDashboardPage.jsx`**, **`IsolatedTicketModal.jsx`**, **`ClientPortalModal.jsx`**

- Display **Reported Urgency** only.
- Fallback for legacy rows without urgency: `client_urgency || mapPriorityToUrgency(priority) || 'Normal'`.

---

## 8. Work packages (executable)

Prefer **1–2 stacked PRs**: (1) BE-1 + BE-2, (2) FE-1 + FE-2, then QA-1. Ops UI (FE-1) can merge as soon as BE-2 lands so triage value ships before client relabel.

| ID | Owner | Size | Depends | Acceptance criteria |
| :--- | :--- | :--- | :--- | :--- |
| **WP-BE-1** Schema migration | `backend-engineer` | **S** | — | Migration adds `client_urgency`, `priority_updated_at`, `priority_updated_by` with CHECKs; idempotent; backfill map applied; `supabase/schema.sql` updated; optional docs mirror only with deprecation note |
| **WP-BE-2** Service + validation | `backend-engineer` | **M** | BE-1 | Constants + validators; `createTicket` ignores client priority; legacy priority→urgency fallback; auto-triage; `formatTicketRow` exposes urgency; `updateTicketPriority` mirrors status update + broadcast + local fallback; unit tests for maps/normalize |
| **WP-FE-1** Ops triage UI | `frontend-senior` | **M** | BE-2 | Drawer (+ dashboard detail if needed) editable Priority; urgency pill; optimistic update with rollback; a11y for new control; urgent stats still on ops priority |
| **WP-FE-2** Client submit + display | `frontend-senior` | **S–M** | BE-2 | TicketModal urgency select; client surfaces show urgency only (default); legacy fallbacks; no extra submit steps |
| **WP-QA-1** Release gate | `audit-qa` | **S** | FE-1, FE-2 | Insert tampering cannot force ops `Urgent`; clients cannot UPDATE priority; staff triage works; a11y/loading/error; `npm test`, `npm run lint`, `npm run build` |

**Overall complexity:** Medium.

---

## 9. Bug avoidance, sequencing, and rollback

### Safe sequencing

1. **Schema (BE-1)** — additive columns + backfill. Old app code still runs (ignores new columns).
2. **Service (BE-2)** — create path accepts legacy `priority` as urgency input; always writes both columns. Ops can call `updateTicketPriority` even before UI ships (manual/API).
3. **Ops UI (FE-1)** — triage live against new service; client form still sending priority is OK via legacy map.
4. **Client relabel (FE-2)** — switch form to urgency; keep legacy fallback for one release if needed.
5. **QA-1** — full gate before calling done.

### Runtime fallbacks (UI + formatters)

```text
urgencyDisplay = ticket.clientUrgency
  || ticket.client_urgency
  || mapPriorityToUrgency(ticket.priority)
  || 'Normal'
```

Never assume `client_urgency` exists on every local-storage row.

### Optimistic UI

Match Status / Staff: set local state → await service → on failure revert previous value and surface existing error pattern. Do not leave drawer state diverged from failed DB writes when Supabase is configured.

### If something breaks mid-rollout

| Failure | Fix |
| :--- | :--- |
| Migration applied, app not deployed | Safe: new columns nullable/defaulted; old code ignores them |
| Service deployed, UI not | Safe: creates get correct urgency/priority; ops still read-only until FE-1 |
| FE-1 bug on priority update | Revert FE PR; `updateTicketPriority` unused; status/assign unaffected |
| Bad auto-triage mapping | Fix map in one place (shared helper); backfill only if product requires historical rewrite (usually leave historical `priority` alone) |
| Client form still posts priority | Legacy map in `createTicket` keeps creates correct |
| CHECK violation on insert | Ensure UI + service only emit locked enums; fix validation before relaxing CHECKs |

### Rollback stance

- Prefer **forward fixes** for additive schema (do not drop columns in panic).
- UI/service regressions: revert the stacked PR that introduced them.
- Do not reintroduce client-controlled ops priority once FE-2 ships.

---

## 10. Verification commands

After BE/FE changes that touch lib or UI:

- `npm test`
- `npm run lint`
- `npm run build` (required if routing/entry/env untouched still recommended before merge for this feature)

Manual checks:

- Client cannot create a ticket that lands as `Urgent` without staff override (with default map).
- Staff can change priority; client UI does not expose editable priority.
- Legacy local ticket without `client_urgency` still renders.
- Drawer priority failure rolls back like a failed status change.

---

## 11. Team assignment

| Role | Responsibility |
| :--- | :--- |
| `project-manager` | Keep scope to urgency/priority split; track open decisions |
| `backend-engineer` | WP-BE-1, WP-BE-2 |
| `frontend-senior` | WP-FE-1 then WP-FE-2 (ops first) |
| `audit-qa` | WP-QA-1 before merge |

---

## 12. Open decisions (resolve before or during BE-2 / FE-2)

1. **Client visibility:** Confirm default — clients see **Reported Urgency only** (recommended) vs also show assigned ops priority.
2. **Critical mapping:** Keep **Critical → High** (recommended, anti-inflation) vs Critical → Urgent.
3. **Who may triage:** All `staff` / `admin` / `ceo` (matches RLS today) vs admin/CEO only (UI gate; optional later RLS tighten).
4. **`priority_updated_by` type:** plain email/name `TEXT` (simpler, matches plan-lite) vs `UUID` FK to `profiles.id` (cleaner, aligns with `assigned_to`).

Until decided, implementers should use the **recommended defaults** in this doc and note assumptions in the PR.

---

## 13. Recommended next step

1. Confirm §12 defaults (or override).
2. Kick **`backend-engineer` on WP-BE-1** (migration + `supabase/schema.sql`), then immediately **WP-BE-2**.
3. Stack **`frontend-senior` WP-FE-1** as soon as BE-2 is reviewable.
4. **WP-FE-2** then **`audit-qa` WP-QA-1**.
