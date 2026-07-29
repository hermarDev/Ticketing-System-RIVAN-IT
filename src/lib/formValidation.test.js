import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateRequiredFields, isValidEmail, isValidPhPhone } from './formValidation.js'

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
})
