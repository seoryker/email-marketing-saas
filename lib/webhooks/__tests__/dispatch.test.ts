import { describe, it, expect } from 'vitest'
import { shouldDispatch } from '../dispatch'

describe('shouldDispatch', () => {
  it('dispatches when event is in webhook_events and url is set', () => {
    expect(shouldDispatch(
      { webhook_url: 'https://hook.example.com', webhook_events: ['contact.created', 'campaign.sent'] },
      'contact.created'
    )).toBe(true)
  })
  it('skips when event not in webhook_events', () => {
    expect(shouldDispatch(
      { webhook_url: 'https://hook.example.com', webhook_events: ['campaign.sent'] },
      'contact.created'
    )).toBe(false)
  })
  it('skips when webhook_url is empty', () => {
    expect(shouldDispatch({ webhook_url: '', webhook_events: ['contact.created'] }, 'contact.created')).toBe(false)
  })
  it('skips when webhook_url is null', () => {
    expect(shouldDispatch({ webhook_url: null, webhook_events: ['contact.created'] }, 'contact.created')).toBe(false)
  })
})
