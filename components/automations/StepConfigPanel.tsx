'use client'

import type { CanvasNodeData } from '@/lib/automations/types'
import type { List, Tag } from '@/lib/contacts/types'
import type { Campaign } from '@/lib/campaigns/types'

type Props = {
  nodeId: string
  data: CanvasNodeData
  lists: List[]
  tags: Tag[]
  campaigns: Campaign[]
  onChange: (nodeId: string, config: Record<string, unknown>) => void
  onDelete: (nodeId: string) => void
}

export default function StepConfigPanel({ nodeId, data, lists, tags, campaigns, onChange, onDelete }: Props) {
  function update(key: string, value: unknown) {
    onChange(nodeId, { ...data.config, [key]: value })
  }

  return (
    <div className="w-52 flex-shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
      <p className="mb-4 text-xs font-semibold text-slate-900">{data.label || data.stepType}</p>

      {data.stepType === 'send_email' && (
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 block mb-1">Campaign</label>
          <select value={String(data.config.campaign_id ?? '')} onChange={e => update('campaign_id', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500">
            <option value="">Select campaign...</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {data.stepType === 'wait' && (
        <div className="flex gap-2">
          <input type="number" min={1} value={Number(data.config.value ?? 1)}
            onChange={e => update('value', Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500" />
          <select value={String(data.config.unit ?? 'hours')} onChange={e => update('unit', e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500">
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      )}

      {data.stepType === 'condition' && (
        <div className="space-y-2">
          <select value={String(data.config.condition_type ?? '')} onChange={e => update('condition_type', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500">
            <option value="">Select...</option>
            <option value="has_tag">Has tag</option>
            <option value="field_equals">Field equals</option>
          </select>
          {data.config.condition_type === 'has_tag' && (
            <select value={String(data.config.value ?? '')} onChange={e => update('value', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500">
              <option value="">Select tag...</option>
              {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          )}
        </div>
      )}

      {(data.stepType === 'add_tag' || data.stepType === 'remove_tag') && (
        <select value={String(data.config.tag_name ?? '')} onChange={e => update('tag_name', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500">
          <option value="">Select tag...</option>
          {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      )}

      {(data.stepType === 'add_to_list' || data.stepType === 'remove_from_list') && (
        <select value={String(data.config.list_id ?? '')} onChange={e => update('list_id', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500">
          <option value="">Select list...</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}

      {data.stepType === 'send_webhook' && (
        <input type="url" value={String(data.config.url ?? '')} onChange={e => update('url', e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500" />
      )}

      {data.stepType === 'contact_joins_list' && (
        <select value={String(data.config.list_id ?? '')} onChange={e => update('list_id', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500">
          <option value="">Any list</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <button onClick={() => onDelete(nodeId)}
          className="w-full rounded-lg bg-red-50 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100">
          Delete step
        </button>
      </div>
    </div>
  )
}
