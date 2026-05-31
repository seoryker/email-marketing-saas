'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMemberRole, removeMember, revokeInvitation } from '@/lib/team/actions'
import InviteModal from './InviteModal'
import type { TeamMember, PendingInvitation } from '@/lib/team/queries'

const ROLE_LABELS: Record<string, string> = { owner: '👑 Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }

type Props = { members: TeamMember[]; invitations: PendingInvitation[]; currentUserId: string; currentUserRole: string }

export default function TeamMembersList({ members, invitations, currentUserId, currentUserRole }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showInvite, setShowInvite] = useState(false)
  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold text-slate-900">Team Members</h1><p className="text-sm text-slate-500">{members.length} members</p></div>
        {canInvite && <button onClick={() => setShowInvite(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ Invite Member</button>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Member</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Role</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const isMe = m.id === currentUserId
              const canManage = !isMe && m.role !== 'owner' && (currentUserRole === 'owner' || (currentUserRole === 'admin' && ['member','viewer'].includes(m.role)))
              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-[11px] font-semibold text-white flex-shrink-0">{m.full_name[0]?.toUpperCase() ?? '?'}</div>
                      <p className="font-medium text-slate-900">{m.full_name} {isMe && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1">you</span>}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {m.role === 'owner' ? <span className="text-xs font-medium text-slate-700">👑 Owner</span> :
                     canManage ? (
                      <select value={m.role} onChange={e => startTransition(async () => { await updateMemberRole(m.id, e.target.value as any); router.refresh() })} disabled={isPending}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:border-blue-500 disabled:opacity-50">
                        <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
                      </select>
                     ) : <span className="text-xs text-slate-600">{ROLE_LABELS[m.role] ?? m.role}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && <button onClick={() => { if (!confirm(`Remove ${m.full_name}?`)) return; startTransition(async () => { await removeMember(m.id); router.refresh() }) }} disabled={isPending} className="text-red-400 hover:text-red-600 disabled:opacity-40 text-xs">Remove</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-slate-700">Pending Invitations</h2>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between border-b border-slate-100 last:border-0 px-4 py-3">
                <div><p className="text-xs font-medium text-slate-900">{inv.email}</p><p className="text-[11px] text-slate-400">Invited as {inv.role} · Expires {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p></div>
                {canInvite && <button onClick={() => startTransition(async () => { await revokeInvitation(inv.id); router.refresh() })} disabled={isPending} className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-40">Revoke</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && <InviteModal onClose={() => { setShowInvite(false); router.refresh() }} />}
    </div>
  )
}
