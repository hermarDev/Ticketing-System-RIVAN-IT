import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateRequiredFields,
  isValidEmail,
  isValidPhPhone,
  isValidClientUrgency,
  isValidTicketPriority,
  isValidPassword,
  getPasswordValidationError,
  getPasswordRequirementStatus,
  mapAuthPasswordError,
  PASSWORD_POLICY_MESSAGE,
} from './formValidation.js'

describe('formValidation', () => {
  it('should identify missing required fields', () => {
    const values = { name: '', email: 'test@example.com' }
    const errors = validateRequiredFields(values, ['name', 'email', 'phone'])
    assert.deepEqual(errors, {
      name: 'This field is required.',
      phone: 'This field is required.',
    })
  })

  it('should return no errors when all required fields are present', () => {
    const values = { name: 'John Doe', email: 'john@example.com' }
    const errors = validateRequiredFields(values, ['name', 'email'])
    assert.deepEqual(errors, {})
  })

  it('should validate email format correctly', () => {
    assert.equal(isValidEmail('user@domain.com'), true)
    assert.equal(isValidEmail('invalid-email'), false)
    assert.equal(isValidEmail('user@domain'), false)
    assert.equal(isValidEmail(''), false)
  })

  it('should validate Philippines 11-digit phone numbers starting with 09', () => {
    assert.equal(isValidPhPhone('09171234567'), true)
    assert.equal(isValidPhPhone('09981234567'), true)
    assert.equal(isValidPhPhone('0917 123 4567'), true)
    assert.equal(isValidPhPhone('0917-123-4567'), true)
    assert.equal(isValidPhPhone('08171234567'), false) // doesn't start with 09
    assert.equal(isValidPhPhone('0917123456'), false) // 10 digits
    assert.equal(isValidPhPhone('091712345678'), false) // 12 digits
    assert.equal(isValidPhPhone('abc091712345'), false)
  })

  it('should validate client urgency and ticket priority enums', () => {
    assert.equal(isValidClientUrgency('Critical'), true)
    assert.equal(isValidClientUrgency('Normal'), true)
    assert.equal(isValidClientUrgency('Urgent'), false)
    assert.equal(isValidClientUrgency('Medium'), false)
    assert.equal(isValidTicketPriority('Urgent'), true)
    assert.equal(isValidTicketPriority('Medium'), true)
    assert.equal(isValidTicketPriority('Critical'), false)
    assert.equal(isValidTicketPriority('Normal'), false)
  })

  it('should enforce password character-class policy', () => {
    assert.equal(isValidPassword('Short1!'), false)
    assert.equal(isValidPassword('alllowercase1!'), false)
    assert.equal(isValidPassword('ALLUPPERCASE1!'), false)
    assert.equal(isValidPassword('NoNumber!'), false)
    assert.equal(isValidPassword('NoSymbol12'), false)
    assert.equal(isValidPassword('ValidPass1!'), true)
    assert.equal(getPasswordValidationError('weak'), PASSWORD_POLICY_MESSAGE)
    assert.equal(getPasswordValidationError('ValidPass1!'), '')
  })

  it('should expose live password requirement status', () => {
    const status = getPasswordRequirementStatus('Abcdef1!')
    assert.equal(status.every((item) => item.met), true)
    const partial = getPasswordRequirementStatus('abcdefg')
    assert.equal(partial.find((item) => item.id === 'length')?.met, false)
    assert.equal(partial.find((item) => item.id === 'lower')?.met, true)
    assert.equal(partial.find((item) => item.id === 'upper')?.met, false)
  })

  it('should map verbose Supabase password policy errors', () => {
    const raw =
      "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};':\"|<>?,./~."
    assert.equal(mapAuthPasswordError(raw), PASSWORD_POLICY_MESSAGE)
    assert.equal(mapAuthPasswordError(PASSWORD_POLICY_MESSAGE), PASSWORD_POLICY_MESSAGE)
    assert.equal(mapAuthPasswordError('An account with this email already exists.'), null)
  })

  it('should require a password value before policy checks', () => {
    assert.equal(getPasswordValidationError(''), 'This field is required.')
  })
})
