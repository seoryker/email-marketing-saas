import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          {greeting}, {firstName} 👋
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Here&apos;s what&apos;s happening with your account
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Campaigns" value={0} sub="No campaigns yet" />
        <KpiCard label="Emails Sent" value={0} sub="This month" />
        <KpiCard label="Contacts" value={0} sub="Import to start" />
        <a
          href="/campaigns"
          className="flex flex-col justify-center rounded-xl bg-blue-600 p-5 text-white hover:bg-blue-700 transition-colors"
        >
          <p className="text-xs text-blue-200">Quick Start</p>
          <p className="mt-1 text-sm font-semibold">Create your first campaign →</p>
        </a>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Ready to send your first email?</h3>
        <p className="mt-1.5 text-xs text-slate-500">
          Import contacts or create a campaign to get started
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <a
            href="/campaigns"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Create Campaign
          </a>
          <a
            href="/contacts"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Import Contacts
          </a>
        </div>
      </div>
    </div>
  )
}
