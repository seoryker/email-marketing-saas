'use client'
import dynamic from 'next/dynamic'
import type { OpenRatePoint } from '@/lib/dashboard/queries'

const LineChartComponent = dynamic(() => import('recharts').then(m => {
  const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } = m
  return {
    default: ({ data }: { data: OpenRatePoint[] }) => (
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            interval={Math.floor(data.length / 6)} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28}
            tickFormatter={(v: number) => `${v}%`} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`${v}%`, 'Avg open rate']} />
          <Line dataKey="avg_open_rate" stroke="#8b5cf6" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    )
  }
}), { ssr: false })

type Props = {
  campaigns_this_month: number; avg_open_rate: number; avg_click_rate: number
  open_rate_trend: OpenRatePoint[]
  top_campaigns: Array<{ name: string; open_rate: number; sent_at: string | null }>
}

export default function CampaignsTab({ campaigns_this_month, avg_open_rate, avg_click_rate, open_rate_trend, top_campaigns }: Props) {
  const maxRate = Math.max(...top_campaigns.map(c => c.open_rate), 1)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Campaigns This Month', value: String(campaigns_this_month), color: 'text-slate-900' },
          { label: 'Avg Open Rate', value: `${avg_open_rate}%`, color: 'text-purple-600' },
          { label: 'Avg Click Rate', value: `${avg_click_rate}%`, color: 'text-blue-600' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="mt-1 text-xs text-slate-400">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-xs font-medium text-slate-700">Open Rate Trend — Last 90 days</p>
        <LineChartComponent data={open_rate_trend} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-xs font-medium text-slate-700">Top Campaigns by Open Rate</p>
        <div className="space-y-3">
          {top_campaigns.map(c => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="w-36 truncate text-xs text-slate-700">{c.name}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-purple-500" style={{ width: `${(c.open_rate / maxRate) * 100}%` }} />
              </div>
              <span className="text-xs font-semibold text-purple-600 w-8 text-right">{c.open_rate}%</span>
            </div>
          ))}
          {top_campaigns.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No campaigns sent yet</p>}
        </div>
      </div>
    </div>
  )
}
