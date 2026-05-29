'use client'

import { useCallback, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import TriggerNode from './nodes/TriggerNode'
import ActionNode from './nodes/ActionNode'
import ConditionNode from './nodes/ConditionNode'
import EndNode from './nodes/EndNode'
import type { CanvasState, CanvasNodeData } from '@/lib/automations/types'

const NODE_TYPES = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  end: EndNode,
}

const STEP_LABELS: Record<string, string> = {
  send_email: 'Send Email', wait: 'Wait', condition: 'Condition',
  add_tag: 'Add Tag', remove_tag: 'Remove Tag', add_to_list: 'Add to List',
  remove_from_list: 'Remove from List', update_field: 'Update Field',
  send_webhook: 'Send Webhook', send_sms: 'Send SMS', end: 'End',
  contact_joins_list: 'Joins List', contact_tagged: 'Gets Tagged',
  contact_opens_email: 'Opens Email', contact_clicks_link: 'Clicks Link',
  contact_unsubscribes: 'Unsubscribes', webhook: 'Webhook',
}

let nodeCounter = 0

type Props = {
  initialCanvas: CanvasState
  onNodesChange: (nodes: Node[]) => void
  onEdgesChange: (edges: Edge[]) => void
  onNodeSelect: (nodeId: string | null, data: CanvasNodeData | null) => void
}

export default function AutomationCanvas({ initialCanvas, onNodesChange, onEdgesChange, onNodeSelect }: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes, handleNodesChange] = useNodesState(initialCanvas.nodes as Node[])
  const [edges, setEdges, handleEdgesChange] = useEdgesState(initialCanvas.edges as Edge[])

  const handleConnect = useCallback((params: Connection) => {
    setEdges(eds => {
      const updated = addEdge({ ...params, animated: true }, eds)
      onEdgesChange(updated)
      return updated
    })
  }, [])

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const stepType = event.dataTransfer.getData('stepType')
    const nodeType = event.dataTransfer.getData('nodeType')
    if (!stepType) return

    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    if (!bounds) return

    const newNode: Node = {
      id: `temp-${++nodeCounter}-${Date.now()}`,
      type: nodeType,
      position: { x: event.clientX - bounds.left - 96, y: event.clientY - bounds.top - 20 },
      data: {
        stepType,
        config: {},
        label: STEP_LABELS[stepType] ?? stepType,
      } as unknown as Record<string, unknown>,
    }

    setNodes(nds => {
      const updated = [...nds, newNode]
      onNodesChange(updated)
      return updated
    })
  }

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    onNodeSelect(node.id, node.data as unknown as CanvasNodeData)
  }

  return (
    <div ref={reactFlowWrapper} className="flex-1 min-h-0"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={changes => {
          handleNodesChange(changes)
          setNodes(nds => { onNodesChange(nds); return nds })
        }}
        onEdgesChange={changes => {
          handleEdgesChange(changes)
          setEdges(eds => { onEdgesChange(eds); return eds })
        }}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onNodeSelect(null, null)}
        fitView
        className="bg-slate-50"
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      </ReactFlow>
    </div>
  )
}
