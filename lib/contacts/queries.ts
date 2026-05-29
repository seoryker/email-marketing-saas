import { createClient } from '@/lib/supabase/server'
import type {
  ContactsFilter, ContactsPage, ContactWithRelations,
  List, Tag, CustomFieldDefinition
} from './types'

export const PER_PAGE = 50

export async function getContacts(filter: ContactsFilter = {}): Promise<ContactsPage> {
  const supabase = await createClient()
  const { search, list_id, tag_id, status, page = 1, sort = 'created_at', order = 'desc' } = filter

  let query = supabase
    .from('contacts')
    .select(
      '*, tags:contact_tags(tag:tags(*)), lists:contact_lists(list:lists(*))',
      { count: 'exact' }
    )
    .order(sort, { ascending: order === 'asc' })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  if (search) {
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    )
  }
  if (status) query = query.eq('status', status)
  if (list_id) {
    const { data: ids } = await supabase
      .from('contact_lists').select('contact_id').eq('list_id', list_id)
    query = query.in('id', (ids ?? []).map((r: { contact_id: string }) => r.contact_id))
  }
  if (tag_id) {
    const { data: ids } = await supabase
      .from('contact_tags').select('contact_id').eq('tag_id', tag_id)
    query = query.in('id', (ids ?? []).map((r: { contact_id: string }) => r.contact_id))
  }

  const { data, count, error } = await query
  if (error) throw error

  const contacts: ContactWithRelations[] = (data ?? []).map((c: any) => ({
    ...c,
    tags: (c.tags ?? []).map((t: any) => t.tag).filter(Boolean),
    lists: (c.lists ?? []).map((l: any) => l.list).filter(Boolean),
  }))

  return { contacts, total: count ?? 0, page, per_page: PER_PAGE }
}

export async function getContact(id: string): Promise<ContactWithRelations | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('*, tags:contact_tags(tag:tags(*)), lists:contact_lists(list:lists(*))')
    .eq('id', id)
    .single()
  if (error) return null
  return {
    ...data,
    tags: (data.tags ?? []).map((t: any) => t.tag).filter(Boolean),
    lists: (data.lists ?? []).map((l: any) => l.list).filter(Boolean),
  }
}

export async function getLists(): Promise<List[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('lists').select('*').order('name')
  return data ?? []
}

export async function getTags(): Promise<Tag[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('tags').select('*').order('name')
  return data ?? []
}

export async function getCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('custom_field_definitions').select('*').order('label')
  return data ?? []
}

export async function getTotalContactCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('contacts').select('*', { count: 'exact', head: true })
  return count ?? 0
}
