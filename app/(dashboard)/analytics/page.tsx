import { Suspense } from 'react'
import { getCampaignsWithStats, getContactActivity, getLinkBreakdown, getOpensOverTime } from '@/lib/analytics/queries'
import AnalyticsClient from './AnalyticsClient'

type Props = {
  searchParams: Promise<{ id?: string; activityPage?: string }>
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams
  const activityPage = Number(params.activityPage ?? 1)

  const campaigns = await getCampaignsWithStats()
  const selectedId = params.id ?? campaigns[0]?.id ?? null

  const [activity, links, opens] = selectedId
    ? await Promise.all([
        getContactActivity(selectedId, activityPage),
        getLinkBreakdown(selectedId),
        getOpensOverTime(
          selectedId,
          campaigns.find(c => c.id === selectedId)?.sent_at ?? new Date().toISOString()
        ),
      ])
    : [{ rows: [], total: 0 }, [], []]

  return (
    <Suspense>
      <AnalyticsClient
        campaigns={campaigns}
        initialSelected={selectedId}
        initialActivity={activity}
        initialLinks={links}
        initialOpens={opens}
      />
    </Suspense>
  )
}
