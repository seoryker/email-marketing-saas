import { Suspense } from 'react'
import OtpForm from '@/components/auth/OtpForm'

export default function VerifyOtpPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Suspense>
        <OtpForm />
      </Suspense>
    </main>
  )
}
