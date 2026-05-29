import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnboardingForm from '../OnboardingForm'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } }) }) }),
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('OnboardingForm', () => {
  it('renders full name and org name fields', () => {
    render(<OnboardingForm />)
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument()
  })

  it('renders a submit button', () => {
    render(<OnboardingForm />)
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument()
  })
})
