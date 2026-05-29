# Team & Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4-role team system (Owner/Admin/Member/Viewer) with invite by email, role management at /settings/team, and middleware-enforced viewer restrictions.

**Architecture:** The profiles table already has role (owner/admin/member) from Foundation — migration adds viewer. Invitations table already exists. Server Actions handle invite/role-change/remove. Middleware enforces viewer-blocked routes. Accept invitation at /invite/[token] joins the org.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, Brevo (for invite emails)

---

## File Map

| File | Role | New/Edit |
|---|---|---|
| `supabase/migrations/008_team.sql` | Add viewer to profiles_role_check constraint | New |
| `lib/team/permissions.ts` | canManageMember, canInvite pure functions | New |
| `lib/team/__tests__/permissions.test.ts` | Vitest unit tests for permission logic | New |
| `lib/team/queries.ts` | getTeamMembers, getPendingInvitations | New |
| `lib/team/actions.ts` | inviteMember, updateMemberRole, removeMember, revokeInvitation, acceptInvitation | New |
| `components/settings/InviteModal.tsx` | Email + role picker modal | New |
| `components/settings/TeamMembersList.tsx` | Members table + pending invitations | New |
| `app/(dashboard)/settings/page.tsx` | Redirect to /settings/team | New |
| `app/(dashboard)/settings/team/page.tsx` | Team settings Server Component | New |
| `app/invite/[token]/page.tsx` | Public accept invitation page | New |
| `middleware.ts` | Add viewer route blocking after existing auth check | Edit |

---

## Task 1: DB Migration (add viewer role)

- [ ] Create `supabase/migrations/008_team.sql`:

```sql
-- Add viewer to the existing role check constraint on profiles
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner','admin','member','viewer'));
```

- [ ] Apply in Supabase SQL Editor (Dashboard → SQL Editor → paste and run).
- [ ] `git add supabase/migrations/008_team.sql && git commit -m "feat: add viewer role to profiles constraint (migration 008)"`

---

## Task 2: Team Queries + Actions (TDD)

- [ ] Create `lib/team/__tests__/permissions.test.ts` — write tests FIRST before implementation:

```typescript
import { describe, it, expect } from 'vitest'
import { canManageMember, canInvite } from '../permissions'

describe('canManageMember', () => {
  it('owner can manage admin, member, viewer', () => {
    expect(canManageMember('owner', 'admin')).toBe(true)
    expect(canManageMember('owner', 'member')).toBe(true)
    expect(canManageMember('owner', 'viewer')).toBe(true)
  })
  it('owner cannot manage another owner', () => {
    expect(canManageMember('owner', 'owner')).toBe(false)
  })
  it('admin can manage member and viewer', () => {
    expect(canManageMember('admin', 'member')).toBe(true)
    expect(canManageMember('admin', 'viewer')).toBe(true)
  })
  it('admin cannot manage admin or owner', () => {
    expect(canManageMember('admin', 'admin')).toBe(false)
    expect(canManageMember('admin', 'owner')).toBe(false)
  })
  it('member cannot manage anyone', () => {
    expect(canManageMember('member', 'viewer')).toBe(false)
    expect(canManageMember('member', 'member')).toBe(false)
  })
  it('viewer cannot manage anyone', () => {
    expect(canManageMember('viewer', 'member')).toBe(false)
  })
})

describe('canInvite', () => {
  it('owner and admin can invite', () => {
    expect(canInvite('owner')).toBe(true)
    expect(canInvite('admin')).toBe(true)
  })
  it('member and viewer cannot invite', () => {
    expect(canInvite('member')).toBe(false)
    expect(canInvite('viewer')).toBe(false)
  })
})
```

- [ ] Run `npx vitest run lib/team/__tests__/permissions.test.ts` — confirm it FAILS (module not found).

- [ ] Create `lib/team/permissions.ts`:

