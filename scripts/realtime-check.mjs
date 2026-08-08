import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'
const root = process.cwd()
function loadEnvFile() {
  for (const file of ['.env', '.env.local']) {
    const path = `${root}/${file}`
    if (!existsSync(path)) continue
    const lines = readFileSync(path, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      if (!(key in process.env)) process.env[key] = value
    }
  }
}
loadEnvFile()
const url = process.env.DATABASE_URL
if (!url) { console.error('no DATABASE_URL'); process.exit(2) }
const client = new pg.Client({ connectionString: url })
await client.connect()

console.log('=== 1. supabase_realtime publication membership ===')
const pub = await client.query(`SELECT p.pubname, p.pubinsert, p.pubupdate, p.pubdelete, pt.schemaname, pt.tablename
  FROM pg_publication p LEFT JOIN pg_publication_tables pt ON pt.pubname = p.pubname
  WHERE p.pubname = 'supabase_realtime' ORDER BY pt.tablename`)
for (const r of pub.rows) console.log(JSON.stringify(r))

console.log('\n=== 2. replica identity of ticket_replies / tickets ===')
const ri = await client.query(`SELECT c.relname, c.relreplident FROM pg_class c WHERE c.relname IN ('ticket_replies','tickets') AND c.relnamespace = 'public'::regnamespace`)
for (const r of ri.rows) console.log(JSON.stringify(r))

console.log('\n=== 3. realtime.messages policies ===')
const pol = await client.query(`SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='realtime' AND tablename='messages'`)
for (const r of pol.rows) console.log(JSON.stringify({policyname:r.policyname, cmd:r.cmd, roles:r.roles, qual:(r.qual||'').slice(0,220), with_check:(r.with_check||'').slice(0,220)}))

console.log('\n=== 4. realtime.subscription table (active topics) ===')
try {
  const sub = await client.query(`SELECT count(*) AS n FROM realtime.subscription`)
  console.log('subscriptions:', JSON.stringify(sub.rows[0]))
} catch (e) { console.log('realtime.subscription query failed:', e.message) }

console.log('\n=== 5. ticket_replies RLS enabled + policies ===')
const rls = await client.query(`SELECT c.relname, c.relrowsecurity FROM pg_class c WHERE c.relname IN ('ticket_replies','tickets')`)
for (const r of rls.rows) console.log(JSON.stringify(r))
const pol2 = await client.query(`SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='ticket_replies'`)
for (const r of pol2.rows) console.log(JSON.stringify(r))

console.log('\n=== 6. Realtime extension table existence ===')
const ext = await client.query(`SELECT extname FROM pg_extension WHERE extname IN ('supabase_realtime','realtime')`)
for (const r of ext.rows) console.log(JSON.stringify(r))

await client.end()
