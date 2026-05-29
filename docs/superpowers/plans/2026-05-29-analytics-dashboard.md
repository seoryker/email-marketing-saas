# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the /dashboard home page with a 4-tab analytics dashboard (Overview, Subscribers, Campaigns, Automations) powered by SQL views on existing data.

**Architecture:** SQL views aggregate subscriber growth, campaign performance, and automation funnels from existing tables. Server Component fetches all data in parallel, passes to DashboardClient which manages tab state. recharts renders charts client-side.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, recharts (already installed)

---

## File Map

| File | Role | New/Edit |
|---|---|---|
| `supabase/migrations/006_analytics_dashboard.sql` | SQL views for analytics | New |
| `lib/dashboard/queries.ts` | Data fetching functions | New |
| `components/dashboard/OverviewTab.tsx` | Overview tab UI + charts | New |
| `components/dashboard/SubscribersTab.tsx` | Subscribers tab UI + charts | New |
| `components/dashboard/CampaignsTab.tsx` | Campaigns tab UI + charts | New |
| `components/dashboard/AutomationsTab.tsx` | Automations funnel cards | New |
| `app/(dashboard)/dashboard/DashboardClient.tsx` | Tab state manager (client) | New |
| `app/(dashboard)/dashboard/page.tsx` | Server Component — replace existing | Edit |

---

## Task 1: DB Migration (SQL Views)

- [ ] Create `supabase/migrations/006_analytics_dashboard.sql`:

```sql
create or replace view public.subscriber_growth_daily as
select
  organization_id,
  date_trunc('day', created_at)::date as day,
  count(*) as new_contacts
from public.contacts
group by 1, 2;

create or replace view public.unsubscribe_daily as
select
  organization_id,
  date_trunc('day', updated_at)::date as day,
  count(*) as unsubscribed
from public.contacts
where status = 'unsubscribed'
group by 1, 2;

create or replace view public.campaign_performance_daily as
select
  c.organization_id,
  date_trunc('day', c.sent_at)::date as day,
  count(distinct c.id) as campaigns_sent,
  round(avg(
    case when s.total_sent > 0 then s.opened::numeric / s.total_sent * 100 else 0 end
  ), 1) as avg_open_rate,
  round(avg(
    case when s.total_sent > 0 then s.clicked::numeric / s.total_sent * 100 else 0 end
  ), 1) as avg_click_rate
from public.campaigns c
join public.campaign_stats s on s.campaign_id = c.id
where c.status = 'sent' and c.sent_at is not null
group by 1, 2;
```

- [ ] Apply in Supabase SQL Editor (Dashboard → SQL Editor → paste and run).
- [ ] `git add supabase/migrations/006_analytics_dashboard.sql && git commit -m "feat: add analytics SQL views (migration 006)"`

---

## Task 2: Dashboard Queries

