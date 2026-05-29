import { NextResponse } from 'next/server'
import { getDueScheduledCampaigns } from '@/lib/campaigns/queries'
import { sendCampaign } from '@/lib/campaigns/actions'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dueCampaigns = await getDueScheduledCampaigns()

  const results = await Promise.allSettled(
    dueCampaigns.map(async (campaign) => {
      const result = await sendCampaign(campaign.id, campaign.recipient_list_ids)
      return { id: campaign.id, name: campaign.name, ...result }
    })
  )

  const summary = results.map((r, i) => ({
    campaign: dueCampaigns[i]?.name,
    status: r.status,
    result: r.status === 'fulfilled' ? r.value : (r as any).reason?.message,
  }))

  return NextResponse.json({ processed: dueCampaigns.length, summary })
}
