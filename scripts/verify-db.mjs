#!/usr/bin/env node
/**
 * Supabase DB verification harness.
 *
 * Connects to the Supabase Postgres database and verifies the 7 migration
 * checks (profiles RLS hardening, priority/urgency columns, CHECK constraints,
 * anti-tamper trigger, staff-creation function, Gmail columns, attachments
 * bucket + storage policies). Prints PASS/FAIL per check and exits non-zero
 * on any failure.
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres \
 *     npm run verify:db
 *
 * Or put DATABASE_URL in .env.local (gitignored) at the repo root.
 * Connection string: Supabase Dashboard → Project Settings → Database →
 * Connection string (use the "Transaction" pooler, port 6543, or the direct
 * connection on port 5432).
 *
 * The script only ever runs SELECT queries — it never modifies the database.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── Load .env then .env.local (both gitignored), without overwriting real env ──
// Precedence: real environment > .env.local > .env
function loadEnvFile() {
  const files = ['.env', '.env.local']
  for (const file of files) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    const lines = readFileSync(path, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      // Strip surrounding single/double quotes (common when pasted from dashboards)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = value
    }
  }
}

loadEnvFile()

const DATABASE_URL = process.env.DATABASE_URL ?? ''

if (!DATABASE_URL) {
  console.error('✖ DATABASE_URL is not set.')
  console.error('  Add it to .env.local at the repo root, e.g.:')
  console.error('  DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres')
  console.error('  (Supabase Dashboard → Project Settings → Database → Connection string)')
  process.exit(2)
}

// ── Check registry ──────────────────────────────────────────────────────────
// Each check: { name, sql, expect } where expect receives rows and returns
// { pass: bool, detail: string }
const checks = [
  {
    name: 'Profiles RLS: UPDATE policy is role-locked (no NULL with_check)',
    sql: `SELECT policyname, with_check IS NULL AS null_check, with_check
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'UPDATE'`,
    expect(rows) {
      if (rows.length === 0) {
        return { pass: false, detail: 'no UPDATE policy found on public.profiles' }
      }
      const vulnerable = rows.filter((r) => r.null_check)
      if (vulnerable.length > 0) {
        return {
          pass: false,
          detail: `policy "${vulnerable[0].policyname}" has NULL with_check — role self-escalation possible`,
        }
      }
      const hardened = rows.some((r) => /role\s*=\s*\(/i.test(r.with_check ?? ''))
      return hardened
        ? { pass: true, detail: rows.map((r) => r.policyname).join(', ') }
        : { pass: false, detail: 'with_check present but does not lock role' }
    },
  },
  {
    name: 'Tickets: priority/urgency columns exist',
    sql: `SELECT column_name, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tickets'
            AND column_name IN ('client_urgency', 'priority_updated_at', 'priority_updated_by')`,
    expect(rows) {
      const names = new Set(rows.map((r) => r.column_name))
      const missing = ['client_urgency', 'priority_updated_at', 'priority_updated_by'].filter(
        (c) => !names.has(c),
      )
      if (missing.length > 0) {
        return { pass: false, detail: `missing: ${missing.join(', ')}` }
      }
      const urgency = rows.find((r) => r.column_name === 'client_urgency')
      const defaultOk = /Normal/.test(urgency?.column_default ?? '')
      return {
        pass: defaultOk,
        detail: defaultOk
          ? 'all present, client_urgency default = Normal'
          : 'columns present but client_urgency default missing',
      }
    },
  },
  {
    name: 'Tickets: client_urgency CHECK constraint',
    sql: `SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'public.tickets'::regclass AND contype = 'c'`,
    expect(rows) {
      const names = new Set(rows.map((r) => r.conname))
      if (names.has('tickets_client_urgency_check')) {
        return { pass: true, detail: 'tickets_client_urgency_check present' }
      }
      return { pass: false, detail: 'tickets_client_urgency_check missing' }
    },
  },
  {
    name: 'Tickets: anti-tamper trigger',
    sql: `SELECT tgname
          FROM pg_trigger
          WHERE tgrelid = 'public.tickets'::regclass AND NOT tgisinternal`,
    expect(rows) {
      if (rows.some((r) => r.tgname === 'tickets_enforce_create_defaults')) {
        return { pass: true, detail: 'tickets_enforce_create_defaults present' }
      }
      return { pass: false, detail: 'tickets_enforce_create_defaults missing' }
    },
  },
  {
    name: 'admin_create_staff_profile SECURITY DEFINER function',
    sql: `SELECT prosecdef
          FROM pg_proc
          WHERE proname = 'admin_create_staff_profile' AND pronamespace = 'public'::regnamespace`,
    expect(rows) {
      if (rows.length === 0) {
        return { pass: false, detail: 'function not found' }
      }
      const ok = rows[0].prosecdef === true
      return ok
        ? { pass: true, detail: 'exists, SECURITY DEFINER' }
        : { pass: false, detail: 'exists but is NOT SECURITY DEFINER' }
    },
  },
  {
    name: 'Clients: Gmail columns',
    sql: `SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'clients'
            AND column_name IN ('gmail_send_enabled', 'gmail_reply_to')`,
    expect(rows) {
      const names = new Set(rows.map((r) => r.column_name))
      const missing = ['gmail_send_enabled', 'gmail_reply_to'].filter((c) => !names.has(c))
      return missing.length === 0
        ? { pass: true, detail: 'gmail_send_enabled, gmail_reply_to present' }
        : { pass: false, detail: `missing: ${missing.join(', ')}` }
    },
  },
  {
    name: 'Storage: attachments bucket + policies',
    sql: `SELECT b.id, b.public, b.file_size_limit,
                 p.policyname, p.cmd
          FROM storage.buckets b
          LEFT JOIN pg_policies p
            ON p.schemaname = 'storage' AND p.tablename = 'objects'
           AND p.policyname LIKE 'Attachments%'
          WHERE b.id = 'attachments'`,
    expect(rows) {
      if (rows.length === 0) {
        return { pass: false, detail: 'bucket "attachments" not found' }
      }
      const bucket = rows[0]
      const problems = []
      if (bucket.public !== true) problems.push('bucket not public')
      if (Number(bucket.file_size_limit) !== 10485760) problems.push('file_size_limit != 10 MiB')
      const policyCmds = new Set(rows.filter((r) => r.policyname).map((r) => r.cmd))
      for (const cmd of ['INSERT', 'SELECT', 'UPDATE', 'DELETE']) {
        if (!policyCmds.has(cmd)) problems.push(`missing Attachments ${cmd} policy`)
      }
      return problems.length === 0
        ? { pass: true, detail: 'bucket + INSERT/SELECT/UPDATE/DELETE policies present' }
        : { pass: false, detail: problems.join('; ') }
    },
  },
]

// ── Run ─────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DATABASE_URL })

try {
  await client.connect()
} catch (err) {
  console.error('✖ Could not connect to database:')
  console.error(`  ${err.message}`)
  console.error('  Check DATABASE_URL — it must be a postgresql:// connection string for your Supabase project.')
  process.exit(2)
}

console.log('Supabase DB verification\n')

let passCount = 0
const failures = []

for (const check of checks) {
  try {
    const res = await client.query(check.sql)
    const { pass, detail } = check.expect(res.rows)
    if (pass) {
      passCount += 1
      console.log(`  ✓ ${check.name}`)
      console.log(`      ${detail}`)
    } else {
      failures.push({ name: check.name, detail })
      console.log(`  ✖ ${check.name}`)
      console.log(`      ${detail}`)
    }
  } catch (err) {
    failures.push({ name: check.name, detail: err.message })
    console.log(`  ✖ ${check.name}`)
    console.log(`      query error: ${err.message}`)
  }
}

await client.end()

console.log('')
console.log(`Result: ${passCount}/${checks.length} checks passed`)

if (failures.length > 0) {
  console.log('Failed checks:')
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.detail}`)
  }
  process.exit(1)
}

console.log('All migration checks passed — the Supabase DB matches the expected state.')
process.exit(0)
