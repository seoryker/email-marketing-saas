'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createList, createTag } from '@/lib/contacts/actions'
import type { List, Tag } from '@/lib/contacts/types'

const TAG_COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

type Props = {
  lists: List[]
  tags: Tag[]
  totalCount: number
}

export default function ListsSidebar({ lists, tags, totalCount }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const activeListId = searchParams.get('list_id')
  const activeTagId = searchParams.get('tag_id')

  const [addingList, setAddingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('list_id')
    params.delete('tag_id')
    params.delete('page')
    if (value) params.set(key, value)
    router.push(`/contacts?${params.toString()}`)
  }

  async function handleCreateList() {
    if (!newListName.trim()) return
    startTransition(async () => {
      await createList(newListName.trim())
      setNewListName('')
      setAddingList(false)
    })
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return
    startTransition(async () => {
      await createTag(newTagName.trim(), newTagColor)
      setNewTagName('')
      setAddingTag(false)
    })
  }

  return (
    <aside className="w-44 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lists</p>

      <button
        onClick={() => setFilter('list_id', null)}
        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs mb-0.5 ${
          !activeListId && !activeTagId
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        <span>All Contacts</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${!activeListId && !activeTagId ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
          {totalCount}
        </span>
      </button>

      {lists.map(list => (
        <button
          key={list.id}
          onClick={() => setFilter('list_id', list.id)}
          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs mb-0.5 ${
            activeListId === list.id
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="truncate">{list.name}</span>
          <span className="ml-1 text-slate-400 text-[10px]">{list.contact_count}</span>
        </button>
      ))}

      {addingList ? (
        <div className="mt-1 flex gap-1">
          <input
            autoFocus
            className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
            placeholder="List name"
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateList(); if (e.key === 'Escape') setAddingList(false) }}
          />
        </div>
      ) : (
        <button
          onClick={() => setAddingList(true)}
          className="mt-1 w-full text-left px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
        >
          + New list
        </button>
      )}

      <p className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tags</p>

      <div className="flex flex-wrap gap-1">
        {tags.map(tag => (
          <button
            key={tag.id}
            onClick={() => setFilter('tag_id', activeTagId === tag.id ? null : tag.id)}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border transition-opacity"
            style={{
              background: activeTagId === tag.id ? `${tag.color}25` : '#f8fafc',
              borderColor: activeTagId === tag.id ? tag.color : '#e2e8f0',
              color: activeTagId === tag.id ? tag.color : '#475569',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
      </div>

      {addingTag ? (
        <div className="mt-2 space-y-1">
          <input
            autoFocus
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
            placeholder="Tag name"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setAddingTag(false) }}
          />
          <div className="flex gap-1">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewTagColor(c)}
                className="h-4 w-4 rounded-full border-2"
                style={{ background: c, borderColor: newTagColor === c ? '#0f172a' : 'transparent' }}
              />
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingTag(true)}
          className="mt-1 w-full text-left px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
        >
          + New tag
        </button>
      )}
    </aside>
  )
}
