import { redirect } from 'next/navigation'
import { createAutomation } from '@/lib/automations/actions'

export default async function NewAutomationPage() {
  const id = await createAutomation('Untitled Automation')
  redirect(`/automations/${id}/edit`)
}
