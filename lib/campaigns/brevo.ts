const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

export async function sendTransactionalEmail(params: {
  to: { email: string; name: string }
  subject: string
  htmlContent: string
  fromName: string
  fromEmail: string
}): Promise<string> {
  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: params.fromName, email: params.fromEmail },
      to: [{ email: params.to.email, name: params.to.name }],
      subject: params.subject,
      htmlContent: params.htmlContent,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message ?? `Brevo API error: ${response.status}`)
  }

  const data = await response.json()
  return (data.messageId as string) ?? ''
}

export function replaceMergeTags(
  html: string,
  contact: { first_name: string; last_name: string; email: string; company: string | null }
): string {
  return html
    .replace(/\{\{first_name\}\}/g, contact.first_name || '')
    .replace(/\{\{last_name\}\}/g, contact.last_name || '')
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{company\}\}/g, contact.company || '')
}

export async function countTodaySends(orgId: string, supabase: any): Promise<number> {
  const todayMidnight = new Date()
  todayMidnight.setUTCHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('campaign_sends')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', todayMidnight.toISOString())
    .not('sent_at', 'is', null)
    .in('campaign_id',
      supabase.from('campaigns').select('id').eq('organization_id', orgId)
    )

  return count ?? 0
}
