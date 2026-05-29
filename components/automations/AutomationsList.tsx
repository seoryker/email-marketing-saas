'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteAutomation, updateAutomation } from '@/lib/automations/actions'
import type { AutomationWithStats, AutomationStatus } from '@/lib/automations/types'

const STATUS_STYLES: Record<AutomationStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
}

export default function AutomationsList({ automations }: { automations: AutomationWithStats[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    startTransition(async () => { await deleteAutomation(id); router.refresh() })
  }

  function handleToggle(id: string, status: AutomationStatus) {
    if (status === 'draft') return
    const newStatus = status === 'active' ? 'paused' : 'active'
    startTransition(async () => { await updateAutomation(id, { status: newStatus }); router.refresh() })
  }

  if (automations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
          <span className="text-2xl">⚡</span>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">No automations yet</h3>
        <p className="mt-1.5 text-xs text-slate-500">Automate your email sequences and contact management</p>
        <Link href="/automations/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
          + Create your first automation
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Automation</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Active</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Completed</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Steps</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {automations.map(a => (
            <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/automations/${a.id}/edit`} className="font-medium text-slate-900 hover:text-blue-600">
                  {a.name}
                </Link>
                <p className="mt-0.5 text-slate-400">{a.trigger_type.replace(/_/g, ' ')}</p>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[a.status]}`}>
                  {a.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">{a.active_enrollments}</td>
              <td className="px-4 py-3 text-slate-600">{a.completed_enrollments}</td>
              <td className="px-4 py-3 text-slate-400">{a.steps_count}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => handleToggle(a.id, a.status)} disabled={isPending || a.status === 'draft'}
                    className="text-xs text-blue-500 hover:underline disabled:opacity-40">
                    {a.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <button onClick={() => handleDelete(a.id, a.name)} disabled={isPending}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
