import { notFound } from 'next/navigation'
import { getAutomation, getEnrollmentStats } from '@/lib/automations/queries'
import { getLists, getTags } from '@/lib/contacts/queries'
import { getCampaigns } from '@/lib/campaigns/queries'
import AutomationBuilderClient from './AutomationBuilderClient'

type Props = { params: Promise<{ id: string }> }

export default async function AutomationBuilderPage({ params }: Props) {
  const { id } = await params
  const [result, lists, tags, campaigns, stats] = await Promise.all([
    getAutomation(id),
    getLists(),
    getTags(),
    getCampaigns(),
    getEnrollmentStats(id),
  ])
  if (!result) notFound()
  return (
    <AutomationBuilderClient
      automation={result.automation}
      canvas={result.canvas}
      lists={lists}
      tags={tags}
      campaigns={campaigns}
      stats={stats}
    />
  )
}