```typescript
type Role = 'owner' | 'admin' | 'member' | 'viewer'
const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }

/**
 * Returns true if a user with `callerRole` is allowed to manage
 * (change role / remove) a user with `targetRole`.
 */
export function canManageMember(callerRole: Role, targetRole: Role): boolean {
  // Nobody can manage the owner
  if (targetRole === 'owner') return false
  // Owner can manage anyone except owner
  if (callerRole === 'owner') return true
  // Admin can manage roles strictly below admin
  if (callerRole === 'admin') return ROLE_RANK[targetRole] < ROLE_RANK['admin']
  // Member/Viewer cannot manage anyone
  return false
}

/**
 * Returns true if a user with `callerRole` is allowed to send invitations.
 */
export function canInvite(callerRole: Role): boolean {
  return callerRole === 'owner' || callerRole === 'admin'
}
```

- [ ] Run `npx vitest run lib/team/__tests__/permissions.test.ts` — confirm ALL tests PASS.

- [ ] Create `lib/team/queries.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'

export type TeamMember = {
  id: string
  user_id: string
  full_name: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joined_at: string
}

export type PendingInvitation = {
  id: string
  email: string
  role: string
  expires_at: string
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .order('created_at')

  return (data ?? []).map((p: any) => ({
    id: p.id,
    user_id: p.id,
    full_name: p.full_name || 'Unknown',
    email: '',  // auth.users emails require service-role; populated via RPC or admin API in production
    role: p.role,
    joined_at: p.created_at,
  })) as TeamMember[]
}

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invitations')
    .select('id, email, role, expires_at')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  return (data ?? []) as PendingInvitation[]
}
```

- [ ] Create `lib/team/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canManageMember, canInvite } from './permissions'
import { sendTransactionalEmail } from '@/lib/campaigns/brevo'

type Role = 'owner' | 'admin' | 'member' | 'viewer'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, organization_id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, profile }
}

export async function inviteMember(email: string, role: Role): Promise<void> {
  const { supabase, profile } = await getCallerProfile()
  if (!canInvite(profile.role as Role)) throw new Error('Not authorized to invite')

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({
      organization_id: profile.organization_id,
      email,
      role,
      token: crypto.randomUUID(),
      expires_at: expiresAt,
    })
    .select('token')
    .single()

  if (error) throw new Error(error.message)

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', profile.organization_id)
    .single()

  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yourapp.com'
  await sendTransactionalEmail({
    to: { email, name: email },
    subject: `You've been invited to join ${org?.name ?? 'an organization'}`,
    htmlContent: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="margin:0 0 16px">You've been invited!</h2>
        <p style="color:#475569">${profile.full_name || 'Someone'} has invited you to join
          <strong>${org?.name ?? 'their team'}</strong> as a <strong>${role}</strong>.</p>
        <a href="${host}/invite/${invite.token}"
           style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;margin-top:16px">
          Accept Invitation
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">This invitation expires in 7 days.</p>
      </div>
    `,
    fromName: org?.name ?? 'MailFlow',
    fromEmail: process.env.BREVO_FROM_EMAIL ?? 'noreply@mailflow.app',
  }).catch(() => {})  // don't fail if email delivery fails

  revalidatePath('/settings/team')
}

export async function updateMemberRole(profileId: string, newRole: Role): Promise<void> {
  const { supabase, profile } = await getCallerProfile()

  const { data: target } = await supabase
    .from('profiles').select('role').eq('id', profileId).single()
  if (!target) throw new Error('Member not found')
  if (!canManageMember(profile.role as Role, target.role as Role)) throw new Error('Not authorized')
  if (newRole === 'owner') throw new Error('Cannot assign owner role via this action')

  await supabase.from('profiles').update({ role: newRole }).eq('id', profileId)
  revalidatePath('/settings/team')
}

export async function removeMember(profileId: string): Promise<void> {
  const { supabase, profile } = await getCallerProfile()

  const { data: target } = await supabase
    .from('profiles').select('role').eq('id', profileId).single()
  if (!target) throw new Error('Member not found')
  if (!canManageMember(profile.role as Role, target.role as Role)) throw new Error('Not authorized')

  // Soft remove: clear organization_id so user data is preserved
  await supabase.from('profiles').update({ organization_id: null }).eq('id', profileId)
  revalidatePath('/settings/team')
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { supabase, profile } = await getCallerProfile()
  if (!canInvite(profile.role as Role)) throw new Error('Not authorized')
  await supabase.from('invitations').delete().eq('id', invitationId)
  revalidatePath('/settings/team')
}

export async function acceptInvitation(token: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in to accept an invitation')

  const { data: invite } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invite) throw new Error('Invitation not found or expired')

  await supabase.from('profiles').update({
    organization_id: invite.organization_id,
    role: invite.role,
  }).eq('id', user.id)

  await supabase.from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)
}
```

