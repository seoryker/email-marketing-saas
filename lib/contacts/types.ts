export type ContactStatus = 'active' | 'unsubscribed' | 'bounced'

export type Contact = {
  id: string
  organization_id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  company: string | null
  status: ContactStatus
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ContactWithRelations = Contact & {
  tags: Tag[]
  lists: List[]
}

export type List = {
  id: string
  organization_id: string
  name: string
  description: string | null
  contact_count: number
  created_at: string
}

export type Tag = {
  id: string
  organization_id: string
  name: string
  color: string
  created_at: string
}

export type CustomFieldDefinition = {
  id: string
  organization_id: string
  field_key: string
  label: string
  field_type: 'text' | 'number' | 'date' | 'dropdown'
  options: string[] | null
  created_at: string
}

export type ImportResult = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export type ContactsFilter = {
  search?: string
  list_id?: string
  tag_id?: string
  status?: ContactStatus
  page?: number
  sort?: string
  order?: 'asc' | 'desc'
}

export type ContactsPage = {
  contacts: ContactWithRelations[]
  total: number
  page: number
  per_page: number
}
