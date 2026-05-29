import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CampaignsList from '../CampaignsList'
import type { Campaign } from '@/lib/campaigns/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const campaigns: Campaign[] = [
  {
    id: '1', organization_id: 'org', name: 'Summer Sale',
    subject: 'Big deals inside', preview_text: null,
    from_name: 'HiringHood', from_email: 'hello@hiringhood.com',
    status: 'sent', content_json: null, content_html: null,
    recipient_list_ids: [], recipient_count: 500,
    scheduled_at: null, sent_at: '2026-05-28T10:00:00Z',
    brevo_campaign_ref: null, created_at: '2026-05-20T00:00:00Z',
    updated_at: '2026-05-28T10:00:00Z',
  },
  {
    id: '2', organization_id: 'org', name: 'Product Launch',
    subject: 'New product!', preview_text: null,
    from_name: 'HiringHood', from_email: 'hello@hiringhood.com',
    status: 'draft', content_json: null, content_html: null,
    recipient_list_ids: [], recipient_count: 0,
    scheduled_at: null, sent_at: null,
    brevo_campaign_ref: null, created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
  },
]

describe('CampaignsList', () => {
  it('renders campaign names', () => {
    render(<CampaignsList campaigns={campaigns} />)
    expect(screen.getByText('Summer Sale')).toBeInTheDocument()
    expect(screen.getByText('Product Launch')).toBeInTheDocument()
  })

  it('renders status badges', () => {
    render(<CampaignsList campaigns={campaigns} />)
    expect(screen.getByText('sent')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  it('renders empty state when no campaigns', () => {
    render(<CampaignsList campaigns={[]} />)
    expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument()
  })
})
