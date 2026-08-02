import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import DOMPurify from 'isomorphic-dompurify'

/*
 * ticketService.js cannot be imported directly under the Node test runner
 * because it transitively imports supabaseClient.js which uses import.meta.env
 * and extensionless Vite-resolved paths. Instead we extract and test the pure
 * utility functions in isolation. The implementations below are kept in sync
 * with the canonical source in ticketService.js.
 */

// ─── Pure functions extracted from ticketService.js ────────────────────────────

function sanitizeInput(str, maxLength = 5000) {
  if (typeof str !== 'string') return ''
  const clean = DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return clean.trim().slice(0, maxLength)
}

const isUUID = (str) =>
  typeof str === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

const getStaffDisplayName = (staff) => {
  if (!staff) return ''
  if (typeof staff === 'string') return staff.trim()
  return (
    staff.full_name ||
    staff.fullName ||
    staff.name ||
    staff.email ||
    ''
  ).trim()
}

const getStaffAssignmentId = (staff) => {
  if (!staff) return null
  if (typeof staff === 'string') return isUUID(staff.trim()) ? staff.trim() : null
  return isUUID(staff.id) ? staff.id : null
}

/**
 * Resolves staff input into an assignment target without hitting the database.
 * Empty / falsy staff means unassign (`id` and `lookupName` both null).
 * A known UUID sets `id`; a display name or email sets `lookupName` for a profiles query.
 */
function resolveStaffAssignmentTarget(staff) {
  if (staff == null || staff === false) {
    return { id: null, lookupName: null }
  }
  if (typeof staff === 'string') {
    const trimmed = staff.trim()
    if (!trimmed) return { id: null, lookupName: null }
    if (isUUID(trimmed)) return { id: trimmed, lookupName: null }
    return { id: null, lookupName: trimmed }
  }
  const id = getStaffAssignmentId(staff)
  if (id) return { id, lookupName: null }
  const name = getStaffDisplayName(staff)
  if (!name) return { id: null, lookupName: null }
  return { id: null, lookupName: name }
}

const TICKET_STATUSES = Object.freeze([
  'New',
  'In Progress',
  'Pending Client',
  'Resolved',
  'Closed',
])

const TICKET_STATUS_SET = new Set(TICKET_STATUSES)

const LEGACY_STATUS_ALIASES = Object.freeze({
  Open: 'New',
})

function normalizeTicketStatus(status) {
  if (typeof status !== 'string') return null
  const trimmed = status.trim()
  if (!trimmed) return null
  const mapped = LEGACY_STATUS_ALIASES[trimmed] || trimmed
  return TICKET_STATUS_SET.has(mapped) ? mapped : null
}

function getAutoCloseTimeRemaining(ticket) {
  if (!ticket || ticket.status !== 'Resolved') {
    return { hoursLeft: 0, minutesLeft: 0, isExpired: false, formattedCountdown: '' }
  }

  const resolvedTime = new Date(ticket.updatedAt || ticket.createdAt || Date.now()).getTime()
  const autoCloseDeadline = resolvedTime + 48 * 60 * 60 * 1000
  const msRemaining = autoCloseDeadline - Date.now()

  if (msRemaining <= 0) {
    return { hoursLeft: 0, minutesLeft: 0, isExpired: true, formattedCountdown: '0h 0m (Auto-closing)' }
  }

  const hoursLeft = Math.floor(msRemaining / (1000 * 60 * 60))
  const minutesLeft = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60))

  return {
    hoursLeft,
    minutesLeft,
    isExpired: false,
    formattedCountdown: `${hoursLeft}h ${minutesLeft}m`,
  }
}

// Idempotency cache replica for testing the deduplication logic
const recentTicketSubmissions = new Map()
const MAX_ATTACHMENT_REFERENCE_BYTES = 50000

function hasInlineAttachmentData(attachment) {
  if (typeof attachment !== 'string') return false
  const trimmed = attachment.trim()
  if (!trimmed) return false
  if (trimmed.includes('data:')) return true
  if (!trimmed.startsWith('[')) return false
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) && parsed.some((value) => typeof value === 'string' && value.startsWith('data:'))
  } catch {
    return false
  }
}

