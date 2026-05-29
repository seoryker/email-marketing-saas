import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CampaignSetupForm from '../CampaignSetupForm'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('CampaignSetupForm', () => {
  it('renders required fields', () => {
    render(<CampaignSetupForm />)
    expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/subject line/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/from name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/from email/i)).toBeInTheDocument()
  })

  it('renders continue button', () => {
    render(<CampaignSetupForm />)
    expect(screen.getByRole('button', { name: /continue to builder/i })).toBeInTheDocument()
  })
})
