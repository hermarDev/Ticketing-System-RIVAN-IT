import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getSupabaseAuthStorageKey,
  resolveAuthPortal,
} from './supabaseAuthPortal.js'

describe('resolveAuthPortal', () => {
  it('treats ops.html paths as the ops portal', () => {
    assert.equal(resolveAuthPortal('/ops.html'), 'ops')
    assert.equal(resolveAuthPortal('/subdir/ops.html'), 'ops')
    assert.equal(resolveAuthPortal('/OPS.HTML'), 'ops')
  })

  it('treats trailing /ops paths as the ops portal', () => {
    assert.equal(resolveAuthPortal('/ops'), 'ops')
    assert.equal(resolveAuthPortal('/ops/'), 'ops')
  })

  it('treats the client entry paths as the client portal', () => {
    assert.equal(resolveAuthPortal('/'), 'client')
    assert.equal(resolveAuthPortal('/index.html'), 'client')
    assert.equal(resolveAuthPortal('/tickets'), 'client')
    assert.equal(resolveAuthPortal(''), 'client')
  })

  it('does not treat ops-like names that are not the ops entry as ops', () => {
    assert.equal(resolveAuthPortal('/operations'), 'client')
    assert.equal(resolveAuthPortal('/my-ops-page'), 'client')
    assert.equal(resolveAuthPortal('/myops.html'), 'client')
    assert.equal(resolveAuthPortal('/docs/ops.html-guide'), 'client')
  })
})

describe('getSupabaseAuthStorageKey', () => {
  it('returns distinct storage keys for client and ops', () => {
    const clientKey = getSupabaseAuthStorageKey('client')
    const opsKey = getSupabaseAuthStorageKey('ops')

    assert.equal(clientKey, 'sb-netops-auth-token-client')
    assert.equal(opsKey, 'sb-netops-auth-token-ops')
    assert.notEqual(clientKey, opsKey)
  })
})
