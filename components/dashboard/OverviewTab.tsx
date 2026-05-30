'use client'
import dynamic from 'next/dynamic'
import type { GrowthPoint } from '@/lib/dashboard/queries'

const ComposedChartComponent = dynamic(() => import('recharts').then(m => {
  const { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } = m
  return {
    default: ({ data }: { data: GrowthPoint[] }) => (
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart data={data}>
          <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            interval={Math.floor(data.length / 6)} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Bar dataKey="emails_sent" name="Emails sent" fill="#bfdbfe" radius={[2,2,0,0]} />
          <Line dataKey="new_contacts" name="New contacts" stroke="#10b981" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }
}), { ssr: false })

type Props = {
  total_contacts: number
  emails_sent_this_month: number
  avg_open_rate: number
  growth_chart: GrowthPoint[]
  recent_campaigns: Array<{ name: string; open_rate: number; click_rate: number; sent_at: string | null }>
}

export default function OverviewTab({ total_contacts, emails_sent_this_month, avg_open_rate, growth_chart, recent_campaigns }: Props) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Contacts', value: total_contacts.toLocaleString(), color: 'text-slate-900' },
          { label: 'Avg Open Rate', value: `${avg_open_rate}%`, color: 'text-green-600' },
          { label: 'Emails Sent This Month', value: emails_sent_this_month.toLocaleString(), color: 'text-blue-600' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="mt-1 text-xs text-slate-400">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-700">Growth & Emails — Last 30 days</p>
          <div className="flex gap-4 text-xs text-slate-400">
            <span><span className="text-blue-300">■</span> Emails sent</span>
            <span><span className="text-green-500">—</span> New contacts</span>
          </div>
        </div>
        <ComposedChartComponent data={growth_chart} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3">
          <p className="text-xs font-medium text-slate-700">Recent Campaigns</p>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium text-slate-500">Campaign</th>
              <th className="px-5 py-2.5 text-left font-medium text-slate-500">Open rate</th>
              <th className="px-5 py-2.5 text-left font-medium text-slate-500">Click rate</th>
              <th className="px-5 py-2.5 text-left font-medium text-slate-500">Sent</th>
            </tr>
          </thead>
          <tbody>
            {recent_campaigns.map(c => (
              <tr key={c.name} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-2.5 font-medium text-slate-900">{c.name}</td>
                <td className="px-5 py-2.5 text-green-600">{c.open_rate}%</td>
                <td className="px-5 py-2.5 text-blue-600">{c.click_rate}%</td>
                <td className="px-5 py-2.5 text-slate-400">
                  {c.sent_at ? new Date(c.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </td>
              </tr>
            ))}
            {recent_campaigns.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No campaigns sent yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
