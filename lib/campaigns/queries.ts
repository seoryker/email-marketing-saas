import { createClient } from '@/lib/supabase/server'
import type { Campaign, CampaignSend } from './types'

export async function getCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as Campaign[]
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()
  return data as Campaign | null
}

export async function getCampaignSendStats(campaignId: string): Promise<{
  total: number
  sent: number
  queued: number
}> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaign_sends')
    .select('status')
    .eq('campaign_id', campaignId)

  const rows = data ?? []
  return {
    total: rows.length,
    sent: rows.filter((r: any) => r.status !== 'queued').length,
    queued: rows.filter((r: any) => r.status === 'queued').length,
  }
}

export async function getDueScheduledCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
  return (data ?? []) as Campaign[]
}
