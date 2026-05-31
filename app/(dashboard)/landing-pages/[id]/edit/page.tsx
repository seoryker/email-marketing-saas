import { notFound } from 'next/navigation'
import { getLandingPage } from '@/lib/landing-pages/queries'
import PageBuilderClient from './PageBuilderClient'
type Props = { params: Promise<{ id: string }> }
export default async function LandingPageEditPage({ params }: Props) {
  const { id } = await params
  const page = await getLandingPage(id)
  if (!page) notFound()
  return <PageBuilderClient page={page} />
}
