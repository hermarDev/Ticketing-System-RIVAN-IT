/**
 * Notification Service for NetOps Ticket Desk
 * Synthesizes clean Web Audio chimes for new chat replies and status updates.
 * Provides Desktop HTML5 notifications, Toast notification listeners, and unread badge counters.
 */

// Web Audio API Singleton & Auto-Unlock System
let sharedAudioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!sharedAudioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext
    if (AudioCtxClass) {
      sharedAudioCtx = new AudioCtxClass()
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {})
  }
  return sharedAudioCtx
}

// Auto-unlock Web Audio on user gesture anywhere on the window
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {})
    }
  }
  window.addEventListener('click', unlockAudio, { passive: true })
  window.addEventListener('keydown', unlockAudio, { passive: true })
  window.addEventListener('touchstart', unlockAudio, { passive: true })
  window.addEventListener('pointerdown', unlockAudio, { passive: true })
}

/**
 * Requests browser HTML5 notification permissions.
 * @returns {Promise<string>} 'granted' | 'denied' | 'default'
 */
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }
  try {
    const perm = await Notification.requestPermission()
    return perm
  } catch {
    return Notification.permission || 'denied'
  }
}

/**
 * Checks current browser desktop notification permission state.
 * @returns {string} 'granted' | 'denied' | 'default' | 'unsupported'
 */
export function getNotificationPermissionState() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

/**
 * Dispatches a native browser desktop notification if permission is granted.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.ticketId]
 */
export function sendDesktopNotification({ title, message, ticketId }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    const notif = new Notification(title, {
      body: message,
      icon: '/favicon.ico',
      tag: ticketId ? `netops-ticket-${ticketId}` : undefined,
      renotify: true,
    })

    notif.onclick = () => {
      window.focus()
      if (ticketId) {
        window.dispatchEvent(new CustomEvent('netops_open_ticket', { detail: { ticketId } }))
      }
      notif.close()
    }
  } catch {
    // silent fallback if Notification constructor throws in restricted contexts
  }
}

/**
 * Plays a Web Audio API chime for the given notification type.
 * @param {'chat'|'status'} [type='chat'] - Type of chime to play
 * @returns {void}
 */
export function playNotificationSound(type = 'chat') {
  if (typeof window === 'undefined') return

  try {
    const ctx = getAudioContext()
    if (!ctx) return

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
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02)
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
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

      osc.start(now)
      osc.stop(now + 0.45)
    }
  } catch {
    // Web Audio blocked before user interaction — silent fallback
  }
}

// Idempotency cache to prevent duplicate notifications within 5 seconds
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
 * Dispatches a live notification toast, persists it to the log, sends desktop alert, and plays an audio chime.
 * @param {Object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body message
 * @param {'chat'|'status'|'info'} [options.type='info'] - Notification type
 * @param {string} [options.ticketId] - Related ticket ID for suppression checks
 * @param {boolean} [options.allowActive=false] - If true, dispatches notification even if ticket is currently active
 * @returns {Object|null} Created notification payload, or null if suppressed/deduplicated
 */
export function dispatchNotification({ title, message, type = 'info', ticketId, allowActive = false }) {
  if (typeof window === 'undefined') return null

  // Context-aware suppression: Do NOT show toast or chime if user is actively in the chatbox for this ticket, unless allowActive is true
  if (ticketId && activeTicketIds.has(String(ticketId)) && !allowActive) {
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

  // Send Desktop HTML5 notification
  sendDesktopNotification({ title: cleanTitle, message: cleanMsg, ticketId })

  // Dispatch custom browser event for reactive UI toasts
  window.dispatchEvent(new CustomEvent('netops_notification_received', { detail: payload }))

  // Cross-tab relay: broadcast notification to other browser tabs/windows
  try {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('netops_notifications')
      bc.postMessage({ type: 'CROSS_TAB_NOTIFICATION', payload })
      setTimeout(() => bc.close(), 500)
    }
  } catch {
    // silent — BroadcastChannel unsupported or blocked
  }

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
  } catch {
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
  } catch {
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

