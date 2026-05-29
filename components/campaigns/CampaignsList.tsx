'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCampaign } from '@/lib/campaigns/actions'
import type { Campaign, CampaignStatus } from '@/lib/campaigns/types'

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-amber-100 text-amber-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export default function CampaignsList({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteCampaign(id)
      router.refresh()
    })
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
          <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">No campaigns yet</h3>
        <p className="mt-1.5 text-xs text-slate-500">Create your first email campaign to start reaching your contacts</p>
        <Link
          href="/campaigns/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
        >
          + Create your first campaign
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Campaign</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Recipients</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Open rate</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Date</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(campaign => (
            <tr key={campaign.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link
                  href={`/campaigns/${campaign.id}/edit`}
                  className="font-medium text-slate-900 hover:text-blue-600"
                >
                  {campaign.name}
                </Link>
                <p className="mt-0.5 text-slate-400 truncate max-w-xs">{campaign.subject}</p>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[campaign.status]}`}>
                  {campaign.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {campaign.recipient_count > 0 ? campaign.recipient_count.toLocaleString() : '—'}
              </td>
              <td className="px-4 py-3 text-slate-400">—</td>
              <td className="px-4 py-3 text-slate-400">
                {campaign.sent_at
                  ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/campaigns/${campaign.id}/edit`} className="text-blue-500 hover:underline">
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(campaign.id, campaign.name)}
                    disabled={isPending}
                    className="text-red-400 hover:text-red-600 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
