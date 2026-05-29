'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

export default function EndNode({ selected }: NodeProps) {
  return (
    <div className={`flex min-w-36 items-center justify-center gap-2 rounded-xl border-2 bg-red-50 px-4 py-3 shadow-sm ${
      selected ? 'border-red-500 shadow-red-100' : 'border-red-200'
    }`}>
      <span className="text-lg">🚫</span>
      <p className="text-xs font-semibold text-red-600">End</p>
      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-2 !h-2" />
    </div>
  )
}
