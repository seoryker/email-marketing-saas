import { redirect } from 'next/navigation'
type Props = { params: Promise<{ id: string }> }
export default async function AutomationPage({ params }: Props) {
  const { id } = await params
  redirect(`/automations/${id}/edit`)
}
