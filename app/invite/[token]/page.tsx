'use client'
import { useState, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { acceptInvitation } from '@/lib/team/actions'

export default function AcceptInvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAccept() {
    startTransition(async () => {
      try { await acceptInvitation(token); router.push('/dashboard') }
      catch (err: any) { setError(err.message) }
    })
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="text-4xl">&#x1F389;</div>
        <h1 className="text-xl font-bold text-slate-900">You&apos;ve been invited!</h1>
        <p className="text-sm text-slate-500">Click below to join the team and access the platform.</p>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={handleAccept} disabled={isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {isPending ? 'Joining...' : 'Accept Invitation & Join Team'}
        </button>
      </div>
    </main>
  )
}
