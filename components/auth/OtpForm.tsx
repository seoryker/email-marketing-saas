'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

const OTP_LENGTH = 6
const RESEND_SECONDS = 60

export default function OtpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? ''

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(RESEND_SECONDS)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const supabase = createClient()

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  async function handleVerify() {
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // Check if profile is already complete (returning user)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, organization_id')
      .eq('id', data.user?.id)
      .single()

    if (profile?.full_name) {
      router.push('/dashboard')
    } else {
      router.push('/onboarding')
    }
  }

  async function handleResend() {
    setError(null)
    await supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } })
    setCountdown(RESEND_SECONDS)
  }

  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div>
        <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Enter OTP</h1>
        <p className="text-sm text-slate-500 mt-1">Sent to {phone}</p>
      </div>

      <div className="flex justify-center gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="h-12 w-10 rounded-lg border border-slate-200 text-center text-lg font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label={`OTP digit ${i + 1}`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        onClick={handleVerify}
        className="w-full"
        disabled={loading || digits.join('').length < OTP_LENGTH}
      >
        {loading ? 'Verifying...' : 'Verify OTP'}
      </Button>

      <p className="text-sm text-slate-500">
        {countdown > 0 ? (
          <>Resend in <span className="text-blue-600">{countdown}s</span></>
        ) : (
          <button onClick={handleResend} className="text-blue-600 hover:underline">
            Resend OTP
          </button>
        )}
      </p>
    </div>
  )
}
