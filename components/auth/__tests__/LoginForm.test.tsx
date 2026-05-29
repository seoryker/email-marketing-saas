import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from '../LoginForm'

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('LoginForm', () => {
  it('renders phone tab by default', () => {
    render(<LoginForm />)
    expect(screen.getByPlaceholderText(/phone number/i)).toBeInTheDocument()
  })

  it('switches to email tab on click', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.click(screen.getByRole('tab', { name: /email/i }))
    expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument()
  })

  it('shows Google OAuth button', () => {
    render(<LoginForm />)
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument()
  })
})
