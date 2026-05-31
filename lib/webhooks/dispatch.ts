import { createClient } from '@/lib/supabase/server'

type WebhookSettings = { webhook_url: string | null; webhook_events: string[] }

export function shouldDispatch(settings: WebhookSettings, event: string): boolean {
  return !!(settings.webhook_url && settings.webhook_events.includes(event))
}

export async function dispatchWebhook(orgId: string, event: string, data: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: settings } = await supabase
      .from('integration_settings').select('webhook_url, webhook_events')
      .eq('organization_id', orgId).single()
    if (!settings || !shouldDispatch(settings, event)) return
    await fetch(settings.webhook_url!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Fire-and-forget
  }
}
