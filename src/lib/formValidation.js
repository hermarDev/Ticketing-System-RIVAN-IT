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