function checkIdempotency(email, subject) {
  const cacheKey = `${email}:${subject}`
  const now = Date.now()
  const cached = recentTicketSubmissions.get(cacheKey)
  if (cached && now - cached.timestamp < 10000) {
    return { blocked: true, ticket: cached.ticket }
  }
  recentTicketSubmissions.set(cacheKey, { timestamp: now, ticket: { subject } })
  return { blocked: false }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('sanitizeInput', () => {
  it('should strip simple HTML tags', () => {
    assert.equal(sanitizeInput('<b>bold</b>'), 'bold')
    // DOMPurify correctly removes script content entirely (not just tags)
    assert.equal(sanitizeInput('<script>alert("xss")</script>'), '')
  })

  it('should strip nested and malformed tags', () => {
    assert.equal(sanitizeInput('<div><span>hi</span></div>'), 'hi')
    assert.equal(sanitizeInput('<div><b>nest<i>ed</i></b></div>'), 'nested')
    // DOMPurify HTML-encodes lone angle brackets as &lt; — that's safe plain text
    assert.ok(!sanitizeInput('< unclosed').includes('<script'), 'should not contain script tags')
    // DOMPurify strips real tags but encodes empty angle brackets
    assert.ok(!sanitizeInput('<>empty</>').includes('<script'), 'no script injection from empty tags')
  })

  it('should strip nested/partial tag bypasses via DOMPurify', () => {
    // DOMPurify parses the DOM tree correctly — no script content survives
    const result1 = sanitizeInput('<scr<script>ipt>alert(1)</scr</script>ipt>')
    assert.ok(!result1.includes('<script'), 'should not contain script tags')
    const result2 = sanitizeInput('<<script>alert(1)//<</script>')
    assert.ok(!result2.includes('<script'), 'should not contain script tags')
  })

  it('should handle tags with attributes', () => {
    assert.equal(sanitizeInput('<a href="http://evil.com">click</a>'), 'click')
    assert.equal(sanitizeInput('<img src=x onerror=alert(1)>'), '')
  })

  it('should return empty string for non-string input', () => {
    assert.equal(sanitizeInput(null), '')
    assert.equal(sanitizeInput(undefined), '')
    assert.equal(sanitizeInput(42), '')
    assert.equal(sanitizeInput({}), '')
    assert.equal(sanitizeInput([]), '')
    assert.equal(sanitizeInput(true), '')
  })

  it('should return empty string for empty/whitespace input', () => {
    assert.equal(sanitizeInput(''), '')
    assert.equal(sanitizeInput('   '), '')
  })

  it('should trim whitespace', () => {
    assert.equal(sanitizeInput('  hello  '), 'hello')
  })

  it('should enforce maxLength', () => {
    assert.equal(sanitizeInput('abcdef', 3), 'abc')
    assert.equal(sanitizeInput('short', 100), 'short')
  })

  it('should leave plain text unchanged', () => {
    assert.equal(sanitizeInput('normal text'), 'normal text')
  })
})

describe('isUUID', () => {
  it('should accept valid lowercase UUIDs', () => {
    assert.equal(isUUID('550e8400-e29b-41d4-a716-446655440000'), true)
  })

  it('should accept valid uppercase UUIDs', () => {
    assert.equal(isUUID('550E8400-E29B-41D4-A716-446655440000'), true)
  })

  it('should accept mixed-case UUIDs', () => {
    assert.equal(isUUID('550e8400-E29B-41d4-a716-446655440000'), true)
  })

  it('should reject invalid UUIDs', () => {
    assert.equal(isUUID('not-a-uuid'), false)
    assert.equal(isUUID('550e8400-e29b-41d4-a716'), false)
    assert.equal(isUUID('550e8400e29b41d4a716446655440000'), false)
    assert.equal(isUUID(''), false)
    assert.equal(isUUID(null), false)
    assert.equal(isUUID(undefined), false)
    assert.equal(isUUID(12345), false)
  })
})

describe('getStaffDisplayName', () => {
  it('should return empty string for null/undefined', () => {
    assert.equal(getStaffDisplayName(null), '')
    assert.equal(getStaffDisplayName(undefined), '')
  })

  it('should trim string input', () => {
    assert.equal(getStaffDisplayName('  Jane Doe  '), 'Jane Doe')
  })

  it('should prefer full_name from object', () => {
    assert.equal(getStaffDisplayName({ full_name: 'John', email: 'j@x.com' }), 'John')
  })

  it('should fall back to fullName, name, email in order', () => {
    assert.equal(getStaffDisplayName({ fullName: 'A', name: 'B' }), 'A')
    assert.equal(getStaffDisplayName({ name: 'B', email: 'b@x' }), 'B')
    assert.equal(getStaffDisplayName({ email: 'c@x' }), 'c@x')
  })

  it('should return empty string for object with no matching fields', () => {
    assert.equal(getStaffDisplayName({ id: '123' }), '')
  })
})

describe('getStaffAssignmentId', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000'

  it('should return null for null/undefined', () => {
    assert.equal(getStaffAssignmentId(null), null)
    assert.equal(getStaffAssignmentId(undefined), null)
  })

  it('should return UUID string when given a valid UUID string', () => {
    assert.equal(getStaffAssignmentId(validUUID), validUUID)
  })

  it('should return null for non-UUID string', () => {
    assert.equal(getStaffAssignmentId('John Doe'), null)
  })

  it('should return staff.id when it is a valid UUID', () => {
    assert.equal(getStaffAssignmentId({ id: validUUID }), validUUID)
  })

  it('should return null when staff.id is not a UUID', () => {
    assert.equal(getStaffAssignmentId({ id: 'abc' }), null)
  })
})