- [ ] `git add lib/team/ && git commit -m "feat: add team permissions, queries, and server actions (TDD)"`

---

## Task 3: TeamMembersList + InviteModal components

- [ ] Create `components/settings/InviteModal.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteMember } from '@/lib/team/actions'

const ROLES = [
  {
    value: 'admin' as const,
    label: 'Admin',
    desc: 'Can manage everything except team ownership',
  },
  {
    value: 'member' as const,
    label: 'Member',
    desc: 'Can create and edit content, cannot manage team',
  },
  {
    value: 'viewer' as const,
    label: 'Viewer',
    desc: 'Read-only access to campaigns and analytics',
  },
]

type Props = { onClose: () => void }

export default function InviteModal({ onClose }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await inviteMember(email, role)
        setSuccess(true)
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Invite a Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="text-3xl mb-3">✉️</div>
            <p className="text-sm font-semibold text-slate-900">Invitation sent!</p>
            <p className="mt-1 text-xs text-slate-500">
              They'll receive an email with a join link valid for 7 days.
            </p>
            <Button onClick={onClose} className="mt-4">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Email address *</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Role *</label>
              {ROLES.map(r => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    role === r.value
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    role === r.value ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}>
                    {role === r.value && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-900">{r.label}</p>
                    <p className="text-[11px] text-slate-500">{r.desc}</p>
                  </div>
                  <input
                    type="radio"
                    className="hidden"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                  />
                </label>
              ))}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </form>
        )}
      </div>
    </>
  )
}
```

- [ ] Create `components/settings/TeamMembersList.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMemberRole, removeMember, revokeInvitation } from '@/lib/team/actions'
import InviteModal from './InviteModal'
import type { TeamMember, PendingInvitation } from '@/lib/team/queries'

const ROLE_LABELS: Record<string, string> = {
  owner: '👑 Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

type Props = {
  members: TeamMember[]
  invitations: PendingInvitation[]
  currentUserId: string
  currentUserRole: string
}

export default function TeamMembersList({ members, invitations, currentUserId, currentUserRole }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showInvite, setShowInvite] = useState(false)

  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin'

  function handleRoleChange(memberId: string, newRole: string) {
    startTransition(async () => {
      await updateMemberRole(memberId, newRole as any)
      router.refresh()
    })
  }

  function handleRemove(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return
    startTransition(async () => {
      await removeMember(memberId)
      router.refresh()
    })
  }

  function handleRevokeInvite(invitationId: string) {
    startTransition(async () => {
      await revokeInvitation(invitationId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Team Members</h1>
          <p className="text-sm text-slate-500">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        {canInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Invite Member
          </button>
        )}
      </div>

      {/* Members table */}
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
              const canManage =
                !isMe &&
                m.role !== 'owner' &&
                (
                  currentUserRole === 'owner' ||
                  (currentUserRole === 'admin' && ['member', 'viewer'].includes(m.role))
                )

              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-[11px] font-semibold text-white flex-shrink-0">
                        {m.full_name[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {m.full_name}
                          {isMe && (
                            <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              you
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {m.role === 'owner' ? (
                      <span className="text-xs font-medium text-slate-700">👑 Owner</span>
                    ) : canManage ? (
                      <select
                        value={m.role}
                        onChange={e => handleRoleChange(m.id, e.target.value)}
                        disabled={isPending}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:border-blue-500 disabled:opacity-50"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="text-xs text-slate-600">{ROLE_LABELS[m.role] ?? m.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <button
                        onClick={() => handleRemove(m.id, m.full_name)}
                        disabled={isPending}
                        className="text-red-400 hover:text-red-600 disabled:opacity-40 text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-slate-700">Pending Invitations</h2>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {invitations.map(inv => (
              <div
                key={inv.id}
                className="flex items-center justify-between border-b border-slate-100 last:border-0 px-4 py-3"
              >
                <div>
                  <p className="text-xs font-medium text-slate-900">{inv.email}</p>
                  <p className="text-[11px] text-slate-400">
                    Invited as {inv.role} · Expires{' '}
                    {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {canInvite && (
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    disabled={isPending}
                    className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => {
            setShowInvite(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] `git add components/settings/ && git commit -m "feat: add InviteModal and TeamMembersList components"`

---

## Task 4: Settings pages + Accept invitation page

- [ ] Create `app/(dashboard)/settings/page.tsx`:

```typescript
import { redirect } from 'next/navigation'

