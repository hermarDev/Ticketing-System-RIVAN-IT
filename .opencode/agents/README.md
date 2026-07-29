# Ticketing System Agent Team (OpenCode)

This folder mirrors the Claude Code specialist team at `.claude/agents/` for OpenCode.

## Agents

- `project-manager`: scopes requests, creates delivery plans, assigns work, and defines acceptance criteria.
- `frontend-senior`: implements React/Vite UI, styling, accessibility, responsive behavior, and client-side state.
- `backend-engineer`: implements Supabase/data-layer work, auth boundaries, SQL/schema changes, storage, and service utilities.
- `audit-qa`: reviews code for bugs, security, accessibility, regression risk, and release readiness.

Invoke with `@agent-name` (e.g. `@audit-qa review the latest changes`).

## Recommended Workflow

1. Start with `project-manager` for any medium or large feature.
2. Send frontend tasks to `frontend-senior`.
3. Send database, auth, ticket service, notification, or attachment tasks to `backend-engineer`.
4. Send completed changes to `audit-qa` before release or merge.

Small, isolated changes can go directly to the relevant specialist.

## Local Validation

Agents should prefer these repository commands:

```bash
npm test
npm run lint
npm run build
```

Use `npm run dev` when a visual or browser workflow needs manual verification.