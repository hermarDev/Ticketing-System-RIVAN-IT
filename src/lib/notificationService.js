/**
 * Notification Service for NetOps Ticket Desk
 * Synthesizes clean Web Audio chimes for new chat replies and status updates.
 * Provides Toast notification listeners and unread badge counters.
 */

// Web Audio API Chime Generator (No external audio file download required)
/**
 * Plays a Web Audio API chime for the given notification type.
 * @param {'chat'|'status'} [type='chat'] - Type of chime to play
 * @returns {void}
 */
export function playNotificationSound(type = 'chat') {
  if (typeof window === 'undefined') return

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    const now = ctx.currentTime

    if (type === 'chat') {
      // Pleasant double-chime (E5 -> B5)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(659.25, now) // E5
      osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.1) // B5

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc.start(now)
      osc.stop(now + 0.35)
    } else if (type === 'status') {
      // Soft success chime (C5 -> E5 -> G5)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, now)
      osc.frequency.setValueAtTime(659.25, now + 0.08)
      osc.frequency.setValueAtTime(783.99, now + 0.16)

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

      osc.start(now)
      osc.stop(now + 0.45)
    }
  } catch (err) {
    // Web Audio blocked before user interaction — silent fallback
  }
}

// Idempotency cache to prevent duplicate notifications within 3 seconds
const recentNotifications = new Map()

// Active ticket IDs set to suppress toasts when user is actively inside the chatbox
const activeTicketIds = new Set()

/**
 * Sets the currently active ticket thread ID(s) to suppress toast notifications for that ticket.
 * @param {string|Object|null} idOrTicket - Ticket UUID string, ticket object, or null to clear
 * @returns {void}
 */
export function setActiveTicketId(idOrTicket) {
  activeTicketIds.clear()
  if (!idOrTicket) return

  if (typeof idOrTicket === 'object') {
    if (idOrTicket.id) activeTicketIds.add(String(idOrTicket.id))
    if (idOrTicket.ticketNumber) activeTicketIds.add(String(idOrTicket.ticketNumber))
    if (idOrTicket.ticket_number) activeTicketIds.add(String(idOrTicket.ticket_number))
  } else {
    activeTicketIds.add(String(idOrTicket))
  }
}

/**
 * Returns true if the given ticket ID is currently active (user is viewing it).
 * @param {string} ticketId - Ticket UUID or ticket number to check
 * @returns {boolean}
 */
export function isTicketActive(ticketId) {
  if (!ticketId) return false
  return activeTicketIds.has(String(ticketId))
}

/**
 * Dispatches a live notification toast, persists it to the log, and plays an audio chime.
 * @param {Object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body message
 * @param {'chat'|'status'|'info'} [options.type='info'] - Notification type
 * @param {string} [options.ticketId] - Related ticket ID for suppression checks
 * @returns {Object|null} Created notification payload, or null if suppressed/deduplicated
 */
export function dispatchNotification({ title, message, type = 'info', ticketId }) {
  if (typeof window === 'undefined') return null

  // Context-aware suppression: Do NOT show toast or chime if user is actively in the chatbox for this ticket
  if (ticketId && activeTicketIds.has(String(ticketId))) {
    return null
  }

  const cleanTitle = (title || '').trim()
  const cleanMsg = (message || '').trim()
  const cleanTicket = ticketId ? String(ticketId).trim() : ''
  // Deduplicate by message content and ticket ID within a 5-second window
  const key = cleanTicket ? `${cleanTicket}:${cleanMsg}` : cleanMsg
  const now = Date.now()
  const lastTime = recentNotifications.get(key)

  if (lastTime && now - lastTime < 5000) {
    // Block duplicate notification within 5 seconds
    return null
  }

  recentNotifications.set(key, now)

  // Prune old cache entries over 10 seconds
  if (recentNotifications.size > 50) {
    for (const [k, timestamp] of recentNotifications.entries()) {
      if (now - timestamp > 10000) recentNotifications.delete(k)
    }
  }

  const payload = {
    id: `notif-${now}-${Math.random().toString(36).substr(2, 4)}`,
    title: cleanTitle,
    message: cleanMsg,
    type, // 'chat' | 'status' | 'info'
    ticketId,
    timestamp: new Date().toISOString(),
    read: false,
  }

  // Save to persistent notification log
  const existingLogs = getNotificationLogs()
  saveNotificationLogs([payload, ...existingLogs])

  // Play audio chime
  playNotificationSound(type === 'status' ? 'status' : 'chat')

  // Dispatch custom browser event for reactive UI toasts
  window.dispatchEvent(new CustomEvent('netops_notification_received', { detail: payload }))
  return payload
}

// ─── Persistent Notification Logs Management ──────────────────────────────────
const NOTIFICATION_LOG_KEY = 'netops_notification_logs_v1'

/**
 * Retrieves the persisted notification log array from local storage.
 * @returns {Array} Array of notification payload objects
 */
export function getNotificationLogs() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(NOTIFICATION_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

/**
 * Persists the notification log array to local storage (capped at 50 entries) and dispatches an update event.
 * @param {Array} logs - Notification payload array to save
 * @returns {void}
 */
export function saveNotificationLogs(logs) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify(logs.slice(0, 50)))
    window.dispatchEvent(new CustomEvent('netops_notification_log_updated', { detail: logs }))
  } catch (e) {
    // silent fallback
  }
}

/**
 * Marks a single notification as read by its ID and persists the updated log.
 * @param {string} id - Notification ID to mark as read
 * @returns {Array} Updated notification log array
 */
export function markNotificationAsRead(id) {
  const logs = getNotificationLogs()
  const updated = logs.map((item) => (item.id === id ? { ...item, read: true } : item))
  saveNotificationLogs(updated)
  return updated
}

/**
 * Marks all notifications as read and persists the updated log.
 * @returns {Array} Updated notification log array with all items marked read
 */
export function markAllNotificationsAsRead() {
  const logs = getNotificationLogs()
  const updated = logs.map((item) => ({ ...item, read: true }))
  saveNotificationLogs(updated)
  return updated
}

/**
 * Clears all notification logs from local storage.
 * @returns {Array} Empty array
 */
export function clearNotificationLogs() {
  saveNotificationLogs([])
  return []
}

/**
 * Returns the count of unread notifications from the persisted log.
 * @returns {number}
 */
export function getUnreadNotificationCount() {
  const logs = getNotificationLogs()
  return logs.filter((n) => !n.read).length
}
