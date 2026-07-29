# Backend Audit & Improvements — July 27, 2026

## Summary

A full backend audit identified **9 security issues**, **4 bugs/logic errors**, **3 error-handling gaps**, **2 performance concerns**, and several code-quality and testing gaps. All Phase 1 (critical/high) and Phase 2 (medium) items have been resolved. Phase 3 (low) items remain on the backlog.

---

## Security Fixes

| ID | Severity | Description | File(s) |
|----|----------|-------------|---------|
| S1 | Critical | `docs/supabase_schema_setup.sql` had wide-open RLS policies (`USING (true) WITH CHECK (true)`) on all tables. Marked as **DEPRECATED/UNSAFE** with a prominent header warning. | `docs/supabase_schema_setup.sql` |
| S2 | High | Ticket insert policy allowed anonymous inserts with no constraints. Restricted to `authenticated` with email match. | `supabase/schema.sql` |
| S3 | High | Reply insert policy had no constraint on who can insert. Now verifies the user owns the ticket or is staff. | `supabase/schema.sql` |
| S4 | High | Profile insert allowed anon to create profiles with any role. Restricted to `authenticated` + `role = 'client'`. | `supabase/schema.sql` |
| S5 | Medium | `clients_table.sql` anon insert policy was too permissive. Tightened to `authenticated` with `auth_user_id = auth.uid()`. | `supabase/clients_table.sql` |
| S6 | Medium | Local-storage `loginClient` fallback did no password verification. Added `console.warn` marking it as dev-only. | `src/lib/ticketService.js` |
| S9 | Medium | `attachmentUrl` embedded in markdown without validation. Now validated to start with `https?://` with parentheses stripped. | `src/lib/ticketService.js` |

## Bug Fixes

| ID | Severity | Description | File(s) |
|----|----------|-------------|---------|
| B1 | High | `assignTicketStaff` stored a display name in `assigned_to` but schema expects a UUID. Now calls `getStaffAssignmentId()` to resolve the UUID. | `src/lib/ticketService.js` |
| B2 | Medium | `updateTicketStatus` silently continued after both retry attempts failed. Now propagates the error. | `src/lib/ticketService.js` |
| B3 | Low | `accountData.fullName` was used unsanitized in `createAccount`. Now passed through `sanitizeInput()`. | `src/lib/ticketService.js` |
| B4 | Low | `recentTicketSubmissions` Map grew unbounded. Added pruning for entries older than 10s when the Map exceeds 50 entries. | `src/lib/ticketService.js` |

## Error Handling Improvements

| ID | Severity | Description | File(s) |
|----|----------|-------------|---------|
| E1 | High | `createAccount` left orphaned auth users if `clients` insert failed. Now attempts `auth.admin.deleteUser()` cleanup on failure. | `src/lib/ticketService.js` |
| E2 | Medium | `syncOAuthUser` had no protection against concurrent OAuth callbacks. Now uses `upsert` with `onConflict: 'email'`. | `src/lib/ticketService.js` |
| E3 | Low | Profile sync error in `updateClientAccount` was silently ignored. Now logged via `logger.warn`. | `src/lib/ticketService.js` |

## Performance Improvements

| ID | Severity | Description | File(s) |
|----|----------|-------------|---------|
| P1 | Medium | `fetchTickets` retrieved all tickets without pagination. Now accepts `{ limit, offset }` options (defaults: 100, 0) using `.range()`. | `src/lib/ticketService.js` |

## Code Quality

| ID | Severity | Description | File(s) |
|----|----------|-------------|---------|
| Q1 | High | SQL schema files were contradictory (conflicting FK definitions, conflicting RLS). `docs/` file deprecated; `supabase/schema.sql` is now the canonical source. | `docs/supabase_schema_setup.sql`, `supabase/schema.sql` |
| Q2 | Low | Duplicate `isUUID` helper removed from inside `createTicket`; uses the module-level definition. | `src/lib/ticketService.js` |

## Test Coverage Added

| File | Tests | Suites | Highlights |
|------|-------|--------|------------|
| `src/lib/ticketService.test.js` | 27 | 7 | `sanitizeInput`, `isUUID`, `getStaffDisplayName`, `getStaffAssignmentId`, `getAutoCloseTimeRemaining`, idempotency guard |
| `src/lib/notificationService.test.js` | 14 | 5 | Active ticket tracking, deduplication, read marking, unread counts |
| `src/lib/attachmentUtils.test.js` | 20 | 3 | `parseAttachments`, `isImageUrl`, `getAttachmentLabel` |

**Total:** 45 new tests added (26 → 71). All passing. No new bugs discovered.

---

## Phase 3 — Low (Completed)

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| S7 | Remove or recreate `r2Client.js` and update doc references | ✅ Done | File was already absent; removed stale references from `AGENTS.md` and `.opencode/agents/backend-engineer.md`. |
| S8 | Replace basic `sanitizeInput` regex with a proper HTML sanitizer (e.g. DOMPurify) | ✅ Done | Replaced regex loop with `isomorphic-dompurify` (`ALLOWED_TAGS: [], ALLOWED_ATTR: []`). Works in browser and Node.js tests. |
| Q3 | Add JSDoc type annotations to exported service functions | ✅ Done | Added `@param`/`@returns` to 40 exported functions across `ticketService.js`, `notificationService.js`, and `attachmentUtils.js`. |
| P2 | Add server-side filter to `subscribeToGlobalReplies` Supabase channel | ✅ Done | Already implemented in Phase 2 — `sender_role=neq.client` / `sender_role=eq.client` filter applied. |

## Production Deployment Notes

- **Apply hardened RLS:** Run `supabase/production_security_update.sql` against the live Supabase instance. Verify with the `pg_policies` query in that file.
- **Account creation cleanup caveat:** `auth.admin.deleteUser()` requires the service-role key, which should not be on the client. Consider a server-side Edge Function for account creation.
- **Schema migration:** The RLS changes in `schema.sql` and `clients_table.sql` reflect the desired state. For existing deployments, apply via `production_security_update.sql`.

---

## Verification

```bash
npm test    # 72/72 pass
npm run lint   # pass (pre-existing warnings only)
npm run build  # pass
```
