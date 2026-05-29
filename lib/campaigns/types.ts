export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
export type CampaignSendStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed'

export type Campaign = {
  id: string
  organization_id: string
  name: string
  subject: string
  preview_text: string | null
  from_name: string
  from_email: string
  status: CampaignStatus
  content_json: Record<string, unknown> | null
  content_html: string | null
  recipient_list_ids: string[]
  recipient_count: number
  scheduled_at: string | null
  sent_at: string | null
  brevo_campaign_ref: string | null
  created_at: string
  updated_at: string
}

export type CampaignSend = {
  id: string
  campaign_id: string
  contact_id: string
  status: CampaignSendStatus
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  brevo_message_id: string | null
}

export type EmailTemplate = {
  id: string
  organization_id: string
  name: string
  thumbnail_url: string | null
  content_json: Record<string, unknown> | null
  content_html: string | null
  created_at: string
}

export type SendResult = {
  sent: number
  queued: number
}
