'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import StepPalette from '@/components/automations/StepPalette'
import StepConfigPanel from '@/components/automations/StepConfigPanel'
import { saveCanvas, updateAutomation } from '@/lib/automations/actions'
import type { Automation, CanvasState, CanvasNodeData } from '@/lib/automations/types'
import type { List, Tag } from '@/lib/contacts/types'
import type { Campaign } from '@/lib/campaigns/types'
import type { Node, Edge } from '@xyflow/react'

const AutomationCanvas = dynamic(
  () => import('@/components/automations/AutomationCanvas'),
  { ssr: false, loading: () => <div className="flex-1 bg-slate-50 flex items-center justify-center text-sm text-slate-400">Loading canvas...</div> }
)

type Props = {
  automation: Automation
  canvas: CanvasState
  lists: List[]
  tags: Tag[]
  campaigns: Campaign[]
  stats: { active: number; completed: number; failed: number }
}

export default function AutomationBuilderClient({ automation, canvas, lists, tags, campaigns, stats }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(automation.name)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeData, setSelectedNodeData] = useState<CanvasNodeData | null>(null)
  const nodesRef = useRef<Node[]>(canvas.nodes as Node[])
  const edgesRef = useRef<Edge[]>(canvas.edges as Edge[])

  const handleNodesChange = useCallback((nodes: Node[]) => { nodesRef.current = nodes }, [])
  const handleEdgesChange = useCallback((edges: Edge[]) => { edgesRef.current = edges }, [])

  function handleNodeSelect(nodeId: string | null, data: CanvasNodeData | null) {
    setSelectedNodeId(nodeId)
    setSelectedNodeData(data)
  }

  function handleNodeConfigChange(nodeId: string, config: Record<string, unknown>) {
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, data: { ...(n.data as any), config } } : n
    )
    setSelectedNodeData(prev => prev ? { ...prev, config } : prev)
  }

  function handleNodeDelete(nodeId: string) {
    nodesRef.current = nodesRef.current.filter(n => n.id !== nodeId)
    edgesRef.current = edgesRef.current.filter(e => e.source !== nodeId && e.target !== nodeId)
    setSelectedNodeId(null)
    setSelectedNodeData(null)
  }

  function handleDragStart(event: React.DragEvent, stepType: string, nodeType: string) {
    event.dataTransfer.setData('stepType', stepType)
    event.dataTransfer.setData('nodeType', nodeType)
  }

  async function handleSave() {
    const canvasState: CanvasState = {
      nodes: nodesRef.current.map(n => ({
        id: n.id, type: n.type as any, position: n.position,
        data: n.data as unknown as CanvasNodeData,
      })),
      edges: edgesRef.current.map(e => ({
        id: e.id, source: e.source, target: e.target,
        label: e.label as string | undefined, animated: true,
      })),
    }
    startTransition(async () => { await saveCanvas(automation.id, canvasState) })
  }

  function handleNameBlur() {
    if (name !== automation.name && name.trim()) {
      startTransition(async () => { await updateAutomation(automation.id, { name: name.trim() }) })
    }
  }

  async function handleToggleStatus() {
    const newStatus = automation.status === 'active' ? 'paused' : 'active'
    startTransition(async () => { await updateAutomation(automation.id, { status: newStatus }); router.refresh() })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden -m-6">
      <div className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/automations" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 pr-3 border-r border-slate-200">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Automations
        </Link>

        <input
          className="flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none max-w-xs"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Automation name..."
        />

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center bg-slate-100 rounded-full p-0.5">
            <button
              onClick={() => automation.status !== 'draft' && handleToggleStatus()}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                automation.status === 'draft' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
              }`}>Draft</button>
            <button
              onClick={() => automation.status !== 'active' && handleToggleStatus()}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                automation.status === 'active' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500'
              }`}>Active</button>
          </div>
          <button onClick={handleSave} disabled={isPending}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <StepPalette onDragStart={handleDragStart} />

        <AutomationCanvas
          initialCanvas={canvas}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeSelect={handleNodeSelect}
        />

        {selectedNodeId && selectedNodeData && (
          <StepConfigPanel
            nodeId={selectedNodeId}
            data={selectedNodeData}
            lists={lists}
            tags={tags}
            campaigns={campaigns}
            onChange={handleNodeConfigChange}
            onDelete={handleNodeDelete}
          />
        )}
      </div>

      <div className="flex h-7 flex-shrink-0 items-center gap-6 border-t border-slate-200 bg-white px-4">
        <span className="text-[10px] text-slate-500">
          Active enrollments: <span className="font-medium text-slate-700">{stats.active}</span>
        </span>
        <span className="text-[10px] text-slate-500">
          Completed: <span className="font-medium text-slate-700">{stats.completed}</span>
        </span>
      </div>
    </div>
  )
}
