import Link from 'next/link'
import { getCampaigns } from '@/lib/campaigns/queries'
import CampaignsList from '@/components/campaigns/CampaignsList'

export default async function CampaignsPage() {
  const campaigns = await getCampaigns()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500">{campaigns.length} campaigns</p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Campaign
        </Link>
      </div>
      <CampaignsList campaigns={campaigns} />
    </div>
  )
}
