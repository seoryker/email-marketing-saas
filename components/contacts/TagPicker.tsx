'use client'

import { useState } from 'react'
import type { Tag } from '@/lib/contacts/types'

type Props = {
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export default function TagPicker({ tags, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = tags.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string) {
    onChange(selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id])
  }

  const selectedTags = tags.filter(t => selected.includes(t.id))

  return (
    <div className="relative">
      <div
        className="min-h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 cursor-pointer flex flex-wrap gap-1 items-center"
        onClick={() => setOpen(o => !o)}
      >
        {selectedTags.length === 0 && (
          <span className="text-sm text-muted-foreground">Select tags...</span>
        )}
        {selectedTags.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: `${tag.color}25`, color: tag.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tag.color }} />
            {tag.name}
            <button
              type="button"
              className="ml-0.5 hover:opacity-70 leading-none"
              onClick={e => { e.stopPropagation(); toggle(tag.id) }}
            >×</button>
          </span>
        ))}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <div className="p-2 border-b">
              <input
                autoFocus
                className="w-full rounded border px-2 py-1 text-sm outline-none focus:border-blue-500"
                placeholder="Search tags..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>
            <div className="max-h-48 overflow-auto p-1">
              {filtered.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags found</p>
              )}
              {filtered.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={() => { toggle(tag.id); setSearch('') }}
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                  {tag.name}
                  {selected.includes(tag.id) && (
                    <span className="ml-auto text-blue-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
