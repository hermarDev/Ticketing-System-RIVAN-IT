import DOMPurify from 'isomorphic-dompurify'

/**
 * Plain-text sanitization using DOMPurify: strips all HTML tags and attributes,
 * trims whitespace, and enforces maxLength. Output is plain text for storage /
 * React-escaped display only. Nullish and non-string values become `''`.
 *
 * Canonical implementation — also re-exported from ticketService.js.
 *
 * @param {*} str - Raw user input
 * @param {number} [maxLength=5000] - Maximum length of the returned string
 * @returns {string}
 */
export function sanitizeInput(str, maxLength = 5000) {
  if (typeof str !== 'string') return ''
  const clean = DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return clean.trim().slice(0, maxLength)
}

export function validateRequiredFields(values, requiredFields) {
  return requiredFields.reduce((errors, field) => {
    if (!String(values[field] ?? '').trim()) {
      errors[field] = 'This field is required.'
    }
    return errors
  }, {})
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Validates Philippines phone numbers:
 * Must be exactly 11 digits starting with '09' (e.g., 09171234567)
 */
export function isValidPhPhone(phone) {
  const cleanPhone = String(phone || '').replace(/[\s-]/g, '')
  return /^09\d{9}$/.test(cleanPhone)
}

/** Min length aligned with client signup and Supabase Auth defaults used here. */
export const PASSWORD_MIN_LENGTH = 8

/** Symbols accepted by the Supabase Auth "character classes" password policy. */
export const PASSWORD_SYMBOL_CHARS = "!@#$%^&*()_+-=[]{};':\"|<>?,./~"

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.'

export const PASSWORD_POLICY_FALLBACK_MESSAGE =
  "That password doesn't meet our security requirements. Add uppercase, lowercase, a number, and a symbol."

function hasPasswordSymbol(password) {
  const value = String(password || '')
  for (let i = 0; i < value.length; i += 1) {
    if (PASSWORD_SYMBOL_CHARS.includes(value[i])) return true
  }
  return false
}

export const PASSWORD_REQUIREMENTS = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (password) => String(password || '').length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'lower',
    label: 'One lowercase letter',
    test: (password) => /[a-z]/.test(String(password || '')),
  },
  {
    id: 'upper',
    label: 'One uppercase letter',
    test: (password) => /[A-Z]/.test(String(password || '')),
  },
  {
    id: 'number',
    label: 'One number',
    test: (password) => /[0-9]/.test(String(password || '')),
  },
  {
    id: 'symbol',
    label: 'One symbol (e.g. ! @ # $ %)',
    test: hasPasswordSymbol,
  },
]

/**
 * Live checklist status for password policy UI.
 * @param {*} password
 * @returns {{ id: string, label: string, met: boolean }[]}
 */
export function getPasswordRequirementStatus(password) {
  return PASSWORD_REQUIREMENTS.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    met: requirement.test(password),
  }))
}

/**
 * @param {*} password
 * @returns {boolean}
 */
export function isValidPassword(password) {
  return getPasswordRequirementStatus(password).every((requirement) => requirement.met)
}

/**
 * Field-level password validation message, or empty string when valid.
 * @param {*} password
 * @returns {string}
 */
export function getPasswordValidationError(password) {
  if (!String(password || '')) return 'This field is required.'
  if (!isValidPassword(password)) return PASSWORD_POLICY_MESSAGE
  return ''
}

/**
 * Maps verbose Supabase Auth password-policy errors to short user-facing copy.
 * Returns null when the message is not a password-policy failure.
 * @param {*} message
 * @returns {string|null}
 */
export function mapAuthPasswordError(message) {
  const msg = String(message || '')
  if (!msg) return null
  if (msg === PASSWORD_POLICY_MESSAGE || msg === PASSWORD_POLICY_FALLBACK_MESSAGE) {
    return msg
  }
  if (/password should contain at least one character of each/i.test(msg)) {
    return PASSWORD_POLICY_MESSAGE
  }
  if (
    /password/i.test(msg) &&
    /(weak|at least|character|too short|security|uppercase|lowercase|digit|symbol|special)/i.test(msg)
  ) {
    return PASSWORD_POLICY_FALLBACK_MESSAGE
  }
  return null
}

/**
 * Returns true when value is a locked client urgency enum.
 * @param {*} urgency
 * @returns {boolean}
 */
export function isValidClientUrgency(urgency) {
  return urgency === 'Low' || urgency === 'Normal' || urgency === 'High' || urgency === 'Critical'
}

/**
 * Returns true when value is a locked ops priority enum.
 * @param {*} priority
 * @returns {boolean}
 */
export function isValidTicketPriority(priority) {
  return priority === 'Low' || priority === 'Medium' || priority === 'High' || priority === 'Urgent'
}
