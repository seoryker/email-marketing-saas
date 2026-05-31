import { createClient } from '@/lib/supabase/server'

export type TeamMember = {
  id: string
  full_name: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  created_at: string
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
    .not('organization_id', 'is', null)
    .order('created_at')
  return (data ?? []) as TeamMember[]
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
