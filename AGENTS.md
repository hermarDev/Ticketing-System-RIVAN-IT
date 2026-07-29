# Repository Guidelines

## Project Structure & Module Organization

Vite + React 19 ticketing app with two HTML entry points built by `vite.config.js`:

- `index.html` -> `src/main.jsx` -> `src/app/App.jsx` (public/client).
- `ops.html` -> `src/ops.jsx` -> `src/ops/OpsApp.jsx` (operations portal).

Source layout under `src/`:

- `features/` route-level screens: `auth/`, `landing/`, `inquiries/`, `client/`, `admin/` (each may have a `components/` subfolder).
- `shared/components/` reusable UI only when genuinely shared.
- `layout/`, `content/`, `config/` for shell, copy, options.
- `lib/` services and utilities: `supabaseClient.js`, `ticketService.js`, `notificationService.js`, `attachmentUtils.js`, `formValidation.js`, `idGenerators.js`, `logger.js`, `useTheme.js`.
- `styles/` global CSS (loaded by both entry points).

Supabase SQL lives in `supabase/*.sql` and `docs/supabase_schema_setup.sql`; architecture notes in `docs/architecture/`; deployment, audit, and access-separation docs in `docs/system/`. Static assets go in `public/`.

## Build, Test, and Development Commands

- `npm install` install deps.
- `npm run dev` Vite dev server with HMR.
- `npm run build` production build to `dist/`.
- `npm run preview` serve the production build.
- `npm run lint` Oxlint (configured via `.oxlintrc.json`).
- `npm test` Node built-in test runner against `src/**/*.test.js`.

Run `npm test` and `npm run lint` before opening a PR. Run `npm run build` whenever you touch `vite.config.js`, the two HTML entry points, routing, env loading, or anything production-only.

## Coding Style & Naming Conventions

- JavaScript ES modules, React function components, JSX.
- Two-space indent, single quotes, no semicolons, trailing commas where already used.
- Components and component files: PascalCase (`AdminPortalPage.jsx`).
- Utilities and services: camelCase (`formValidation.js`).
- Keep feature code inside `src/features/<area>/`; promote to `src/shared/` or `src/lib/` only when broadly reused.

## Testing Guidelines

- `node:test` with `node:assert/strict`. Tests live next to source as `*.test.js` (e.g. `src/lib/formValidation.test.js`).
- Focus on validation, ID generation, and service logic in `src/lib/`.
- Add or update tests when changing behavior of `src/lib/` or other shared modules.

## Security & Configuration Tips

- Only `VITE_*` env vars are exposed to the client (see `envPrefix` in `vite.config.js`). `CLOUDFLARE_*` is also read but not auto-injected.
- Required client vars at minimum: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. `isSupabaseConfigured` in `src/lib/supabaseClient.js` gates every Supabase call; preserve the local-storage fallback in `src/lib/ticketService.js` unless removing it is the explicit task.
- Never commit `.env`; document required keys in `.env.example`.
- Supabase schema or policy changes must be mirrored in `supabase/*.sql` or `docs/supabase_schema_setup.sql`. RLS/role boundaries (client, staff, admin, CEO) are assumed to matter.
- Attachment uploads go through `src/lib/attachmentUtils.js`; keep bucket and account IDs in env vars, never in source.

## Commit & Pull Request Guidelines

No git history is available from this checkout, so use concise imperative commit messages (e.g. `Add ticket validation tests`, `Fix admin drawer status update`). PRs should include a brief summary, the commands run (`npm test`, `npm run lint`, `npm run build` as applicable), linked issues, and screenshots or recordings for visible UI changes.

## Specialist Agent Team

A four-person specialist team is defined for this repo in `.claude/agents/` (Claude Code) and mirrored in `.opencode/agents/` (OpenCode):

- `project-manager` scopes requests, plans work, assigns owners.
- `frontend-senior` owns React/Vite UI, a11y, responsive layout, client-side state in `src/app/`, `src/ops/`, `src/features/`, `src/shared/components/`, `src/layout/`, `src/content/`, `src/config/`, `src/styles/`.
- `backend-engineer` owns `src/lib/ticketService.js`, `src/lib/supabaseClient.js`, `src/lib/attachmentUtils.js`, shared validators, and `supabase/*.sql` / `docs/supabase_schema_setup.sql`.
- `audit-qa` reviews for correctness, security, a11y, regression risk, and test coverage; reports findings, does not modify app source unless asked.

Start medium/large requests with `project-manager`; send finished work to `audit-qa` before merge.