import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers, getPendingInvitations } from '@/lib/team/queries'
import TeamMembersList from '@/components/settings/TeamMembersList'

export default async function TeamSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const [members, invitations] = await Promise.all([getTeamMembers(), getPendingInvitations()])
  return (
    <div className="max-w-2xl">
      <TeamMembersList members={members} invitations={invitations} currentUserId={profile.id} currentUserRole={profile.role} />
    </div>
  )
}
