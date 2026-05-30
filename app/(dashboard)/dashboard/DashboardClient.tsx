'use client'
import { useState } from 'react'
import OverviewTab from '@/components/dashboard/OverviewTab'
import SubscribersTab from '@/components/dashboard/SubscribersTab'
import CampaignsTab from '@/components/dashboard/CampaignsTab'
import AutomationsTab from '@/components/dashboard/AutomationsTab'
import type { GrowthPoint, NetGrowthPoint, OpenRatePoint, AutomationFunnel } from '@/lib/dashboard/queries'

type Props = {
  overview: { total_contacts: number; emails_sent_this_month: number; avg_open_rate: number; growth_chart: GrowthPoint[] }
  recentCampaigns: Array<{ name: string; open_rate: number; click_rate: number; sent_at: string | null }>
  subscribers: { total: number; active: number; unsubscribed: number; bounced: number; health_pct: number; net_growth_chart: NetGrowthPoint[] }
  campaigns: { campaigns_this_month: number; avg_open_rate: number; avg_click_rate: number; open_rate_trend: OpenRatePoint[]; top_campaigns: Array<{ name: string; open_rate: number; sent_at: string | null }> }
  automationFunnels: AutomationFunnel[]
}

const TABS = ['Overview', 'Subscribers', 'Campaigns', 'Automations'] as const
type Tab = typeof TABS[number]

export default function DashboardClient({ overview, recentCampaigns, subscribers, campaigns, automationFunnels }: Props) {
  const [tab, setTab] = useState<Tab>('Overview')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>

      <div className="flex border-b border-slate-200">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab {...overview} recent_campaigns={recentCampaigns} />}
      {tab === 'Subscribers' && <SubscribersTab {...subscribers} />}
      {tab === 'Campaigns' && <CampaignsTab {...campaigns} />}
      {tab === 'Automations' && <AutomationsTab funnels={automationFunnels} />}
    </div>
  )
}