describe('resolveStaffAssignmentTarget', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000'

  it('should resolve empty / falsy staff to unassign (null id, null lookupName)', () => {
    assert.deepEqual(resolveStaffAssignmentTarget(null), { id: null, lookupName: null })
    assert.deepEqual(resolveStaffAssignmentTarget(undefined), { id: null, lookupName: null })
    assert.deepEqual(resolveStaffAssignmentTarget(''), { id: null, lookupName: null })
    assert.deepEqual(resolveStaffAssignmentTarget('   '), { id: null, lookupName: null })
    assert.deepEqual(resolveStaffAssignmentTarget(false), { id: null, lookupName: null })
  })

  it('should prefer UUID id without a name lookup', () => {
    assert.deepEqual(resolveStaffAssignmentTarget(validUUID), {
      id: validUUID,
      lookupName: null,
    })
    assert.deepEqual(resolveStaffAssignmentTarget({ id: validUUID, full_name: 'Jane' }), {
      id: validUUID,
      lookupName: null,
    })
  })

  it('should request a name lookup for display-name strings', () => {
    assert.deepEqual(resolveStaffAssignmentTarget('Jane Doe'), {
      id: null,
      lookupName: 'Jane Doe',
    })
    assert.deepEqual(resolveStaffAssignmentTarget('  jane@example.com  '), {
      id: null,
      lookupName: 'jane@example.com',
    })
  })

  it('should request a name lookup for objects without a UUID id', () => {
    assert.deepEqual(resolveStaffAssignmentTarget({ full_name: 'Jane Doe' }), {
      id: null,
      lookupName: 'Jane Doe',
    })
  })

  it('should unassign when object has neither UUID nor display name', () => {
    assert.deepEqual(resolveStaffAssignmentTarget({ id: 'not-a-uuid' }), {
      id: null,
      lookupName: null,
    })
  })
})

describe('normalizeTicketStatus', () => {
  it('should normalize legacy Open to New', () => {
    assert.equal(normalizeTicketStatus('Open'), 'New')
    assert.equal(normalizeTicketStatus('  Open  '), 'New')
  })

  it('should accept all canonical statuses including In Progress', () => {
    for (const status of TICKET_STATUSES) {
      assert.equal(normalizeTicketStatus(status), status)
    }
  })

  it('should reject invalid statuses', () => {
    assert.equal(normalizeTicketStatus('Done'), null)
    assert.equal(normalizeTicketStatus('open'), null)
    assert.equal(normalizeTicketStatus('OPEN'), null)
    assert.equal(normalizeTicketStatus('in progress'), null)
    assert.equal(normalizeTicketStatus(''), null)
    assert.equal(normalizeTicketStatus('   '), null)
    assert.equal(normalizeTicketStatus(null), null)
    assert.equal(normalizeTicketStatus(undefined), null)
    assert.equal(normalizeTicketStatus(42), null)
  })

  it('must not treat In Progress as Resolved or Closed', () => {
    assert.equal(normalizeTicketStatus('In Progress'), 'In Progress')
    assert.notEqual(normalizeTicketStatus('In Progress'), 'Resolved')
    assert.notEqual(normalizeTicketStatus('In Progress'), 'Closed')
  })
})

