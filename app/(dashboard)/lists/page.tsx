import { getLists } from '@/lib/contacts/queries'
import ListsPageClient from './ListsPageClient'

export default async function ListsPage() {
  const lists = await getLists()
  return <ListsPageClient lists={lists} />
}
