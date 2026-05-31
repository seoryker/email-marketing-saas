'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteMember } from '@/lib/team/actions'

const ROLES = [
  { value: 'admin' as const, label: 'Admin', desc: 'Can manage everything except team ownership' },
  { value: 'member' as const, label: 'Member', desc: 'Can create and edit content, cannot manage team' },
  { value: 'viewer' as const, label: 'Viewer', desc: 'Read-only access to campaigns and analytics' },
]

export default function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try { await inviteMember(email, role); setSuccess(true) }
      catch (err: any) { setError(err.message) }
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Invite a Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">&#x2715;</button>
        </div>
        {success ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-3xl">&#x2709;&#xFE0F;</div>
            <p className="text-sm font-semibold text-slate-900">Invitation sent!</p>
            <p className="text-xs text-slate-500">They&apos;ll receive an email with a join link valid for 7 days.</p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Email address *</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" required />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Role *</label>
              {ROLES.map(r => (
                <label key={r.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${role === r.value ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${role === r.value ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                    {role === r.value && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div><p className="text-xs font-medium text-slate-900">{r.label}</p><p className="text-[11px] text-slate-500">{r.desc}</p></div>
                  <input type="radio" className="hidden" checked={role === r.value} onChange={() => setRole(r.value)} />
                </label>
              ))}
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button type="submit" disabled={isPending} className="w-full">{isPending ? 'Sending...' : 'Send Invitation'}</Button>
          </form>
        )}
      </div>
    </>
  )
}
