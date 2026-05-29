import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // If onboarding not complete, redirect
  if (!profile.full_name) redirect('/onboarding')

  const profileData = {
    full_name: profile.full_name,
    organizations: {
      name: (profile.organizations as { name: string } | null)?.name ?? '',
    },
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar profile={profileData} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar profile={profileData} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
