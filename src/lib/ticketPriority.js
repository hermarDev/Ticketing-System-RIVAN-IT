/**
 * Shared urgency / priority helpers for ticket create, triage, and display.
 * Storage enums are locked — do not invent synonyms.
 */

export const CLIENT_URGENCIES = Object.freeze(['Low', 'Normal', 'High', 'Critical'])
export const TICKET_PRIORITIES = Object.freeze(['Low', 'Medium', 'High', 'Urgent'])

const CLIENT_URGENCY_SET = new Set(CLIENT_URGENCIES)
const TICKET_PRIORITY_SET = new Set(TICKET_PRIORITIES)

/** Auto-triage: Critical never maps to Urgent (anti-inflation). */
const URGENCY_TO_PRIORITY = Object.freeze({
  Critical: 'High',
  High: 'Medium',
  Normal: 'Medium',
  Low: 'Low',
})

/** Legacy ops priority → client urgency (same as SQL backfill). */
const PRIORITY_TO_URGENCY = Object.freeze({
  Low: 'Low',
  Medium: 'Normal',
  High: 'High',
  Urgent: 'Critical',
})

/**
 * Validates / normalizes a client urgency enum value.
 * @param {*} urgency
 * @returns {string|null} Canonical urgency or null if invalid
 */
export function normalizeClientUrgency(urgency) {
  if (typeof urgency !== 'string') return null
  const trimmed = urgency.trim()
  if (!trimmed) return null
  return CLIENT_URGENCY_SET.has(trimmed) ? trimmed : null
}

/**
 * Validates / normalizes an operational priority enum value.
 * @param {*} priority
 * @returns {string|null} Canonical priority or null if invalid
 */
export function normalizeTicketPriority(priority) {
  if (typeof priority !== 'string') return null
  const trimmed = priority.trim()
  if (!trimmed) return null
  return TICKET_PRIORITY_SET.has(trimmed) ? trimmed : null
}

/**
 * Maps validated client urgency to initial ops priority (auto-triage).
 * @param {string} urgency - Canonical client urgency
 * @returns {string} Ops priority (defaults to Medium for unknown)
 */
export function mapUrgencyToPriority(urgency) {
  return URGENCY_TO_PRIORITY[urgency] || 'Medium'
}

/**
 * Maps legacy ops priority to client urgency (backfill / legacy POST).
 * @param {string} priority - Canonical or legacy ops priority
 * @returns {string|null} Urgency or null if priority is not a known ops value
 */
export function mapPriorityToUrgency(priority) {
  if (typeof priority !== 'string') return null
  const trimmed = priority.trim()
  return PRIORITY_TO_URGENCY[trimmed] || null
}

/**
 * Display fallback for client urgency on legacy rows.
 * @param {Object|null|undefined} ticket
 * @returns {string}
 */
export function resolveClientUrgencyDisplay(ticket) {
  if (!ticket || typeof ticket !== 'object') return 'Normal'

  // When ops staff triages priority, prefer deriving urgency from ops `priority`
  // so the UI reflects the override (even if `client_urgency` remains unchanged).
  const hasOpsPriorityOverride = Boolean(ticket.priority_updated_at ?? ticket.priorityUpdatedAt)
  if (hasOpsPriorityOverride) {
    const fromPriority = mapPriorityToUrgency(ticket.priority)
    return fromPriority || 'Normal'
  }

  const direct = normalizeClientUrgency(ticket.clientUrgency ?? ticket.client_urgency)
  if (direct) return direct

  const fromPriority = mapPriorityToUrgency(ticket.priority)
  return fromPriority || 'Normal'
}

/**
 * Resolves create-time urgency + derived ops priority from ticket form data.
 * Ignores client-supplied priority for the ops column; may use legacy priority
 * only as an urgency input when no urgency field is present.
 *
 * @param {Object} ticketData
 * @returns {{ clientUrgency: string, priority: string }}
 * @throws {Error} When an explicit urgency value is present but invalid
 */
export function resolveCreateUrgencyAndPriority(ticketData = {}) {
  const rawUrgency =
    ticketData.clientUrgency ?? ticketData.client_urgency ?? ticketData.urgency

  let clientUrgency = normalizeClientUrgency(rawUrgency)

  if (rawUrgency != null && String(rawUrgency).trim() !== '' && !clientUrgency) {
    throw new Error(
      `Invalid client urgency: ${typeof rawUrgency === 'string' ? rawUrgency : String(rawUrgency)}`,
    )
  }

  if (!clientUrgency) {
    const legacyPriority = ticketData.priority
    if (legacyPriority != null && String(legacyPriority).trim() !== '') {
      const mapped = mapPriorityToUrgency(
        typeof legacyPriority === 'string' ? legacyPriority : String(legacyPriority),
      )
      if (!mapped) {
        throw new Error(
          `Invalid legacy priority for urgency mapping: ${typeof legacyPriority === 'string' ? legacyPriority : String(legacyPriority)}`,
        )
      }
      clientUrgency = mapped
    } else {
      clientUrgency = 'Normal'
    }
  }

  return {
    clientUrgency,
    priority: mapUrgencyToPriority(clientUrgency),
  }
}

/**
 * Applies a staff priority override to a local tickets array (match id / ticketNumber).
 * Pure helper for tests and local-storage path parity.
 *
 * @param {Array} tickets
 * @param {string} ticketId
 * @param {string} priority - Canonical ops priority
 * @param {string|null|undefined} staffIdentity - email/name string for priority_updated_by
 * @param {string} [updatedAt] - ISO timestamp
 * @returns {Array}
 */
export function applyLocalPriorityUpdate(
  tickets,
  ticketId,
  priority,
  staffIdentity,
  updatedAt = new Date().toISOString(),
) {
  const by =
    typeof staffIdentity === 'string' && staffIdentity.trim()
      ? staffIdentity.trim()
      : staffIdentity == null
        ? null
        : String(staffIdentity)

  return (tickets || []).map((t) => {
    const isMatch =
      String(t.id) === String(ticketId) ||
      String(t.ticketNumber) === String(ticketId) ||
      String(t.ticket_number) === String(ticketId)
    if (!isMatch) return t
    return {
      ...t,
      priority,
      priorityUpdatedAt: updatedAt,
      priority_updated_at: updatedAt,
      priorityUpdatedBy: by,
      priority_updated_by: by,
      updatedAt,
    }
  })
}
