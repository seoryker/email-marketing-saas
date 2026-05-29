'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { sendCampaign, scheduleCampaign } from '@/lib/campaigns/actions'
import type { Campaign } from '@/lib/campaigns/types'
import type { List } from '@/lib/contacts/types'

type Props = {
  open: boolean
  campaign: Campaign
  lists: List[]
  onClose: () => void
  onSent: (result: { sent: number; queued: number }) => void
}

export default function SendModal({ open, campaign, lists, onClose, onSent }: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedLists, setSelectedLists] = useState<string[]>(campaign.recipient_list_ids)
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const estimatedCount = lists
    .filter(l => selectedLists.includes(l.id))
    .reduce((sum, l) => sum + l.contact_count, 0)

  function toggleList(id: string) {
    setSelectedLists(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function handleSend() {
    if (selectedLists.length === 0) {
      setError('Select at least one list to send to')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        if (sendMode === 'now') {
          const result = await sendCampaign(campaign.id, selectedLists)
          onSent(result)
        } else {
          if (!scheduledAt) { setError('Pick a date and time'); return }
          await scheduleCampaign(campaign.id, selectedLists, new Date(scheduledAt).toISOString())
          onSent({ sent: 0, queued: estimatedCount })
        }
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Send Campaign</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Recipients */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">Send to *</p>
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 p-3 min-h-10">
              {lists.map(list => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => toggleList(list.id)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    selectedLists.includes(list.id)
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {list.name} ({list.contact_count})
                </button>
              ))}
              {lists.length === 0 && (
                <span className="text-xs text-slate-400">No lists — create one in Contacts first</span>
              )}
            </div>
            {estimatedCount > 0 && (
              <p className="mt-1.5 text-xs text-slate-500">~{estimatedCount.toLocaleString()} contacts · active only</p>
            )}
          </div>

          {/* When to send */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">When to send</p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3">
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${sendMode === 'now' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                  {sendMode === 'now' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm text-slate-700">Send immediately</span>
                <input type="radio" className="hidden" checked={sendMode === 'now'} onChange={() => setSendMode('now')} />
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${sendMode === 'schedule' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                  {sendMode === 'schedule' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm text-slate-700">Schedule for later</span>
                <input type="radio" className="hidden" checked={sendMode === 'schedule'} onChange={() => setSendMode('schedule')} />
              </label>
              {sendMode === 'schedule' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="ml-7 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                />
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Summary</p>
            {[
              ['Subject', campaign.subject],
              ['From', `${campaign.from_name} <${campaign.from_email}>`],
              ['Recipients', `~${estimatedCount.toLocaleString()} contacts`],
              ['Sending', sendMode === 'now' ? 'Immediately' : scheduledAt ? new Date(scheduledAt).toLocaleString() : 'Scheduled'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-700 text-right max-w-[200px] truncate">{value}</span>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              ← Edit Email
            </Button>
            <Button
              onClick={handleSend}
              disabled={isPending || selectedLists.length === 0}
              className="flex-1"
            >
              {isPending ? 'Sending...' : sendMode === 'now' ? '🚀 Send Now' : '📅 Schedule'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
