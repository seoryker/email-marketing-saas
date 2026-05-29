'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CampaignStatsList from '@/components/analytics/CampaignStatsList'
import CampaignStatsPanel from '@/components/analytics/CampaignStatsPanel'
import type { CampaignWithStats, ContactActivity, LinkBreakdown, OpensBucket } from '@/lib/analytics/queries'

type Props = {
  campaigns: CampaignWithStats[]
  initialSelected: string | null
  initialActivity: { rows: ContactActivity[]; total: number }
  initialLinks: LinkBreakdown[]
  initialOpens: OpensBucket[]
}

export default function AnalyticsClient({
  campaigns, initialSelected, initialActivity, initialLinks, initialOpens,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activityPage, setActivityPage] = useState(1)
  const [, startTransition] = useTransition()

  const selectedId = searchParams.get('id') ?? initialSelected
  const selected = campaigns.find(c => c.id === selectedId) ?? campaigns[0] ?? null

  function handleSelect(id: string) {
    setActivityPage(1)
    const params = new URLSearchParams(searchParams.toString())
    params.set('id', id)
    params.delete('activityPage')
    router.push(`/analytics?${params.toString()}`)
  }

  function handlePageChange(page: number) {
    setActivityPage(page)
    const params = new URLSearchParams(searchParams.toString())
    params.set('activityPage', String(page))
    startTransition(() => router.push(`/analytics?${params.toString()}`))
  }

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        No sent campaigns yet. Send your first campaign to see analytics.
      </div>
    )
  }

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h1 className="text-sm font-semibold text-slate-900">Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">{campaigns.length} sent campaigns</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CampaignStatsList
            campaigns={campaigns}
            selectedId={selected.id}
            onSelect={handleSelect}
          />
        </div>
      </div>

      <CampaignStatsPanel
        campaign={selected}
        opensData={initialOpens}
        activityRows={initialActivity.rows}
        activityTotal={initialActivity.total}
        links={initialLinks}
        onActivityPageChange={handlePageChange}
        activityPage={activityPage}
      />
    </div>
  )
}
