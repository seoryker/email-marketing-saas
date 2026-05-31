import OnboardingForm from '@/components/auth/OnboardingForm'

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <OnboardingForm />
    </main>
  )
}

export const dynamic = 'force-dynamic'
