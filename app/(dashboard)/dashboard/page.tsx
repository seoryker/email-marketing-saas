import { getOverviewStats, getSubscriberStats, getCampaignStats, getAutomationFunnels } from '@/lib/dashboard/queries'
import { getCampaigns } from '@/lib/campaigns/queries'
import { getCampaignsWithStats } from '@/lib/analytics/queries'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const [overview, subscribers, campaignStats, automationFunnels, campaigns, statsRows] = await Promise.all([
    getOverviewStats(30),
    getSubscriberStats(12),
    getCampaignStats(),
    getAutomationFunnels(),
    getCampaigns(),
    getCampaignsWithStats(),
  ])

  const statsMap = new Map(statsRows.map(s => [s.id, s]))
  const recentCampaigns = campaigns.slice(0, 5).map(c => {
    const s = statsMap.get(c.id)
    return {
      name: c.name,
      open_rate: s?.stats.open_rate ?? 0,
      click_rate: s?.stats.click_rate ?? 0,
      sent_at: c.sent_at,
    }
  })

  return (
    <DashboardClient
      overview={overview}
      recentCampaigns={recentCampaigns}
      subscribers={subscribers}
      campaigns={campaignStats}
      automationFunnels={automationFunnels}
    />
  )
}