- [ ] Create `lib/dashboard/queries.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'

export type GrowthPoint = { day: string; new_contacts: number; emails_sent: number }
export type NetGrowthPoint = { week: string; net_new: number }
export type OpenRatePoint = { day: string; avg_open_rate: number }
export type AutomationFunnel = {
  automation_id: string; name: string; status: string
  enrolled: number; completion_rate: number
  steps: Array<{ step_id: string; label: string; completed: number }>
}

export async function getOverviewStats(days = 30) {
  const supabase = await createClient()

  const since = new Date(Date.now() - days * 86400000).toISOString()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [
    { count: total_contacts },
    { data: emailsSentData },
    { data: campaignStatsRows },
    { data: growthRows },
    { data: emailRows },
  ] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }),
    supabase.from('campaigns').select('recipient_count').eq('status', 'sent').gte('sent_at', monthStart),
    supabase.from('campaign_stats').select('total_sent, opened'),
    supabase.from('subscriber_growth_daily').select('day, new_contacts').gte('day', since.split('T')[0]).order('day'),
    supabase.from('campaign_performance_daily').select('day, campaigns_sent').gte('day', since.split('T')[0]).order('day'),
  ])

  const emails_sent_this_month = (emailsSentData ?? []).reduce((s: number, r: any) => s + (r.recipient_count ?? 0), 0)
  const totalSent = (campaignStatsRows ?? []).reduce((s: number, r: any) => s + Number(r.total_sent), 0)
  const totalOpened = (campaignStatsRows ?? []).reduce((s: number, r: any) => s + Number(r.opened), 0)
  const avg_open_rate = totalSent > 0 ? Math.round(totalOpened / totalSent * 100) : 0

  const growthMap = new Map((growthRows ?? []).map((r: any) => [r.day, Number(r.new_contacts)]))
  const emailMap = new Map((emailRows ?? []).map((r: any) => [r.day, Number(r.campaigns_sent)]))

  const growth_chart: GrowthPoint[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().split('T')[0]
    return { day: d, new_contacts: growthMap.get(d) ?? 0, emails_sent: emailMap.get(d) ?? 0 }
  })

  return { total_contacts: total_contacts ?? 0, emails_sent_this_month, avg_open_rate, growth_chart }
}

export async function getSubscriberStats(weeks = 12) {
  const supabase = await createClient()
  const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString()

  const [
    { data: byStatus },
    { data: growthRows },
    { data: unsubRows },
  ] = await Promise.all([
    supabase.from('contacts').select('status'),
    supabase.from('subscriber_growth_daily').select('day, new_contacts').gte('day', since.split('T')[0]),
    supabase.from('unsubscribe_daily').select('day, unsubscribed').gte('day', since.split('T')[0]),
  ])

  const rows = byStatus ?? []
  const total = rows.length
  const active = rows.filter((r: any) => r.status === 'active').length
  const unsubscribed = rows.filter((r: any) => r.status === 'unsubscribed').length
  const bounced = rows.filter((r: any) => r.status === 'bounced').length
  const health_pct = total > 0 ? Math.round(active / total * 100) : 0

  const gMap = new Map<string, number>()
  for (const r of growthRows ?? []) gMap.set(r.day, (gMap.get(r.day) ?? 0) + Number(r.new_contacts))
  const uMap = new Map<string, number>()
  for (const r of unsubRows ?? []) uMap.set(r.day, (uMap.get(r.day) ?? 0) + Number(r.unsubscribed))

  const net_growth_chart: NetGrowthPoint[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(Date.now() - (weeks - 1 - i) * 7 * 86400000)
    const label = `W${i + 1}`
    let net = 0
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart.getTime() + d * 86400000).toISOString().split('T')[0]
      net += (gMap.get(day) ?? 0) - (uMap.get(day) ?? 0)
    }
    return { week: label, net_new: net }
  })

  return { total, active, unsubscribed, bounced, health_pct, net_growth_chart }
}

export async function getCampaignStats() {
  const supabase = await createClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

  const [
    { count: campaigns_this_month },
    { data: allStats },
    { data: trendRows },
    { data: topCampaigns },
  ] = await Promise.all([
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', monthStart),
    supabase.from('campaign_stats').select('total_sent, opened, clicked'),
    supabase.from('campaign_performance_daily').select('day, avg_open_rate').gte('day', since90).order('day'),
    supabase.from('campaigns').select('name, sent_at, id').eq('status', 'sent').order('sent_at', { ascending: false }).limit(20),
  ])

  const totalSent = (allStats ?? []).reduce((s: number, r: any) => s + Number(r.total_sent), 0)
  const totalOpened = (allStats ?? []).reduce((s: number, r: any) => s + Number(r.opened), 0)
  const totalClicked = (allStats ?? []).reduce((s: number, r: any) => s + Number(r.clicked), 0)
  const avg_open_rate = totalSent > 0 ? Math.round(totalOpened / totalSent * 100) : 0
  const avg_click_rate = totalSent > 0 ? Math.round(totalClicked / totalSent * 100) : 0

  const open_rate_trend: OpenRatePoint[] = (trendRows ?? []).map((r: any) => ({
    day: r.day, avg_open_rate: Number(r.avg_open_rate) ?? 0,
  }))

  const campaignIds = (topCampaigns ?? []).map((c: any) => c.id)
  const { data: statsForTop } = await supabase
    .from('campaign_stats').select('campaign_id, total_sent, opened').in('campaign_id', campaignIds)
  const statsMap = new Map((statsForTop ?? []).map((s: any) => [s.campaign_id, s]))

  const top_campaigns = (topCampaigns ?? [])
    .map((c: any) => {
      const s = statsMap.get(c.id)
      const open_rate = s && Number(s.total_sent) > 0
        ? Math.round(Number(s.opened) / Number(s.total_sent) * 100) : 0
      return { name: c.name, open_rate, sent_at: c.sent_at }
    })
    .sort((a: any, b: any) => b.open_rate - a.open_rate)
    .slice(0, 5)

  return { campaigns_this_month: campaigns_this_month ?? 0, avg_open_rate, avg_click_rate, open_rate_trend, top_campaigns }
}

export async function getAutomationFunnels(): Promise<AutomationFunnel[]> {
  const supabase = await createClient()

  const { data: automations } = await supabase
    .from('automations').select('id, name, status').eq('status', 'active')

  if (!automations?.length) return []

  const results: AutomationFunnel[] = []

  for (const auto of automations) {
    const [{ count: enrolled }, { data: steps }, { data: completedEnrollments }] = await Promise.all([
      supabase.from('automation_enrollments').select('*', { count: 'exact', head: true }).eq('automation_id', auto.id),
      supabase.from('automation_steps').select('id, type, config').eq('automation_id', auto.id).order('position_y'),
      supabase.from('automation_enrollments').select('id').eq('automation_id', auto.id).eq('status', 'completed'),
    ])

    const stepFunnels = await Promise.all((steps ?? []).map(async (step: any) => {
      const { count } = await supabase
        .from('automation_step_states')
        .select('*', { count: 'exact', head: true })
        .eq('step_id', step.id)
        .eq('status', 'completed')

      const LABELS: Record<string, string> = {
        send_email: 'Send email', wait: 'Wait', condition: 'Condition',
        add_tag: 'Add tag', add_to_list: 'Add to list', end: 'End',
      }
      return { step_id: step.id, label: LABELS[step.type] ?? step.type, completed: count ?? 0 }
    }))

    const total = enrolled ?? 0
    const done = completedEnrollments?.length ?? 0
    results.push({
      automation_id: auto.id, name: auto.name, status: auto.status,
      enrolled: total,
      completion_rate: total > 0 ? Math.round(done / total * 100) : 0,
      steps: stepFunnels,
    })
  }

  return results
}
```

