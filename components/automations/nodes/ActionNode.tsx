'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '@/lib/automations/types'

const ACTION_ICONS: Record<string, string> = {
  send_email: '✉️', wait: '⏱', add_tag: '🏷️', remove_tag: '🗑️',
  add_to_list: '📋', remove_from_list: '📤', update_field: '✏️',
  send_webhook: '🔗', send_sms: '💬',
}

export default function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  return (
    <div className={`flex min-w-48 items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 shadow-sm ${
      selected ? 'border-blue-500 shadow-blue-100' : 'border-slate-200'
    }`}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50 text-lg">
        {ACTION_ICONS[nodeData.stepType] ?? '⚙️'}
      </div>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{nodeData.label}</p>
        <p className="text-xs text-slate-600 truncate max-w-32">
          {String(nodeData.config.campaign_id || nodeData.config.tag_name || nodeData.config.list_id || nodeData.config.url || '')}
        </p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2 !h-2" />
    </div>
  )
}
