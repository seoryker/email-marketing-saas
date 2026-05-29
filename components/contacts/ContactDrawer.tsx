'use client'

import { useState } from 'react'
import ContactForm from './ContactForm'
import type { ContactWithRelations, Tag, List, CustomFieldDefinition } from '@/lib/contacts/types'

type DrawerMode = 'add' | 'edit' | 'view'

type Props = {
  open: boolean
  mode: DrawerMode
  contact?: ContactWithRelations
  tags: Tag[]
  lists: List[]
  customFields: CustomFieldDefinition[]
  onClose: () => void
  onSaved: () => void
}

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  unsubscribed: 'bg-amber-100 text-amber-700',
  bounced: 'bg-red-100 text-red-700',
}

export default function ContactDrawer({
  open, mode: initialMode, contact, tags, lists, customFields, onClose, onSaved,
}: Props) {
  const [mode, setMode] = useState<DrawerMode>(initialMode)

  if (!open) return null

  const initials = contact
    ? `${contact.first_name[0] ?? ''}${contact.last_name[0] ?? ''}`.toUpperCase() || contact.email[0].toUpperCase()
    : '+'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-96 bg-white shadow-xl flex flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 p-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            {contact ? (
              <>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {`${contact.first_name} ${contact.last_name}`.trim() || contact.email}
                </p>
                <p className="truncate text-xs text-slate-500">{contact.email}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-900">Add Contact</p>
            )}
          </div>
          {contact && mode === 'view' && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[contact.status]}`}>
              {contact.status}
            </span>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {(mode === 'add' || mode === 'edit') && (
            <ContactForm
              contact={mode === 'edit' ? contact : undefined}
              tags={tags}
              lists={lists}
              customFields={customFields}
              onSave={() => { onSaved(); onClose() }}
              onCancel={mode === 'edit' ? () => setMode('view') : onClose}
            />
          )}

          {mode === 'view' && contact && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Emails received', value: '—' },
                  { label: 'Open rate', value: '—' },
                  { label: 'Click rate', value: '—' },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-base font-bold text-slate-400">{stat.value}</p>
                    <p className="text-[9px] text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {[
                  ['Phone', contact.phone],
                  ['Company', contact.company],
                  ...customFields.map(f => [f.label, String(contact.custom_fields[f.field_key] ?? '')])
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-slate-100 py-1.5 text-xs">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-700">{value || '—'}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lists</p>
                <div className="flex flex-wrap gap-1">
                  {contact.lists.map(list => (
                    <span key={list.id} className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                      {list.name}
                    </span>
                  ))}
                  {contact.lists.length === 0 && <span className="text-xs text-slate-400">None</span>}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map(tag => (
                    <span key={tag.id}
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{ background: `${tag.color}20`, color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {contact.tags.length === 0 && <span className="text-xs text-slate-400">None</span>}
                </div>
              </div>

              <button
                onClick={() => setMode('edit')}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                Edit contact
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