- [ ] `git add lib/dashboard/queries.ts && git commit -m "feat: add dashboard data queries"`

---

## Task 3: Tab Components

- [ ] Create `components/dashboard/OverviewTab.tsx`:

```typescript
'use client'
import dynamic from 'next/dynamic'
import type { GrowthPoint } from '@/lib/dashboard/queries'

const ComposedChart = dynamic(() => import('recharts').then(m => ({
  default: ({ data, ...p }: any) => {
    const { ComposedChart: C, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } = require('recharts')
    return (
      <ResponsiveContainer width="100%" height={120}>
        <C data={data} {...p}>
          <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            interval={Math.floor(data.length / 6)} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Bar dataKey="emails_sent" name="Emails sent" fill="#bfdbfe" radius={[2,2,0,0]} />
          <Line dataKey="new_contacts" name="New contacts" stroke="#10b981" dot={false} strokeWidth={2} />
        </C>
      </ResponsiveContainer>
    )
  }
})), { ssr: false })

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
            <span><span className="text-blue-400">■</span> Emails sent</span>
            <span><span className="text-green-500">—</span> New contacts</span>
          </div>
        </div>
        <ComposedChart data={growth_chart} />
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
```

- [ ] Create `components/dashboard/SubscribersTab.tsx`:

```typescript
'use client'
import dynamic from 'next/dynamic'
import type { NetGrowthPoint } from '@/lib/dashboard/queries'

const BarChart = dynamic(() => import('recharts').then(m => ({
  default: ({ data }: { data: NetGrowthPoint[] }) => {
    const { BarChart: BC, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } = require('recharts')
    return (
      <ResponsiveContainer width="100%" height={120}>
        <BC data={data}>
          <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Bar dataKey="net_new" name="Net new" fill="#10b981" radius={[3,3,0,0]} />
        </BC>
      </ResponsiveContainer>
    )
  }
})), { ssr: false })

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
        <BarChart data={net_growth_chart} />
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
```

