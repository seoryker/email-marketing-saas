import { getContacts, getLists, getTags, getCustomFieldDefinitions } from '@/lib/contacts/queries'
import ContactsPageClient from '../../contacts/ContactsPageClient'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; search?: string }>
}

export default async function ListDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams

  const [contactsPage, lists, tags, customFields] = await Promise.all([
    getContacts({ list_id: id, page: Number(sp.page ?? 1), search: sp.search }),
    getLists(),
    getTags(),
    getCustomFieldDefinitions(),
  ])

  const list = lists.find(l => l.id === id)
  if (!list) notFound()

  return (
    <ContactsPageClient
      contactsPage={contactsPage}
      lists={lists}
      tags={tags}
      customFields={customFields}
      totalCount={list.contact_count}
    />
  )
}
