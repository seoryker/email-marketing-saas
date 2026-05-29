import Link from 'next/link'
import { getAutomations } from '@/lib/automations/queries'
import AutomationsList from '@/components/automations/AutomationsList'

export default async function AutomationsPage() {
  const automations = await getAutomations()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Automations</h1>
          <p className="text-sm text-slate-500">{automations.length} automations</p>
        </div>
        <Link href="/automations/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New Automation
        </Link>
      </div>
      <AutomationsList automations={automations} />
    </div>
  )
}