- [ ] Create `components/dashboard/CampaignsTab.tsx`:

```typescript
'use client'
import dynamic from 'next/dynamic'
import type { OpenRatePoint } from '@/lib/dashboard/queries'

const LineChart = dynamic(() => import('recharts').then(m => ({
  default: ({ data }: { data: OpenRatePoint[] }) => {
    const { LineChart: LC, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } = require('recharts')
    return (
      <ResponsiveContainer width="100%" height={120}>
        <LC data={data}>
          <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            interval={Math.floor(data.length / 6)} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28}
            tickFormatter={(v: number) => `${v}%`} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`${v}%`, 'Avg open rate']} />
          <Line dataKey="avg_open_rate" stroke="#8b5cf6" dot={false} strokeWidth={2} />
        </LC>
      </ResponsiveContainer>
    )
  }
})), { ssr: false })

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
        <LineChart data={open_rate_trend} />
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
```

- [ ] Create `components/dashboard/AutomationsTab.tsx`:

```typescript
import type { AutomationFunnel } from '@/lib/dashboard/queries'

export default function AutomationsTab({ funnels }: { funnels: AutomationFunnel[] }) {
  if (funnels.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
        <p className="text-sm text-slate-400">No active automations yet.</p>
        <a href="/automations/new" className="mt-3 inline-block text-xs text-blue-600 hover:underline">+ Create your first automation</a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {funnels.map(auto => {
        const maxCompleted = Math.max(...auto.steps.map(s => s.completed), auto.enrolled, 1)
        return (
          <div key={auto.automation_id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">⚡ {auto.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{auto.enrolled.toLocaleString()} enrolled · {auto.completion_rate}% completion</p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col items-center gap-1.5">
                <div className="w-full rounded-t bg-blue-500" style={{ height: `${Math.round((auto.enrolled / maxCompleted) * 80)}px` }} />
                <p className="text-[9px] text-slate-400 text-center">Enrolled</p>
                <p className="text-[10px] font-semibold text-slate-700">{auto.enrolled}</p>
              </div>
              {auto.steps.map((step, i) => (
                <div key={step.step_id} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`w-full rounded-t ${i === auto.steps.length - 1 ? 'bg-green-500' : 'bg-blue-200'}`}
                    style={{ height: `${Math.round((step.completed / maxCompleted) * 80)}px` }}
                  />
                  <p className="text-[9px] text-slate-400 text-center truncate w-full">{step.label}</p>
                  <p className="text-[10px] font-semibold text-slate-700">{step.completed}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] `git add components/dashboard/ && git commit -m "feat: add dashboard tab components (Overview, Subscribers, Campaigns, Automations)"`

---

## Task 4: DashboardClient + Replace /dashboard page

- [ ] Create `app/(dashboard)/dashboard/DashboardClient.tsx`:

```typescript
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
      </div>

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
```

- [ ] Replace `app/(dashboard)/dashboard/page.tsx` with the following (read the existing file first, then overwrite):

```typescript
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
```

- [ ] `npx tsc --noEmit` — fix any TypeScript errors before committing.
- [ ] `git add app/(dashboard)/dashboard/ && git commit -m "feat: replace dashboard page with 4-tab analytics dashboard"`
- [ ] `git tag v0.5.0-analytics-dashboard`

---

## Acceptance Criteria

- [ ] `/dashboard` loads all four tabs without errors.
- [ ] Overview tab shows 3 KPI cards and a combined bar+line chart with 30 days of data.
- [ ] Subscribers tab shows 4 stat cards, 12-week net growth bar chart, and list health bar.
- [ ] Campaigns tab shows 3 stat cards, 90-day open rate trend, and top-5 campaigns bar list.
- [ ] Automations tab shows funnel cards for each active automation; shows empty state when none exist.
- [ ] All charts render client-side only (no SSR hydration errors).
- [ ] `npx tsc --noEmit` passes with zero errors.