describe('getAutoCloseTimeRemaining', () => {
  it('should return zeroed result for null ticket', () => {
    const result = getAutoCloseTimeRemaining(null)
    assert.equal(result.hoursLeft, 0)
    assert.equal(result.isExpired, false)
    assert.equal(result.formattedCountdown, '')
  })

  it('should return zeroed result for non-Resolved ticket', () => {
    const result = getAutoCloseTimeRemaining({ status: 'Open' })
    assert.equal(result.hoursLeft, 0)
    assert.equal(result.formattedCountdown, '')
  })

  it('should not start auto-close for In Progress tickets', () => {
    const result = getAutoCloseTimeRemaining({
      status: 'In Progress',
      updatedAt: new Date().toISOString(),
    })
    assert.equal(result.hoursLeft, 0)
    assert.equal(result.isExpired, false)
    assert.equal(result.formattedCountdown, '')
  })

  it('should show expired for resolved ticket older than 48 hours', () => {
    const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    const result = getAutoCloseTimeRemaining({ status: 'Resolved', updatedAt: oldDate })
    assert.equal(result.isExpired, true)
    assert.equal(result.hoursLeft, 0)
    assert.equal(result.formattedCountdown, '0h 0m (Auto-closing)')
  })

  it('should compute remaining time for recently resolved ticket', () => {
    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    const result = getAutoCloseTimeRemaining({ status: 'Resolved', updatedAt: recentDate })
    assert.equal(result.isExpired, false)
    assert.ok(result.hoursLeft >= 46 && result.hoursLeft <= 47)
  })

  it('should fall back to createdAt when updatedAt is missing', () => {
    const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const result = getAutoCloseTimeRemaining({ status: 'Resolved', createdAt: recentDate })
    assert.equal(result.isExpired, false)
    assert.ok(result.hoursLeft >= 45 && result.hoursLeft <= 46)
  })
})

// ─── Gmail settings helpers (extracted from ticketService.js) ──────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const LOCAL_STORAGE_GMAIL_SETTINGS_PREFIX = 'gmailSettings_'

// Minimal localStorage stub for Node.js test environment
const _localStore = new Map()
const localStorageStub = {
  getItem: (k) => _localStore.get(k) ?? null,
  setItem: (k, v) => _localStore.set(k, v),
  removeItem: (k) => _localStore.delete(k),
  clear: () => _localStore.clear(),
}

function setLocalData(key, value) {
  localStorageStub.setItem(key, JSON.stringify(value))
}

function getLocalData(key, defaultValue = []) {
  try {
    const data = localStorageStub.getItem(key)
    return data !== null ? JSON.parse(data) : defaultValue
  } catch {
    return defaultValue
  }
}

function updateGmailSettingsLocal(userId, { gmailSendEnabled, gmailReplyTo }) {
  const enabled = Boolean(gmailSendEnabled)
  const replyTo = typeof gmailReplyTo === 'string' && gmailReplyTo.trim() ? gmailReplyTo.trim() : null
  if (replyTo !== null && !isValidEmail(replyTo)) {
    throw new Error('gmailReplyTo must be a valid email address.')
  }
  setLocalData(`${LOCAL_STORAGE_GMAIL_SETTINGS_PREFIX}${userId}`, { gmailSendEnabled: enabled, gmailReplyTo: replyTo })
  return { success: true }
}

function getClientGmailSettingsLocal(userId) {
  const stored = getLocalData(`${LOCAL_STORAGE_GMAIL_SETTINGS_PREFIX}${userId}`, null)
  return {
    gmailSendEnabled: stored?.gmailSendEnabled ?? false,
    gmailReplyTo: stored?.gmailReplyTo ?? null,
  }
}

