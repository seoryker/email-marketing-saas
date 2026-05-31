'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getOrgId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: p } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
  if (!p) throw new Error('No profile')
  return { supabase, org_id: p.organization_id as string }
}

export async function getIntegrationSettings() {
  const { supabase, org_id } = await getOrgId()
  const { data } = await supabase.from('integration_settings').select('*').eq('organization_id', org_id).single()
  return data
}

export async function saveWebhookSettings(input: { webhook_url: string; webhook_events: string[] }) {
  const { supabase, org_id } = await getOrgId()
  await supabase.from('integration_settings').upsert(
    { organization_id: org_id, webhook_url: input.webhook_url, webhook_events: input.webhook_events },
    { onConflict: 'organization_id' }
  )
  revalidatePath('/settings/integrations')
}

export async function saveGASettings(ga_measurement_id: string) {
  const { supabase, org_id } = await getOrgId()
  await supabase.from('integration_settings').upsert(
    { organization_id: org_id, ga_measurement_id: ga_measurement_id || null },
    { onConflict: 'organization_id' }
  )
  revalidatePath('/settings/integrations')
}

export async function sendTestWebhook() {
  const { supabase, org_id } = await getOrgId()
  const { data: settings } = await supabase.from('integration_settings').select('webhook_url').eq('organization_id', org_id).single()
  if (!settings?.webhook_url) throw new Error('No webhook URL configured')
  const res = await fetch(settings.webhook_url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), data: { message: 'Test webhook from MailFlow' } }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
  return { ok: true }
}
