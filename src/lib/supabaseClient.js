import { createClient } from '@supabase/supabase-js'
import {
  getSupabaseAuthStorageKey,
  resolveAuthPortal,
} from './supabaseAuthPortal'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export { getSupabaseAuthStorageKey, resolveAuthPortal }

function detectAuthPortal() {
  if (typeof window === 'undefined') return 'client'
  return resolveAuthPortal(window.location.pathname)
}

const authPortal = detectAuthPortal()
const authStorageKey = getSupabaseAuthStorageKey(authPortal)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: authStorageKey,
      },
    })
  : null

/**
 * Clears only this portal's local auth session (does not revoke refresh tokens
 * server-wide). Prefer this when ops rejects a non-staff session so a concurrent
 * client-portal login in the same browser profile is not invalidated.
 * Frontend call sites (e.g. AdminPortalPage) should use this instead of
 * `supabase.auth.signOut()` for privilege-rejection paths.
 * @returns {Promise<void>}
 */
export async function signOutLocal() {
  if (!supabase) return
  await supabase.auth.signOut({ scope: 'local' })
}
