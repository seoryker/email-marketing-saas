import { createClient } from '@/lib/supabase/server'
import type { Campaign } from '@/lib/campaigns/types'

export type CampaignWithStats = Campaign & {
  stats: {
    total_sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    unsubscribed: number
    open_rate: number
    click_rate: number
  }
}

export type ContactActivity = {
  contact_id: string
  first_name: string
  last_name: string
  email: string
  status: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
}

export type LinkBreakdown = {
  link_url: string
  click_count: number
}

export type OpensBucket = {
  bucket: string
  count: number
}

export async function getCampaignsWithStats(): Promise<CampaignWithStats[]> {
  const supabase = await createClient()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })

  if (!campaigns?.length) return []

  const campaignIds = campaigns.map((c: any) => c.id)

  const { data: statsRows } = await supabase
    .from('campaign_stats')
    .select('*')
    .in('campaign_id', campaignIds)

  const statsMap = new Map((statsRows ?? []).map((s: any) => [s.campaign_id, s]))

  return campaigns.map((c: any) => {
    const s = statsMap.get(c.id) ?? {
      total_sent: 0, delivered: 0, opened: 0,
      clicked: 0, bounced: 0, unsubscribed: 0,
    }
    const open_rate = s.total_sent > 0 ? Math.round((s.opened / s.total_sent) * 100) : 0
    const click_rate = s.total_sent > 0 ? Math.round((s.clicked / s.total_sent) * 100) : 0
    return { ...c, stats: { ...s, open_rate, click_rate } }
  }) as CampaignWithStats[]
}

export async function getContactActivity(
  campaignId: string,
  page = 1
): Promise<{ rows: ContactActivity[]; total: number }> {
  const supabase = await createClient()
  const PER_PAGE = 50

  const { data, count } = await supabase
    .from('campaign_sends')
    .select(
      'contact_id, status, sent_at, opened_at, clicked_at, contacts(first_name, last_name, email)',
      { count: 'exact' }
    )
    .eq('campaign_id', campaignId)
    .order('sent_at', { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  const rows: ContactActivity[] = (data ?? []).map((r: any) => ({
    contact_id: r.contact_id,
    first_name: r.contacts?.first_name ?? '',
    last_name: r.contacts?.last_name ?? '',
    email: r.contacts?.email ?? '',
    status: r.status,
    sent_at: r.sent_at,
    opened_at: r.opened_at,
    clicked_at: r.clicked_at,
  }))

  return { rows, total: count ?? 0 }
}

export async function getLinkBreakdown(campaignId: string): Promise<LinkBreakdown[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('campaign_sends')
    .select('link_url')
    .eq('campaign_id', campaignId)
    .eq('status', 'clicked')
    .not('link_url', 'is', null)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.link_url) {
      counts.set(row.link_url, (counts.get(row.link_url) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([link_url, click_count]) => ({ link_url, click_count }))
    .sort((a, b) => b.click_count - a.click_count)
}

export async function getOpensOverTime(
  campaignId: string,
  sentAt: string
): Promise<OpensBucket[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('campaign_sends')
    .select('opened_at')
    .eq('campaign_id', campaignId)
    .not('opened_at', 'is', null)

  const sent = new Date(sentAt).getTime()

  const buckets: Record<string, number> = {
    '1h': 0, '2h': 0, '3h': 0, '4h': 0,
    '6h': 0, '12h': 0, '1d': 0, '2d': 0,
    '3d': 0, '4d': 0, '5d': 0, '6d+': 0,
  }

  const thresholds: [string, number][] = [
    ['1h', 1], ['2h', 2], ['3h', 3], ['4h', 4],
    ['6h', 6], ['12h', 12], ['1d', 24], ['2d', 48],
    ['3d', 72], ['4d', 96], ['5d', 120], ['6d+', Infinity],
  ]

  for (const row of data ?? []) {
    if (!row.opened_at) continue
    const hoursAfter = (new Date(row.opened_at).getTime() - sent) / 3_600_000
    for (const [label, maxHours] of thresholds) {
      if (hoursAfter <= maxHours) {
        buckets[label]++
        break
      }
    }
  }

  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }))
}
