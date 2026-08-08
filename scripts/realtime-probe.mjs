// Live realtime subscription test — checks whether postgres_changes + presence
// channels can join and receive events under current DB authz policies.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!(k in process.env)) process.env[k] = v
    }
  }
}
loadEnv()

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) { console.error('missing env'); process.exit(2) }

const supabase = createClient(url, anonKey)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. postgres_changes channel (as used by subscribeToTicketReplies)
console.log('--- Test 1: postgres_changes on ticket_replies (public channel) ---')
const ch1 = supabase.channel('ticket_chat_test_uuid_probe')
let ch1Status = 'never'
ch1
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_replies' }, (p) => {
    console.log('  [EVENT]', JSON.stringify(p).slice(0, 200))
  })
  .subscribe((status, err) => {
    ch1Status = status
    console.log('  status:', status, err ? JSON.stringify(err) : '')
  })
await wait(4000)
console.log('  final status:', ch1Status)
await supabase.removeChannel(ch1)

// 2. presence channel (private) as used by subscribeToTicketPresence
console.log('--- Test 2: presence channel (private) ---')
const ch2 = supabase.channel('ticket_presence_probe', { config: { private: true } })
let ch2Status = 'never'
ch2
  .on('presence', { event: 'sync' }, () => {})
  .subscribe((status, err) => {
    ch2Status = status
    console.log('  status:', status, err ? JSON.stringify(err) : '')
  })
await wait(4000)
console.log('  final status:', ch2Status)
await supabase.removeChannel(ch2)

// 3. presence channel NON-private (to compare)
console.log('--- Test 3: presence channel (public) ---')
const ch3 = supabase.channel('ticket_presence_probe_public')
let ch3Status = 'never'
ch3
  .on('presence', { event: 'sync' }, () => {})
  .subscribe((status, err) => {
    ch3Status = status
    console.log('  status:', status, err ? JSON.stringify(err) : '')
  })
await wait(4000)
console.log('  final status:', ch3Status)
await supabase.removeChannel(ch3)

// 4. all_tickets channel (public) as used by subscribeToAllTickets
console.log('--- Test 4: postgres_changes on tickets (public channel) ---')
const ch4 = supabase.channel('all_tickets_probe')
let ch4Status = 'never'
ch4
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {})
  .subscribe((status, err) => {
    ch4Status = status
    console.log('  status:', status, err ? JSON.stringify(err) : '')
  })
await wait(4000)
console.log('  final status:', ch4Status)
await supabase.removeChannel(ch4)

process.exit(0)
