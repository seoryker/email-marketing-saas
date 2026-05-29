import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'send-1', contact_id: 'contact-1' } })
const mockEq = vi.fn(() => ({ eq: mockEq, single: mockSingle }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({ eq: mockEq })),
  update: mockUpdate,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}))

const { POST } = await import('../route')

function makeRequest(body: object) {
  return new Request('http://localhost/api/webhooks/brevo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Brevo webhook handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 for opened event', async () => {
    const res = await POST(makeRequest({
      event: 'opened', email: 'test@example.com',
      date: '2026-05-29T10:00:00Z', messageId: 'msg-123',
    }))
    expect(res.status).toBe(200)
  })

  it('returns 200 for unknown messageId', async () => {
    mockSingle.mockResolvedValueOnce({ data: null })
    const res = await POST(makeRequest({
      event: 'opened', email: 'unknown@example.com',
      date: '2026-05-29T10:00:00Z', messageId: 'unknown',
    }))
    expect(res.status).toBe(200)
  })

  it('returns 200 for bounced event', async () => {
    const res = await POST(makeRequest({
      event: 'bounced', email: 'bounce@example.com',
      date: '2026-05-29T10:00:00Z', messageId: 'msg-456',
    }))
    expect(res.status).toBe(200)
  })
})
