'use client'
import dynamic from 'next/dynamic'
import type { NetGrowthPoint } from '@/lib/dashboard/queries'

const BarChartComponent = dynamic(() => import('recharts').then(m => {
  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } = m
  return {
    default: ({ data }: { data: NetGrowthPoint[] }) => (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data}>
          <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Bar dataKey="net_new" name="Net new" fill="#10b981" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }
}), { ssr: false })

type Props = {
  total: number; active: number; unsubscribed: number; bounced: number
  health_pct: number; net_growth_chart: NetGrowthPoint[]
}

export default function SubscribersTab({ total, active, unsubscribed, bounced, health_pct, net_growth_chart }: Props) {
  const healthColor = health_pct >= 80 ? 'text-green-600' : health_pct >= 60 ? 'text-amber-600' : 'text-red-600'
  const barColor = health_pct >= 80 ? 'bg-green-500' : health_pct >= 60 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: total, color: 'text-slate-900' },
          { label: 'Active', value: active, color: 'text-green-600' },
          { label: 'Unsubscribed', value: unsubscribed, color: 'text-amber-600' },
          { label: 'Bounced', value: bounced, color: 'text-red-500' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-5 text-center">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-400">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-xs font-medium text-slate-700">Net Subscriber Growth — Last 12 weeks</p>
        <BarChartComponent data={net_growth_chart} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-700">List Health</p>
          <span className={`text-sm font-bold ${healthColor}`}>{health_pct}% healthy</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${health_pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">{active.toLocaleString()} active · {unsubscribed.toLocaleString()} unsubscribed · {bounced.toLocaleString()} bounced</p>
      </div>
    </div>
  )
}
