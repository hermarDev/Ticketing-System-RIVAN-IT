import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

/*
 * notificationService.js relies on window, localStorage, and Web Audio APIs
 * which are unavailable in the Node test runner. We extract and test the pure
 * logic (deduplication, active ticket tracking, log management) in isolation.
 */

// ─── Pure logic extracted from notificationService.js ──────────────────────────

const recentNotifications = new Map()
const activeTicketIds = new Set()

function setActiveTicketId(idOrTicket) {
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

function isTicketActive(ticketId) {
  if (!ticketId) return false
  return activeTicketIds.has(String(ticketId))
}

function checkDedup(key) {
  const now = Date.now()
  const lastTime = recentNotifications.get(key)
  if (lastTime && now - lastTime < 5000) return true
  recentNotifications.set(key, now)
  return false
}

function markNotificationAsRead(id, logs) {
  return logs.map((item) => (item.id === id ? { ...item, read: true } : item))
}

function markAllNotificationsAsRead(logs) {
  return logs.map((item) => ({ ...item, read: true }))
}

function getUnreadNotificationCount(logs) {
  return logs.filter((n) => !n.read).length
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('setActiveTicketId / isTicketActive', () => {
  beforeEach(() => activeTicketIds.clear())

  it('should track a simple string ticket ID', () => {
    setActiveTicketId('ticket-123')
    assert.equal(isTicketActive('ticket-123'), true)
    assert.equal(isTicketActive('other'), false)
  })

  it('should track object with id, ticketNumber, ticket_number', () => {
    setActiveTicketId({ id: '1', ticketNumber: 'NET-001', ticket_number: 'NET-002' })
    assert.equal(isTicketActive('1'), true)
    assert.equal(isTicketActive('NET-001'), true)
    assert.equal(isTicketActive('NET-002'), true)
    assert.equal(isTicketActive('unknown'), false)
  })

  it('should clear previous tracking on new call', () => {
    setActiveTicketId('old')
    setActiveTicketId('new')
    assert.equal(isTicketActive('old'), false)
    assert.equal(isTicketActive('new'), true)
  })

  it('should clear all tracking when called with null', () => {
    setActiveTicketId('something')
    setActiveTicketId(null)
    assert.equal(isTicketActive('something'), false)
  })

  it('should return false for null/undefined/empty ticket ID', () => {
    assert.equal(isTicketActive(null), false)
    assert.equal(isTicketActive(undefined), false)
    assert.equal(isTicketActive(''), false)
  })

  it('should suppress notification when ticket is active and allowActive is false', () => {
    setActiveTicketId('ticket-123')
    const ticketId = 'ticket-123'
    const allowActive = false
    const isSuppressed = ticketId && isTicketActive(ticketId) && !allowActive
    assert.equal(isSuppressed, true)
  })

  it('should NOT suppress notification when allowActive is true even if ticket is active', () => {
    setActiveTicketId('ticket-123')
    const ticketId = 'ticket-123'
    const allowActive = true
    const isSuppressed = ticketId && isTicketActive(ticketId) && !allowActive
    assert.equal(isSuppressed, false)
  })
})

describe('notification deduplication', () => {
  beforeEach(() => recentNotifications.clear())

  it('should not block the first notification', () => {
    assert.equal(checkDedup('msg-1'), false)
  })

  it('should block duplicate within 5 seconds', () => {
    checkDedup('msg-1')
    assert.equal(checkDedup('msg-1'), true)
  })

  it('should not block different keys', () => {
    checkDedup('msg-1')
    assert.equal(checkDedup('msg-2'), false)
  })
})

describe('markNotificationAsRead', () => {
  it('should mark a specific notification as read', () => {
    const logs = [
      { id: 'a', read: false },
      { id: 'b', read: false },
    ]
    const updated = markNotificationAsRead('a', logs)
    assert.equal(updated[0].read, true)
    assert.equal(updated[1].read, false)
  })

  it('should not mutate the original array', () => {
    const logs = [{ id: 'a', read: false }]
    const updated = markNotificationAsRead('a', logs)
    assert.equal(logs[0].read, false)
    assert.equal(updated[0].read, true)
  })
})

describe('markAllNotificationsAsRead', () => {
  it('should mark all notifications as read', () => {
    const logs = [
      { id: 'a', read: false },
      { id: 'b', read: false },
    ]
    const updated = markAllNotificationsAsRead(logs)
    assert.equal(updated.every((n) => n.read), true)
  })
})

describe('getUnreadNotificationCount', () => {
  it('should count unread notifications', () => {
    const logs = [
      { id: 'a', read: false },
      { id: 'b', read: true },
      { id: 'c', read: false },
    ]
    assert.equal(getUnreadNotificationCount(logs), 2)
  })

  it('should return 0 when all are read', () => {
    assert.equal(getUnreadNotificationCount([{ id: 'a', read: true }]), 0)
  })

  it('should return 0 for empty array', () => {
    assert.equal(getUnreadNotificationCount([]), 0)
  })
})

describe('role counterparty detection logic', () => {
  it('should treat client as counterparty when receiver is staff/admin/ceo', () => {
    const isClient = false // Admin/Staff user
    const senderRole = 'client'
    const isCounterparty = isClient ? senderRole !== 'client' : senderRole === 'client'
    assert.equal(isCounterparty, true)
  })

  it('should not treat staff as counterparty when receiver is staff/admin', () => {
    const isClient = false
    const senderRole = 'staff'
    const isCounterparty = isClient ? senderRole !== 'client' : senderRole === 'client'
    assert.equal(isCounterparty, false)
  })

  it('should treat staff as counterparty when receiver is client', () => {
    const isClient = true
    const senderRole = 'staff'
    const isCounterparty = isClient ? senderRole !== 'client' : senderRole === 'client'
    assert.equal(isCounterparty, true)
  })
})
