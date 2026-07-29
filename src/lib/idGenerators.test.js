import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateClientId, generateTicketId } from './idGenerators.js'

describe('idGenerators', () => {
  it('should generate a valid client ID with prefix CL-', () => {
    const id = generateClientId()
    assert.match(id, /^CL-[0-9A-F]{12}$/)
  })

  it('should generate a valid ticket ID with prefix NET-', () => {
    const id = generateTicketId()
    assert.match(id, /^NET-[0-9A-F]{16}$/)
  })
})
