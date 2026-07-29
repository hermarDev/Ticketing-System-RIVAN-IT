# Secure Deployment & Access Separation

Date: July 27, 2026  
Project: Ticketing System (Vite dual-entry + Supabase)

## Direct Answer

You do **not** need to split client and admin source trees into separate repositories for security.

You **do** need:

1. Clear **edge separation** (client host vs ops host)
2. Strong **Supabase Auth + RLS** (real authorization)
3. No privileged secrets in the browser

Hiding `/ops.html` or separating static folders alone is **not** a security model. Anyone who can load JS can still call Supabase with the public anon key. Database policies decide what is allowed.

---

## How This App Is Built

This project is a Vite **multi-page app** with two HTML entry points:

| Entry | App | Audience |
|-------|-----|----------|
| `index.html` → `src/main.jsx` | Client / public portal | Customers |
| `ops.html` → `src/ops.jsx` | Operations portal | Staff / Admin / CEO |

`npm run build` writes both into `dist/`:

- `dist/index.html`
- `dist/ops.html`
- `dist/assets/*` (JS/CSS chunks)

That is expected. See also `docs/architecture/production-dual-entry-design.md`.

---

## Deployment Options

| Option | Description | Recommendation |
|--------|-------------|----------------|
| A. One origin | Serve both HTML files from one domain | Simple, weaker isolation |
| B. One build, two hosts | Same `dist/`, route client and ops to different subdomains | **Recommended now** |
| C. Separate builds / private ops | Split bundles; ops behind VPN / Zero Trust | Best later for compliance |

### Recommended now (Option B)

- `app.yourdomain.com` → client (`index.html`)
- `ops.yourdomain.com` → ops (`ops.html`)
- Same build artifact (`dist/`)
- Stricter headers / WAF / optional IP allowlist on the ops host

### Best later (Option C)

- Private or VPN-only ops host
- Separate release cadence if needed
- Staff provisioning and `auth.admin` via Supabase Edge Functions

---

## What Actually Protects You

### 1. Authentication

- Clients and staff sign in through Supabase Auth
- Ops UI should verify `profiles.role` is `staff`, `admin`, or `ceo` before showing the desk
- UI role checks are **defense in depth only** — not the real gate

### 2. Authorization (mandatory)

- Apply and maintain RLS from `supabase/production_security_update.sql`
- Clients must only read/write their own tickets and related data
- Staff/admin policies must match role boundaries
- Users must not be able to self-escalate `profiles.role`

### 3. Secrets & env

- Client may only use public `VITE_*` values (for example `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- **Never** put the Supabase **service role** key in Vite / frontend code
- Keep `.env` out of git (already ignored)

### 4. Privileged actions

- Prefer Edge Functions for staff account creation and any `auth.admin.*` usage
- Do not rely on browser-only trust for elevated operations

### 5. Transport & headers

- HTTPS + HSTS at the CDN/host
- Tighten CSP for production (avoid `connect-src *` and unnecessary `unsafe-eval`)
- Prefer server/CDN security headers over HTML-only meta tags

---

## Suggested Host Layout

```text
                    ┌──────────────────────────────┐
                    │         One Vite build       │
                    │   dist/index.html + ops.html │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   app.yourdomain.com                         ops.yourdomain.com
   (public client)                            (staff only)
   serve index.html                           serve ops.html
   public CSP / rate limits                   stricter CSP, WAF,
                                              optional IP allowlist
                                   │
                                   ▼
                         Supabase (Auth + RLS)
```

---

## Production Checklist

### Deploy

- [ ] `npm test`, `npm run lint`, `npm run build` pass in CI
- [ ] Deploy full `dist/` to static host / CDN
- [ ] Point client domain to `index.html`
- [ ] Point ops domain to `ops.html`
- [ ] Enable HTTPS, HSTS, `nosniff`, frame denial headers
- [ ] Optional: IP allowlist / SSO / MFA enforcement on ops host

### Supabase

- [ ] Run `supabase/production_security_update.sql` on production (backup first)
- [ ] Bootstrap first admin/CEO via controlled SQL — not public signup
- [ ] Configure Auth site URL and redirect URLs for **both** hosts
- [ ] Verify client JWT cannot read staff-only rows
- [ ] Verify client JWT cannot escalate role in `profiles`
- [ ] Verify only admin/CEO can create elevated staff profiles

### App config

- [ ] Set only public `VITE_*` vars in host env
- [ ] Confirm no service-role or private Cloudflare secrets are exposed via `VITE_`
- [ ] Require Supabase in production; do not rely on local-storage fallback for real users

### Hardening follow-ups

- [ ] Narrow CSP in `index.html` / `ops.html` (or CDN CSP)
- [ ] Enable MFA for admin/CEO
- [ ] Move staff provisioning / admin delete flows to Edge Functions
- [ ] Periodically test RLS with client vs staff sessions

---

## Myths vs Reality

| Myth | Reality |
|------|---------|
| “If we don’t link ops, clients can’t access admin.” | False. URLs and assets can still be requested. |
| “Separating folders makes the app secure.” | Only helps isolation. RLS + Auth enforce access. |
| “Anon key must be secret.” | Anon key is public by design. Policies protect data. |
| “Role check in React is enough.” | No. Always enforce in the database. |

---

## Bottom Line

- Keep the current dual-entry build.
- Separate **access at the edge** (subdomains + stricter ops controls).
- Enforce **Auth + RLS** as the real security boundary.
- Split builds / private ops hosting later if compliance requires it.

Related docs in this folder:

- `IMPROVEMENTS.md` — backend audit and completed fixes
- `PHASE3_COMPLETION_REPORT.md` — Phase 3 completion summary
