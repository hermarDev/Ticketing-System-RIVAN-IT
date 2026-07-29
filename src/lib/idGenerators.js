/**
 * Generates a cryptographically secure client ID.
 * Format: CL-<12 hex chars> → 281 trillion possible values.
 */
export function generateClientId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `CL-${hex.toUpperCase()}`
}

/**
 * Generates a cryptographically secure ticket ID.
 * Format: NET-<16 hex chars> → 18 quintillion possible values.
 */
export function generateTicketId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `NET-${hex.toUpperCase()}`
}
