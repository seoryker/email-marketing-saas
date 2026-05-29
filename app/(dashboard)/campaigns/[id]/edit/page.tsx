import { notFound } from 'next/navigation'
import { getCampaign } from '@/lib/campaigns/queries'
import { getLists } from '@/lib/contacts/queries'
import BuilderClient from './BuilderClient'

type Props = { params: Promise<{ id: string }> }

export default async function BuilderPage({ params }: Props) {
  const { id } = await params
  const [campaign, lists] = await Promise.all([getCampaign(id), getLists()])
  if (!campaign) notFound()
  return <BuilderClient campaign={campaign} lists={lists} />
}
