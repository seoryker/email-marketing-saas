'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import ContactActivityTab from './ContactActivityTab'
import LinkBreakdownTab from './LinkBreakdownTab'
import type { CampaignWithStats, ContactActivity, LinkBreakdown, OpensBucket } from '@/lib/analytics/queries'

const OpensChart = dynamic(() => import('./OpensChart'), { ssr: false })

type Props = {
  campaign: CampaignWithStats
  opensData: OpensBucket[]
  activityRows: ContactActivity[]
  activityTotal: number
  links: LinkBreakdown[]
  onActivityPageChange: (page: number) => void
  activityPage: number
}

const KPI_CONFIG = [
  { key: 'delivered' as const, label: 'Delivered', color: 'text-slate-900' },
  { key: 'opened' as const, label: 'Opened', color: 'text-blue-600' },
  { key: 'clicked' as const, label: 'Clicked', color: 'text-green-600' },
  { key: 'bounced' as const, label: 'Bounced', color: 'text-amber-600' },
  { key: 'unsubscribed' as const, label: 'Unsub', color: 'text-red-500' },
]

export default function CampaignStatsPanel({
  campaign, opensData, activityRows, activityTotal,
  links, onActivityPageChange, activityPage,
}: Props) {
  const [tab, setTab] = useState<'activity' | 'links'>('activity')
  const { stats } = campaign

  function rate(count: number) {
    if (!stats.total_sent) return '0%'
    return `${Math.round((count / stats.total_sent) * 100)}%`
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{campaign.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sent {campaign.sent_at
              ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : '—'}
          </p>
        </div>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">sent</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-5 gap-3">
          {KPI_CONFIG.map(({ key, label, color }) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className={`text-xl font-bold ${color}`}>{stats[key].toLocaleString()}</p>
              <p className="mt-0.5 text-[9px] text-slate-400">{label}</p>
              <p className="text-[10px] text-slate-500">{rate(stats[key])}</p>
            </div>
          ))}
        </div>

        <OpensChart data={opensData} />

        <div>
          <div className="flex border-b border-slate-200 mb-3">
            {(['activity', 'links'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t === 'activity' ? 'Contact Activity' : 'Link Breakdown'}
              </button>
            ))}
          </div>
          {tab === 'activity' && (
            <ContactActivityTab rows={activityRows} total={activityTotal}
              page={activityPage} onPageChange={onActivityPageChange} />
          )}
          {tab === 'links' && <LinkBreakdownTab links={links} />}
        </div>
      </div>
    </div>
  )
}