export default function SettingsPage() {
  redirect('/settings/team')
}
```

- [ ] Create `app/(dashboard)/settings/team/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers, getPendingInvitations } from '@/lib/team/queries'
import TeamMembersList from '@/components/settings/TeamMembersList'

export default async function TeamSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const [members, invitations] = await Promise.all([
    getTeamMembers(),
    getPendingInvitations(),
  ])

  return (
    <div className="max-w-2xl">
      <TeamMembersList
        members={members}
        invitations={invitations}
        currentUserId={profile.id}
        currentUserRole={profile.role}
      />
    </div>
  )
}
```

- [ ] Create `app/invite/[token]/page.tsx`:

```typescript
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
    setError(null)
    startTransition(async () => {
      try {
        await acceptInvitation(token)
        router.push('/dashboard')
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="text-4xl">🎉</div>
        <h1 className="text-xl font-bold text-slate-900">You've been invited!</h1>
        <p className="text-sm text-slate-500">
          Click below to join the team and access the platform.
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        <button
          onClick={handleAccept}
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Joining...' : 'Accept Invitation & Join Team'}
        </button>
      </div>
    </main>
  )
}
```

- [ ] `git add app/(dashboard)/settings/ app/invite/ && git commit -m "feat: add team settings page and accept invitation page"`

---

## Task 5: Middleware role enforcement

- [ ] Read `middleware.ts` to find the exact location of the existing auth check before editing.
- [ ] Add viewer-blocked route enforcement after the existing auth guard. The addition goes inside the block where `user` is confirmed to exist:

```typescript
// Role-based blocking for viewers
// (add this after the existing !user && isProtected redirect block)
if (user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'viewer') {
    const viewerBlockedPrefixes = [
      '/campaigns/new',
      '/automations/new',
      '/landing-pages/new',
      '/contacts',
    ]

    const isWriteRoute =
      viewerBlockedPrefixes.some(p => pathname.startsWith(p)) ||
      /\/(campaigns|automations|landing-pages)\/[^/]+\/edit/.test(pathname)

    if (isWriteRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }
}
```

- [ ] `npx tsc --noEmit` — fix any TypeScript errors before committing.
- [ ] `git add middleware.ts && git commit -m "feat: enforce viewer-blocked routes in middleware"`
- [ ] `git tag v0.8.0-team-permissions`

---

## Acceptance Criteria

- [ ] `/settings` redirects to `/settings/team`.
- [ ] `/settings/team` shows all org members with roles, joined date, and (for manageable members) a role dropdown.
- [ ] Owner and admin see "+ Invite Member" button; member and viewer do not.
- [ ] InviteModal sends an invitation email via Brevo and shows success state.
- [ ] Role dropdown on a member row saves immediately via `updateMemberRole`; page refreshes.
- [ ] Remove button removes member (soft: clears `organization_id`); button only appears for users the caller can manage.
- [ ] Pending invitations section lists non-expired pending invites with a Revoke button for owner/admin.
- [ ] `/invite/[token]` is accessible without auth; shows join button; on click calls `acceptInvitation` and redirects to `/dashboard`.
- [ ] Viewer navigating to `/campaigns/new` is redirected to `/dashboard`.
- [ ] Viewer navigating to `/campaigns/[id]/edit` is redirected to `/dashboard`.
- [ ] All vitest tests in `lib/team/__tests__/permissions.test.ts` pass.
- [ ] `npx tsc --noEmit` passes with zero errors.
