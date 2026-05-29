'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ListsSidebar from '@/components/contacts/ListsSidebar'
import ContactsTable from '@/components/contacts/ContactsTable'
import ContactsToolbar from '@/components/contacts/ContactsToolbar'
import BulkActionBar from '@/components/contacts/BulkActionBar'
import ContactDrawer from '@/components/contacts/ContactDrawer'
import ImportModal from '@/components/contacts/ImportModal'
import type { ContactWithRelations, List, Tag, CustomFieldDefinition, ContactsPage } from '@/lib/contacts/types'

type DrawerState =
  | { open: false }
  | { open: true; mode: 'add' }
  | { open: true; mode: 'view' | 'edit'; contact: ContactWithRelations }

type Props = {
  contactsPage: ContactsPage
  lists: List[]
  tags: Tag[]
  customFields: CustomFieldDefinition[]
  totalCount: number
}

export default function ContactsPageClient({ contactsPage, lists, tags, customFields, totalCount }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [drawer, setDrawer] = useState<DrawerState>({ open: false })
  const [importOpen, setImportOpen] = useState(false)

  function openDrawer(contact: ContactWithRelations, mode: 'view' | 'edit') {
    setDrawer({ open: true, mode, contact })
  }

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      <ListsSidebar lists={lists} tags={tags} totalCount={totalCount} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">Contacts</h1>
            <p className="text-xs text-slate-500">{contactsPage.total} total</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              Import CSV
            </button>
            <button
              onClick={() => setDrawer({ open: true, mode: 'add' })}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              + Add Contact
            </button>
          </div>
        </div>

        <ContactsToolbar onImport={() => setImportOpen(true)} onAddContact={() => setDrawer({ open: true, mode: 'add' })} />

        {selected.length > 0 && (
          <BulkActionBar
            selectedIds={selected}
            lists={lists}
            tags={tags}
            onClear={() => setSelected([])}
          />
        )}

        <ContactsTable
          contacts={contactsPage.contacts}
          total={contactsPage.total}
          page={contactsPage.page}
          selected={selected}
          onSelect={setSelected}
          onOpenDrawer={openDrawer}
        />
      </div>

      <ContactDrawer
        open={drawer.open}
        mode={drawer.open ? drawer.mode : 'add'}
        contact={drawer.open && drawer.mode !== 'add' ? drawer.contact : undefined}
        tags={tags}
        lists={lists}
        customFields={customFields}
        onClose={() => setDrawer({ open: false })}
        onSaved={() => { setDrawer({ open: false }); router.refresh() }}
      />

      <ImportModal
        open={importOpen}
        lists={lists}
        onClose={() => { setImportOpen(false); router.refresh() }}
      />
    </div>
  )
}
