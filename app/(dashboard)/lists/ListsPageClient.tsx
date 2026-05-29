'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createList, deleteList } from '@/lib/contacts/actions'
import type { List } from '@/lib/contacts/types'

export default function ListsPageClient({ lists }: { lists: List[] }) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      await createList(newName.trim())
      setNewName('')
      setAdding(false)
      router.refresh()
    })
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete list "${name}"? Contacts will not be deleted.`)) return
    startTransition(async () => { await deleteList(id); router.refresh() })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Lists</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          + New List
        </button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <input
            autoFocus
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
            placeholder="List name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAdding(false) }}
          />
          <button onClick={handleCreate} disabled={isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Create
          </button>
          <button onClick={() => setAdding(false)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {lists.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No lists yet. Create one to organize your contacts.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Contacts</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Created</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {lists.map(list => (
                <tr key={list.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a href={`/lists/${list.id}`} className="font-medium text-blue-600 hover:underline">
                      {list.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{list.contact_count}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(list.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(list.id, list.name)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
