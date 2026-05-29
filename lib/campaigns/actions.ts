'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendTransactionalEmail, replaceMergeTags, countTodaySends } from './brevo'
import type { CampaignStatus, SendResult } from './types'

const DAILY_SEND_LIMIT = 300

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile) throw new Error('Profile not found')
  return profile.organization_id
}

export async function createCampaign(input: {
  name: string
  subject: string
  preview_text?: string
  from_name: string
  from_email: string
}): Promise<string> {
  const supabase = await createClient()
  const org_id = await getOrgId()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      organization_id: org_id,
      name: input.name,
      subject: input.subject,
      preview_text: input.preview_text ?? null,
      from_name: input.from_name,
      from_email: input.from_email,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/campaigns')
  return data.id
}

export async function updateCampaign(id: string, input: {
  name?: string
  subject?: string
  preview_text?: string | null
  from_name?: string
  from_email?: string
  content_json?: Record<string, unknown>
  content_html?: string
  recipient_list_ids?: string[]
  status?: CampaignStatus
  scheduled_at?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaigns')
    .update(input)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/campaigns')
  revalidatePath(`/campaigns/${id}/edit`)
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient()
  await supabase.from('campaigns').delete().eq('id', id)
  revalidatePath('/campaigns')
}

export async function sendCampaign(
  campaignId: string,
  listIds: string[]
): Promise<SendResult> {
  const supabase = await createClient()
  const org_id = await getOrgId()

  // Fetch campaign
  const { data: campaign } = await supabase
    .from('campaigns').select('*').eq('id', campaignId).single()
  if (!campaign) throw new Error('Campaign not found')
  if (!campaign.content_html) throw new Error('Campaign has no email content')
  if (!['draft', 'scheduled'].includes(campaign.status)) {
    throw new Error(`Cannot send campaign with status: ${campaign.status}`)
  }

  // Fetch active contacts from selected lists (deduplicated)
  const { data: contactListRows } = await supabase
    .from('contact_lists')
    .select('contact_id')
    .in('list_id', listIds)

  const contactIds = [...new Set((contactListRows ?? []).map((r: any) => r.contact_id))]

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company')
    .in('id', contactIds)
    .eq('status', 'active')

  const activeContacts = contacts ?? []

  // Check daily limit
  const todaySent = await countTodaySends(org_id, supabase)
  const remaining = Math.max(0, DAILY_SEND_LIMIT - todaySent)
  const toSendNow = activeContacts.slice(0, remaining)
  const toQueue = activeContacts.slice(remaining)

  // Update campaign to sending
  await supabase.from('campaigns').update({
    status: 'sending',
    recipient_list_ids: listIds,
    recipient_count: activeContacts.length,
  }).eq('id', campaignId)

  // Send emails
  let sent = 0
  for (const contact of toSendNow) {
    try {
      const personalizedHtml = replaceMergeTags(campaign.content_html, {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        company: contact.company,
      })
      const messageId = await sendTransactionalEmail({
        to: { email: contact.email, name: `${contact.first_name} ${contact.last_name}`.trim() || contact.email },
        subject: campaign.subject,
        htmlContent: personalizedHtml,
        fromName: campaign.from_name,
        fromEmail: campaign.from_email,
        campaignId: campaignId,
      })
      await supabase.from('campaign_sends').upsert({
        campaign_id: campaignId,
        contact_id: contact.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        brevo_message_id: messageId,
      }, { onConflict: 'campaign_id,contact_id' })
      sent++
    } catch {
      // Individual send failures don't abort the batch
    }
  }

  // Queue remaining contacts
  if (toQueue.length) {
    await supabase.from('campaign_sends').upsert(
      toQueue.map((c: any) => ({
        campaign_id: campaignId,
        contact_id: c.id,
        status: 'queued',
      })),
      { onConflict: 'campaign_id,contact_id' }
    )
  }

  // Mark campaign sent
  await supabase.from('campaigns').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', campaignId)

  revalidatePath('/campaigns')
  return { sent, queued: toQueue.length }
}

export async function scheduleCampaign(
  campaignId: string,
  listIds: string[],
  scheduledAt: string
) {
  const supabase = await createClient()

  await supabase.from('campaigns').update({
    status: 'scheduled',
    recipient_list_ids: listIds,
    scheduled_at: scheduledAt,
  }).eq('id', campaignId)

  revalidatePath('/campaigns')
}
