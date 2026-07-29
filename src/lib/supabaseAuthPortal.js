/**
 * Resolves which portal owns the current page load.
 * Ops is served from ops.html (dev + production multi-page build).
 * @param {string} [pathname]
 * @returns {'client' | 'ops'}
 */
export function resolveAuthPortal(pathname = '') {
  const path = String(pathname || '').toLowerCase()
  if (/(^|\/)ops\.html$/.test(path) || /(^|\/)ops\/?$/.test(path)) {
    return 'ops'
  }
  return 'client'
}

/**
 * Distinct localStorage keys so client (`/`) and ops (`ops.html`) keep
 * independent Supabase Auth sessions in the same browser profile.
 * @param {'client' | 'ops'} portal
 * @returns {string}
 */
export function getSupabaseAuthStorageKey(portal) {
  return portal === 'ops'
    ? 'sb-netops-auth-token-ops'
    : 'sb-netops-auth-token-client'
}
