import { createClient } from '@/lib/supabase/server'

export type GrowthPoint = { day: string; new_contacts: number; emails_sent: number }
export type NetGrowthPoint = { week: string; net_new: number }
export type OpenRatePoint = { day: string; avg_open_rate: number }
export type AutomationFunnel = {
  automation_id: string
  name: string
  status: string
  enrolled: number
  completion_rate: number
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
  const avg_open_rate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0

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

  const [{ data: byStatus }, { data: growthRows }, { data: unsubRows }] = await Promise.all([
    supabase.from('contacts').select('status'),
    supabase.from('subscriber_growth_daily').select('day, new_contacts').gte('day', since.split('T')[0]),
    supabase.from('unsubscribe_daily').select('day, unsubscribed').gte('day', since.split('T')[0]),
  ])

  const rows = byStatus ?? []
  const total = rows.length
  const active = rows.filter((r: any) => r.status === 'active').length
  const unsubscribed = rows.filter((r: any) => r.status === 'unsubscribed').length
  const bounced = rows.filter((r: any) => r.status === 'bounced').length
  const health_pct = total > 0 ? Math.round((active / total) * 100) : 0

  const gMap = new Map<string, number>()
  for (const r of growthRows ?? []) gMap.set(r.day, (gMap.get(r.day) ?? 0) + Number(r.new_contacts))
  const uMap = new Map<string, number>()
  for (const r of unsubRows ?? []) uMap.set(r.day, (uMap.get(r.day) ?? 0) + Number(r.unsubscribed))

  const net_growth_chart: NetGrowthPoint[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(Date.now() - (weeks - 1 - i) * 7 * 86400000)
    let net = 0
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart.getTime() + d * 86400000).toISOString().split('T')[0]
      net += (gMap.get(day) ?? 0) - (uMap.get(day) ?? 0)
    }
    return { week: `W${i + 1}`, net_new: net }
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
  const avg_open_rate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
  const avg_click_rate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0

  const open_rate_trend: OpenRatePoint[] = (trendRows ?? []).map((r: any) => ({
    day: r.day,
    avg_open_rate: Number(r.avg_open_rate) ?? 0,
  }))

  const campaignIds = (topCampaigns ?? []).map((c: any) => c.id)
  const { data: statsForTop } = await supabase.from('campaign_stats').select('campaign_id, total_sent, opened').in('campaign_id', campaignIds)
  const statsMap = new Map((statsForTop ?? []).map((s: any) => [s.campaign_id, s]))

  const top_campaigns = (topCampaigns ?? [])
    .map((c: any) => {
      const s = statsMap.get(c.id)
      const open_rate = s && Number(s.total_sent) > 0 ? Math.round((Number(s.opened) / Number(s.total_sent)) * 100) : 0
      return { name: c.name, open_rate, sent_at: c.sent_at }
    })
    .sort((a: any, b: any) => b.open_rate - a.open_rate)
    .slice(0, 5)

  return { campaigns_this_month: campaigns_this_month ?? 0, avg_open_rate, avg_click_rate, open_rate_trend, top_campaigns }
}

export async function getAutomationFunnels(): Promise<AutomationFunnel[]> {
  const supabase = await createClient()
  const { data: automations } = await supabase.from('automations').select('id, name, status').eq('status', 'active')
  if (!automations?.length) return []

  const results: AutomationFunnel[] = []
  for (const auto of automations) {
    const [{ count: enrolled }, { data: steps }, { data: completedEnrollments }] = await Promise.all([
      supabase.from('automation_enrollments').select('*', { count: 'exact', head: true }).eq('automation_id', auto.id),
      supabase.from('automation_steps').select('id, type').eq('automation_id', auto.id).order('position_y'),
      supabase.from('automation_enrollments').select('id').eq('automation_id', auto.id).eq('status', 'completed'),
    ])

    const LABELS: Record<string, string> = {
      send_email: 'Send email',
      wait: 'Wait',
      condition: 'Condition',
      add_tag: 'Add tag',
      add_to_list: 'Add to list',
      end: 'End',
    }

    const stepFunnels = await Promise.all(
      (steps ?? []).map(async (step: any) => {
        const { count } = await supabase
          .from('automation_step_states')
          .select('*', { count: 'exact', head: true })
          .eq('step_id', step.id)
          .eq('status', 'completed')
        return { step_id: step.id, label: LABELS[step.type] ?? step.type, completed: count ?? 0 }
      })
    )

    const total = enrolled ?? 0
    const done = completedEnrollments?.length ?? 0
    results.push({
      automation_id: auto.id,
      name: auto.name,
      status: auto.status,
      enrolled: total,
      completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
      steps: stepFunnels,
    })
  }
  return results
}
