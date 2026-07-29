# Ticketing System Agent Team

This folder defines a four-person specialist team for this repository.

## Agents

- `project-manager`: scopes requests, creates delivery plans, assigns work, and defines acceptance criteria.
- `frontend-senior`: implements React/Vite UI, styling, accessibility, responsive behavior, and client-side state.
- `backend-engineer`: implements Supabase/data-layer work, auth boundaries, SQL/schema changes, storage, and service utilities.
- `audit-qa`: reviews code for bugs, security, accessibility, regression risk, and release readiness.

## Recommended Workflow

1. Start with `project-manager` for any medium or large feature.
2. Send frontend tasks to `frontend-senior`.
3. Send database, auth, ticket service, notification, or attachment tasks to `backend-engineer`.
4. Send completed changes to `audit-qa` before release or merge.

Small, isolated changes can go directly to the relevant specialist.

## Example Prompts

Use the Project Manager:

```text
Use the project-manager agent to plan a client ticket status tracking feature for this Ticketing System. Create tasks for frontend, backend, and QA with acceptance criteria.
```

Use the Senior Frontend Engineer:

```text
Use the frontend-senior agent to improve the admin ticket drawer layout. Preserve existing data services and run the relevant checks.
```

Use the Backend Engineer:

```text
Use the backend-engineer agent to add a ticket priority field through Supabase SQL and ticketService mappings. Include validation and migration notes.
```

Use Audit/QA:

```text
Use the audit-qa agent to review the latest ticket priority changes for security, accessibility, regressions, and missing tests.
```

## Local Validation

Agents should prefer these repository commands:

```bash
npm test
npm run lint
npm run build
```

Use `npm run dev` when a visual or browser workflow needs manual verification.
