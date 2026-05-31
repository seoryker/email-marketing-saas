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
    .from('profiles').select('id, organization_id, role, full_name').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, profile }
}

export async function inviteMember(email: string, role: Role) {
  const { supabase, profile } = await getCallerProfile()
  if (!canInvite(profile.role as Role)) throw new Error('Not authorized to invite members')

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({ organization_id: profile.organization_id, email, role, token: crypto.randomUUID(), expires_at: expiresAt })
    .select('token').single()
  if (error) throw new Error(error.message)

  const { data: org } = await supabase.from('organizations').select('name').eq('id', profile.organization_id).single()
  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yourapp.com'

  await sendTransactionalEmail({
    to: { email, name: email },
    subject: `You've been invited to join ${org?.name ?? 'a team'}`,
    htmlContent: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px"><h2>You've been invited!</h2><p>${profile.full_name || 'Someone'} has invited you to join <strong>${org?.name ?? 'their team'}</strong> as <strong>${role}</strong>.</p><a href="${host}/invite/${invite.token}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500">Accept Invitation</a><p style="color:#94a3b8;font-size:12px;margin-top:24px">Expires in 7 days.</p></div>`,
    fromName: org?.name ?? 'MailFlow',
    fromEmail: process.env.BREVO_FROM_EMAIL ?? 'noreply@mailflow.app',
  }).catch(() => {})

  revalidatePath('/settings/team')
}

export async function updateMemberRole(profileId: string, newRole: Role) {
  const { supabase, profile } = await getCallerProfile()
  const { data: target } = await supabase.from('profiles').select('role').eq('id', profileId).single()
  if (!target) throw new Error('Member not found')
  if (!canManageMember(profile.role as Role, target.role as Role)) throw new Error('Not authorized')
  if (newRole === 'owner') throw new Error('Cannot assign owner role')
  await supabase.from('profiles').update({ role: newRole }).eq('id', profileId)
  revalidatePath('/settings/team')
}

export async function removeMember(profileId: string) {
  const { supabase, profile } = await getCallerProfile()
  const { data: target } = await supabase.from('profiles').select('role').eq('id', profileId).single()
  if (!target) throw new Error('Member not found')
  if (!canManageMember(profile.role as Role, target.role as Role)) throw new Error('Not authorized')
  await supabase.from('profiles').update({ organization_id: null }).eq('id', profileId)
  revalidatePath('/settings/team')
}

export async function revokeInvitation(invitationId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!canInvite(profile.role as Role)) throw new Error('Not authorized')
  await supabase.from('invitations').delete().eq('id', invitationId)
  revalidatePath('/settings/team')
}

export async function acceptInvitation(token: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  const { data: invite } = await supabase
    .from('invitations').select('*')
    .eq('token', token).is('accepted_at', null)
    .gt('expires_at', new Date().toISOString()).single()
  if (!invite) throw new Error('Invitation not found or expired')

  await supabase.from('profiles').update({ organization_id: invite.organization_id, role: invite.role }).eq('id', user.id)
  await supabase.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)
}
