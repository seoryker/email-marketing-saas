import { redirect } from 'next/navigation'
import Script from 'next/script'
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
    .select('id, full_name, avatar_url, role, organization_id, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { data: integrationSettings } = await supabase
    .from('integration_settings')
    .select('ga_measurement_id')
    .eq('organization_id', (profile as any).organization_id ?? '')
    .single()
  const gaMeasurementId = integrationSettings?.ga_measurement_id ?? null

  // If onboarding not complete, redirect
  if (!profile.full_name) redirect('/onboarding')

  const profileData = {
    full_name: profile.full_name,
    organizations: {
      name: (profile.organizations as unknown as { name: string } | null)?.name ?? '',
    },
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {gaMeasurementId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());
            gtag('config','${gaMeasurementId}');
          `}</Script>
        </>
      )}
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
