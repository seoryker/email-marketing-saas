'use client'

import { useTransition } from 'react'
import { deleteContacts } from '@/lib/contacts/actions'
import type { List, Tag } from '@/lib/contacts/types'

type Props = {
  selectedIds: string[]
  lists: List[]
  tags: Tag[]
  onClear: () => void
}

export default function BulkActionBar({ selectedIds, lists, tags, onClear }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(`Delete ${selectedIds.length} contact(s)? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteContacts(selectedIds)
      onClear()
    })
  }

  if (selectedIds.length === 0) return null

  return (
    <div className="flex items-center gap-3 border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs">
      <span className="font-medium text-blue-700">{selectedIds.length} selected</span>
      <div className="h-3.5 w-px bg-blue-200" />
      <button className="text-blue-600 hover:underline">Add to list</button>
      <button className="text-blue-600 hover:underline">Add tag</button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-red-600 hover:underline disabled:opacity-50"
      >
        Delete
      </button>
      <button onClick={onClear} className="ml-auto text-slate-500 hover:text-slate-700">
        Clear selection
      </button>
    </div>
  )
}
