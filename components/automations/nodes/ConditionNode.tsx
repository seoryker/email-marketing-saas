'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '@/lib/automations/types'

export default function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  return (
    <div className={`relative flex min-w-48 items-center gap-3 rounded-xl border-2 bg-purple-50 px-4 py-3 shadow-sm ${
      selected ? 'border-purple-500 shadow-purple-100' : 'border-purple-300'
    }`}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 text-lg">◆</div>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-purple-500">Condition</p>
        <p className="text-xs font-medium text-slate-800">
          {String(nodeData.config.condition_type || 'Set condition...')}
        </p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: '30%' }} className="!bg-green-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: '70%' }} className="!bg-red-400 !w-2 !h-2" />
      <div className="absolute -bottom-4 left-[28%] text-[8px] font-semibold text-green-600">YES</div>
      <div className="absolute -bottom-4 left-[67%] text-[8px] font-semibold text-red-500">NO</div>
    </div>
  )
}
