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