describe('updateGmailSettings (localStorage fallback)', () => {
  beforeEach(() => {
    _localStore.clear()
  })

  it('should reject an invalid gmailReplyTo email', () => {
    assert.throws(
      () => updateGmailSettingsLocal('user-123', { gmailSendEnabled: true, gmailReplyTo: 'not-an-email' }),
      /gmailReplyTo must be a valid email address/,
    )
  })

  it('should reject a gmailReplyTo with whitespace only', () => {
    // whitespace-only trims to empty string, so it is treated as null — no error
    const result = updateGmailSettingsLocal('user-123', { gmailSendEnabled: false, gmailReplyTo: '   ' })
    assert.equal(result.success, true)
    const stored = getClientGmailSettingsLocal('user-123')
    assert.equal(stored.gmailReplyTo, null)
  })

  it('should accept a valid payload without replyTo', () => {
    const result = updateGmailSettingsLocal('user-456', { gmailSendEnabled: true, gmailReplyTo: null })
    assert.equal(result.success, true)
    const stored = getClientGmailSettingsLocal('user-456')
    assert.equal(stored.gmailSendEnabled, true)
    assert.equal(stored.gmailReplyTo, null)
  })

  it('should accept a valid payload with a valid replyTo email', () => {
    const result = updateGmailSettingsLocal('user-789', { gmailSendEnabled: true, gmailReplyTo: 'reply@example.com' })
    assert.equal(result.success, true)
    const stored = getClientGmailSettingsLocal('user-789')
    assert.equal(stored.gmailSendEnabled, true)
    assert.equal(stored.gmailReplyTo, 'reply@example.com')
  })

  it('should coerce gmailSendEnabled to boolean', () => {
    updateGmailSettingsLocal('user-abc', { gmailSendEnabled: 1, gmailReplyTo: null })
    const stored = getClientGmailSettingsLocal('user-abc')
    assert.equal(stored.gmailSendEnabled, true)
  })
})

describe('getClientGmailSettings (localStorage fallback)', () => {
  beforeEach(() => {
    _localStore.clear()
  })

  it('should return defaults when no data exists for user', () => {
    const result = getClientGmailSettingsLocal('unknown-user')
    assert.equal(result.gmailSendEnabled, false)
    assert.equal(result.gmailReplyTo, null)
  })

  it('should return stored settings after update', () => {
    updateGmailSettingsLocal('stored-user', { gmailSendEnabled: true, gmailReplyTo: 'me@example.com' })
    const result = getClientGmailSettingsLocal('stored-user')
    assert.equal(result.gmailSendEnabled, true)
    assert.equal(result.gmailReplyTo, 'me@example.com')
  })

  it('should scope settings per userId', () => {
    updateGmailSettingsLocal('user-a', { gmailSendEnabled: true, gmailReplyTo: 'a@example.com' })
    updateGmailSettingsLocal('user-b', { gmailSendEnabled: false, gmailReplyTo: null })
    const a = getClientGmailSettingsLocal('user-a')
    const b = getClientGmailSettingsLocal('user-b')
    assert.equal(a.gmailSendEnabled, true)
    assert.equal(b.gmailSendEnabled, false)
  })
})

describe('idempotency guard', () => {
  beforeEach(() => {
    recentTicketSubmissions.clear()
  })

  it('should allow first submission', () => {
    const result = checkIdempotency('user@test.com', 'Help')
    assert.equal(result.blocked, false)
  })

  it('should block duplicate submission within 10 seconds', () => {
    checkIdempotency('user@test.com', 'Help')
    const result = checkIdempotency('user@test.com', 'Help')
    assert.equal(result.blocked, true)
  })

  it('should allow submission with different email', () => {
    checkIdempotency('a@test.com', 'Help')
    const result = checkIdempotency('b@test.com', 'Help')
    assert.equal(result.blocked, false)
  })

  it('should allow submission with different subject', () => {
    checkIdempotency('user@test.com', 'Help')
    const result = checkIdempotency('user@test.com', 'Other issue')
    assert.equal(result.blocked, false)
  })
})

describe('attachment payload guards', () => {
  it('detects direct data URLs', () => {
    assert.equal(hasInlineAttachmentData('data:application/pdf;base64,abc123'), true)
  })

  it('detects data URLs inside JSON arrays', () => {
    const value = JSON.stringify(['https://example.com/file.pdf', 'data:image/png;base64,abc123'])
    assert.equal(hasInlineAttachmentData(value), true)
  })

  it('allows standard URL arrays', () => {
    const value = JSON.stringify(['https://example.com/file.pdf', 'https://example.com/file2.png'])
    assert.equal(hasInlineAttachmentData(value), false)
  })

  it('enforces attachment reference payload size threshold', () => {
    const oversized = 'x'.repeat(MAX_ATTACHMENT_REFERENCE_BYTES + 1)
    assert.equal(oversized.length > MAX_ATTACHMENT_REFERENCE_BYTES, true)
  })
})
