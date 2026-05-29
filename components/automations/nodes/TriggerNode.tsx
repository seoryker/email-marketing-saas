'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '@/lib/automations/types'

const TRIGGER_ICONS: Record<string, string> = {
  contact_joins_list: '⚡', contact_tagged: '🏷️',
  contact_opens_email: '📬', contact_clicks_link: '🔗',
  contact_unsubscribes: '🚫', contact_birthday: '🎂',
  date_based: '📅', webhook: '🔌',
}

const TRIGGER_LABELS: Record<string, string> = {
  contact_joins_list: 'Joins List', contact_tagged: 'Gets Tagged',
  contact_opens_email: 'Opens Email', contact_clicks_link: 'Clicks Link',
  contact_unsubscribes: 'Unsubscribes', contact_birthday: 'Birthday',
  date_based: 'Date-based', webhook: 'Webhook',
}

export default function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  return (
    <div className={`flex min-w-48 items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 shadow-sm ${
      selected ? 'border-blue-500 shadow-blue-100' : 'border-blue-300'
    }`}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg">
        {TRIGGER_ICONS[nodeData.stepType] ?? '⚡'}
      </div>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-500">Trigger</p>
        <p className="text-xs font-medium text-slate-800">{TRIGGER_LABELS[nodeData.stepType] ?? nodeData.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-2 !h-2" />
    </div>
  )
}
