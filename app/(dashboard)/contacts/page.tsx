import { Suspense } from 'react'
import { getContacts, getLists, getTags, getCustomFieldDefinitions, getTotalContactCount } from '@/lib/contacts/queries'
import ContactsPageClient from './ContactsPageClient'
import ContactsLoading from './loading'

type Props = {
  searchParams: Promise<{
    page?: string
    search?: string
    list_id?: string
    tag_id?: string
    status?: string
  }>
}

export default async function ContactsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = Number(params.page ?? 1)

  const [contactsPage, lists, tags, customFields, totalCount] = await Promise.all([
    getContacts({
      page,
      search: params.search,
      list_id: params.list_id,
      tag_id: params.tag_id,
      status: params.status as any,
    }),
    getLists(),
    getTags(),
    getCustomFieldDefinitions(),
    getTotalContactCount(),
  ])

  return (
    <Suspense fallback={<ContactsLoading />}>
      <ContactsPageClient
        contactsPage={contactsPage}
        lists={lists}
        tags={tags}
        customFields={customFields}
        totalCount={totalCount}
      />
    </Suspense>
  )
}
