import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OtpForm from '../OtpForm'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => '+919876543210' }),
}))

describe('OtpForm', () => {
  it('renders 6 OTP input boxes', () => {
    render(<OtpForm />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
  })

  it('shows the phone number from search params', () => {
    render(<OtpForm />)
    expect(screen.getByText(/\+919876543210/)).toBeInTheDocument()
  })

  it('shows a resend button', () => {
    render(<OtpForm />)
    expect(screen.getByText(/resend/i)).toBeInTheDocument()
  })
})
