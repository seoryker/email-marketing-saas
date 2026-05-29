'use client'

type Props = {
  onDragStart: (event: React.DragEvent, stepType: string, nodeType: string) => void
}

const TRIGGERS = [
  { type: 'contact_joins_list', label: 'Joins List', icon: '⚡', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_tagged', label: 'Gets Tagged', icon: '🏷️', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_opens_email', label: 'Opens Email', icon: '📬', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_clicks_link', label: 'Clicks Link', icon: '🔗', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_unsubscribes', label: 'Unsubscribes', icon: '🚫', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'webhook', label: 'Webhook', icon: '🔌', color: 'bg-amber-50 border-amber-200 text-amber-700' },
]

const ACTIONS = [
  { type: 'send_email', label: 'Send Email', icon: '✉️', nodeType: 'action' },
  { type: 'wait', label: 'Wait', icon: '⏱', nodeType: 'action' },
  { type: 'condition', label: 'Condition', icon: '◆', nodeType: 'condition' },
  { type: 'add_tag', label: 'Add Tag', icon: '🏷️', nodeType: 'action' },
  { type: 'remove_tag', label: 'Remove Tag', icon: '🗑️', nodeType: 'action' },
  { type: 'add_to_list', label: 'Add to List', icon: '📋', nodeType: 'action' },
  { type: 'remove_from_list', label: 'Remove from List', icon: '📤', nodeType: 'action' },
  { type: 'update_field', label: 'Update Field', icon: '✏️', nodeType: 'action' },
  { type: 'send_webhook', label: 'Send Webhook', icon: '🔗', nodeType: 'action' },
  { type: 'end', label: 'End', icon: '🚫', nodeType: 'end' },
]

export default function StepPalette({ onDragStart }: Props) {
  return (
    <div className="flex flex-col overflow-y-auto bg-white border-r border-slate-200 p-3 w-40 flex-shrink-0">
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Triggers</p>
      {TRIGGERS.map(t => (
        <div key={t.type} draggable
          onDragStart={e => onDragStart(e, t.type, 'trigger')}
          className={`mb-1.5 flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-xs active:cursor-grabbing ${t.color}`}>
          <span>{t.icon}</span>
          <span className="truncate">{t.label}</span>
        </div>
      ))}
      <p className="mb-2 mt-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Actions</p>
      {ACTIONS.map(a => (
        <div key={a.type} draggable
          onDragStart={e => onDragStart(e, a.type, a.nodeType)}
          className="mb-1.5 flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:cursor-grabbing">
          <span>{a.icon}</span>
          <span className="truncate">{a.label}</span>
        </div>
      ))}
    </div>
  )
}
