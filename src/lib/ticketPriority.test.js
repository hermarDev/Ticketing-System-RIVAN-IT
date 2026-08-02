import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIENT_URGENCIES,
  TICKET_PRIORITIES,
  normalizeClientUrgency,
  normalizeTicketPriority,
  mapUrgencyToPriority,
  mapPriorityToUrgency,
  resolveClientUrgencyDisplay,
  resolveCreateUrgencyAndPriority,
  applyLocalPriorityUpdate,
} from './ticketPriority.js'

describe('normalizeClientUrgency', () => {
  it('accepts locked urgency enums', () => {
    for (const u of CLIENT_URGENCIES) {
      assert.equal(normalizeClientUrgency(u), u)
      assert.equal(normalizeClientUrgency(`  ${u}  `), u)
    }
  })

  it('rejects invalid urgencies', () => {
    assert.equal(normalizeClientUrgency('Urgent'), null)
    assert.equal(normalizeClientUrgency('Medium'), null)
    assert.equal(normalizeClientUrgency('critical'), null)
    assert.equal(normalizeClientUrgency(''), null)
    assert.equal(normalizeClientUrgency(null), null)
    assert.equal(normalizeClientUrgency(42), null)
  })
})

describe('normalizeTicketPriority', () => {
  it('accepts locked priority enums', () => {
    for (const p of TICKET_PRIORITIES) {
      assert.equal(normalizeTicketPriority(p), p)
    }
  })

  it('rejects invalid priorities', () => {
    assert.equal(normalizeTicketPriority('Critical'), null)
    assert.equal(normalizeTicketPriority('Normal'), null)
    assert.equal(normalizeTicketPriority('urgent'), null)
    assert.equal(normalizeTicketPriority(''), null)
    assert.equal(normalizeTicketPriority(undefined), null)
  })
})

describe('mapUrgencyToPriority (auto-triage)', () => {
  it('maps Critical→High, High→Medium, Normal→Medium, Low→Low', () => {
    assert.equal(mapUrgencyToPriority('Critical'), 'High')
    assert.equal(mapUrgencyToPriority('High'), 'Medium')
    assert.equal(mapUrgencyToPriority('Normal'), 'Medium')
    assert.equal(mapUrgencyToPriority('Low'), 'Low')
  })

  it('never maps Critical to Urgent', () => {
    assert.notEqual(mapUrgencyToPriority('Critical'), 'Urgent')
  })
})

describe('mapPriorityToUrgency (legacy / backfill)', () => {
  it('maps Low→Low, Medium→Normal, High→High, Urgent→Critical', () => {
    assert.equal(mapPriorityToUrgency('Low'), 'Low')
    assert.equal(mapPriorityToUrgency('Medium'), 'Normal')
    assert.equal(mapPriorityToUrgency('High'), 'High')
    assert.equal(mapPriorityToUrgency('Urgent'), 'Critical')
  })

  it('returns null for unknown priority', () => {
    assert.equal(mapPriorityToUrgency('Normal'), null)
    assert.equal(mapPriorityToUrgency(''), null)
  })
})

describe('resolveClientUrgencyDisplay', () => {
  it('prefers clientUrgency then client_urgency when there is no ops override', () => {
    assert.equal(resolveClientUrgencyDisplay({ clientUrgency: 'Critical' }), 'Critical')
    assert.equal(resolveClientUrgencyDisplay({ client_urgency: 'High' }), 'High')
    assert.equal(resolveClientUrgencyDisplay({ priority: 'Urgent' }), 'Critical')
    assert.equal(resolveClientUrgencyDisplay({ priority: 'Medium' }), 'Normal')
    assert.equal(resolveClientUrgencyDisplay({}), 'Normal')
    assert.equal(resolveClientUrgencyDisplay(null), 'Normal')
  })

  it('derives urgency from ops priority when ops triage override exists', () => {
    assert.equal(
      resolveClientUrgencyDisplay({ client_urgency: 'Normal', priority: 'High', priority_updated_at: '2026-07-30T00:00:00.000Z' }),
      'High',
    )
    assert.equal(
      resolveClientUrgencyDisplay({ clientUrgency: 'Normal', priority: 'Urgent', priorityUpdatedAt: '2026-07-30T00:00:00.000Z' }),
      'Critical',
    )
  })
})

describe('resolveCreateUrgencyAndPriority', () => {
  it('uses clientUrgency and auto-triages priority (ignores client priority)', () => {
    assert.deepEqual(
      resolveCreateUrgencyAndPriority({ clientUrgency: 'Critical', priority: 'Urgent' }),
      { clientUrgency: 'Critical', priority: 'High' },
    )
    assert.deepEqual(
      resolveCreateUrgencyAndPriority({ client_urgency: 'Low', priority: 'Urgent' }),
      { clientUrgency: 'Low', priority: 'Low' },
    )
  })

  it('maps legacy priority to urgency when no urgency field', () => {
    assert.deepEqual(resolveCreateUrgencyAndPriority({ priority: 'Urgent' }), {
      clientUrgency: 'Critical',
      priority: 'High',
    })
    assert.deepEqual(resolveCreateUrgencyAndPriority({ priority: 'Medium' }), {
      clientUrgency: 'Normal',
      priority: 'Medium',
    })
  })

  it('defaults to Normal / Medium when neither field present', () => {
    assert.deepEqual(resolveCreateUrgencyAndPriority({}), {
      clientUrgency: 'Normal',
      priority: 'Medium',
    })
  })

  it('throws on invalid explicit urgency or legacy priority', () => {
    assert.throws(() => resolveCreateUrgencyAndPriority({ clientUrgency: 'Urgent' }), /Invalid client urgency/)
    assert.throws(() => resolveCreateUrgencyAndPriority({ urgency: 'Medium' }), /Invalid client urgency/)
    assert.throws(() => resolveCreateUrgencyAndPriority({ priority: 'Critical' }), /Invalid legacy priority/)
  })
})

describe('applyLocalPriorityUpdate', () => {
  it('updates matching ticket by id / ticketNumber / ticket_number', () => {
    const tickets = [
      { id: 'a', ticketNumber: 'NET-001', priority: 'Medium' },
      { id: 'b', ticket_number: 'NET-002', priority: 'Low' },
    ]
    const byId = applyLocalPriorityUpdate(tickets, 'a', 'Urgent', 'ops@example.com', '2026-07-30T00:00:00.000Z')
    assert.equal(byId[0].priority, 'Urgent')
    assert.equal(byId[0].priorityUpdatedBy, 'ops@example.com')
    assert.equal(byId[0].priority_updated_by, 'ops@example.com')
    assert.equal(byId[0].priorityUpdatedAt, '2026-07-30T00:00:00.000Z')
    assert.equal(byId[1].priority, 'Low')

    const byNumber = applyLocalPriorityUpdate(tickets, 'NET-002', 'High', 'Staff Name')
    assert.equal(byNumber[1].priority, 'High')
    assert.equal(byNumber[1].priorityUpdatedBy, 'Staff Name')
  })
})
