'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

type Props = {
  onImport: () => void
  onAddContact: () => void
}

export default function ContactsToolbar({ onImport, onAddContact }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function handleSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('search', value)
    else params.delete('search')
    params.delete('page')
    startTransition(() => router.push(`/contacts?${params.toString()}`))
  }

  const currentSearch = searchParams.get('search') ?? ''

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
          placeholder="Search contacts..."
          defaultValue={currentSearch}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>
      <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
        Filter
      </button>
      <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
        Sort
      </button>
    </div>
  )
}
