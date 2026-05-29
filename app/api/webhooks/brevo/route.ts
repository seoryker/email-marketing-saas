import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BrevoEventType =
  | 'delivered' | 'opened' | 'clicked'
  | 'bounced' | 'softBounce' | 'unsubscribed'

type BrevoPayload = {
  event: BrevoEventType
  email: string
  date: string
  messageId: string
  tags?: string[]
  link?: string
}

export async function POST(request: Request) {
  let body: BrevoPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()

  const { data: send } = await supabase
    .from('campaign_sends')
    .select('id, contact_id')
    .eq('brevo_message_id', body.messageId)
    .single()

  if (!send) return NextResponse.json({ ok: true })

  const update: Record<string, string> = {}

  switch (body.event) {
    case 'delivered':
      update.status = 'delivered'
      break
    case 'opened':
      update.status = 'opened'
      update.opened_at = body.date
      break
    case 'clicked':
      update.status = 'clicked'
      update.clicked_at = body.date
      if (body.link) update.link_url = body.link
      break
    case 'bounced':
    case 'softBounce':
      update.status = 'bounced'
      break
    case 'unsubscribed':
      update.status = 'unsubscribed'
      await supabase.from('contacts').update({ status: 'unsubscribed' }).eq('id', send.contact_id)
      break
  }

  if (Object.keys(update).length) {
    await supabase.from('campaign_sends').update(update).eq('id', send.id)
  }

  return NextResponse.json({ ok: true })
}
