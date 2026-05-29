'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { PER_PAGE } from '@/lib/contacts/queries'
import type { ContactWithRelations } from '@/lib/contacts/types'

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  unsubscribed: 'bg-amber-100 text-amber-700',
  bounced: 'bg-red-100 text-red-700',
}

type Props = {
  contacts: ContactWithRelations[]
  total: number
  page: number
  selected: string[]
  onSelect: (ids: string[]) => void
  onOpenDrawer: (contact: ContactWithRelations, mode: 'view' | 'edit') => void
}

export default function ContactsTable({ contacts, total, page, selected, onSelect, onOpenDrawer }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const allSelected = contacts.length > 0 && contacts.every(c => selected.includes(c.id))

  function toggleAll() {
    if (allSelected) onSelect([])
    else onSelect(contacts.map(c => c.id))
  }

  function toggleOne(id: string) {
    if (selected.includes(id)) onSelect(selected.filter(s => s !== id))
    else onSelect([...selected, id])
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/contacts?${params.toString()}`)
  }

  const totalPages = Math.ceil(total / PER_PAGE)
  const from = (page - 1) * PER_PAGE + 1
  const to = Math.min(page * PER_PAGE, total)

  const columns: ColumnDef<ContactWithRelations>[] = [
    {
      id: 'select',
      header: () => (
        <input type="checkbox" checked={allSelected} onChange={toggleAll}
          className="h-3.5 w-3.5 rounded" />
      ),
      cell: ({ row }) => (
        <input type="checkbox" checked={selected.includes(row.original.id)}
          onChange={() => toggleOne(row.original.id)}
          onClick={e => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded" />
      ),
      size: 36,
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const c = row.original
        const initials = `${c.first_name[0] ?? ''}${c.last_name[0] ?? ''}`.toUpperCase() || c.email[0].toUpperCase()
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
              {initials}
            </div>
            <span className="font-medium text-slate-900">{`${c.first_name} ${c.last_name}`.trim() || '—'}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => <span className="text-slate-600">{getValue() as string}</span>,
    },
    {
      id: 'tags',
      header: 'Tags',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tags.map(tag => (
            <span key={tag.id}
              className="rounded-full px-1.5 py-0.5 text-[10px]"
              style={{ background: `${tag.color}20`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as keyof typeof STATUS_STYLES
        return (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[s]}`}>
            {s}
          </span>
        )
      },
    },
    {
      id: 'created_at',
      header: 'Added',
      cell: ({ row }) => (
        <span className="text-slate-400">
          {new Date(row.original.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={e => { e.stopPropagation(); onOpenDrawer(row.original, 'edit') }}
          className="text-slate-400 hover:text-slate-700 px-1"
        >⋯</button>
      ),
      size: 36,
    },
  ]

  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b border-slate-200 bg-slate-50">
                {hg.headers.map(header => (
                  <th key={header.id} className="px-3 py-2 text-left font-medium text-slate-500">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr
                key={row.id}
                onClick={() => onOpenDrawer(row.original, 'view')}
                className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                  selected.includes(row.original.id) ? 'bg-blue-50' : ''
                }`}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center text-slate-400">
                  No contacts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2">
        <span className="text-xs text-slate-500">
          {total === 0 ? 'No contacts' : `Showing ${from}–${to} of ${total}`}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            ← Prev
          </button>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
