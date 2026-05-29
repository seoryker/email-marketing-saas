'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { updateCampaign } from '@/lib/campaigns/actions'
import type { Campaign } from '@/lib/campaigns/types'

type Props = {
  campaign: Campaign
  lastSaved: Date | null
  isSaving: boolean
  onSave: () => void
  onNext: () => void
}

export default function BuilderToolbar({ campaign, lastSaved, isSaving, onSave, onNext }: Props) {
  const [name, setName] = useState(campaign.name)
  const [, startTransition] = useTransition()

  function handleNameBlur() {
    if (name === campaign.name || !name.trim()) return
    startTransition(async () => {
      await updateCampaign(campaign.id, { name: name.trim() })
    })
  }

  const savedLabel = isSaving
    ? 'Saving...'
    : lastSaved
    ? `Saved ${Math.round((Date.now() - lastSaved.getTime()) / 60000)} min ago`
    : 'Unsaved changes'

  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4">
      <Link
        href="/campaigns"
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 pr-4 border-r border-slate-700"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Campaigns
      </Link>

      <div className="flex-1">
        <input
          className="bg-transparent text-sm font-medium text-slate-100 outline-none placeholder:text-slate-500 w-full max-w-xs"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Campaign name..."
        />
        <p className="text-[10px] text-slate-500 mt-0.5">
          {campaign.status === 'draft' ? 'Draft' : campaign.status} · {savedLabel}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={onNext}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          Next: Recipients →
        </button>
      </div>
    </div>
  )
}
