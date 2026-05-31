'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ContactStatus, ImportResult } from './types'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

async function triggerContactAutomations(
  supabase: any,
  orgId: string,
  contactId: string,
  triggerType: string,
  triggerConfig: Record<string, unknown> = {}
) {
  const { data: automations } = await supabase
    .from('automations')
    .select('id, trigger_config')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .eq('trigger_type', triggerType)

  for (const automation of automations ?? []) {
    const configListId = automation.trigger_config?.list_id
    if (configListId && configListId !== triggerConfig.list_id) continue
    const configTagName = automation.trigger_config?.tag_name
    if (configTagName && configTagName !== triggerConfig.tag_name) continue

    const { enrollContact } = await import('@/lib/automations/engine')
    await enrollContact(automation.id, contactId).catch(() => {})
  }
}

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile) throw new Error('Profile not found')
  return profile.organization_id
}

export async function createContact(input: {
  email: string
  first_name: string
  last_name: string
  phone?: string
  company?: string
  custom_fields?: Record<string, unknown>
  list_ids?: string[]
  tag_ids?: string[]
}) {
  const supabase = await createClient()
  const org_id = await getOrgId()

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      organization_id: org_id,
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone ?? null,
      company: input.company ?? null,
      custom_fields: input.custom_fields ?? {},
    })
    .select().single()

  if (error) throw new Error(error.message)

  if (input.list_ids?.length) {
    await supabase.from('contact_lists').insert(
      input.list_ids.map(list_id => ({ contact_id: contact.id, list_id }))
    )
    for (const list_id of input.list_ids) {
      await triggerContactAutomations(supabase, org_id, contact.id, 'contact_joins_list', { list_id })
    }
  }
  if (input.tag_ids?.length) {
    await supabase.from('contact_tags').insert(
      input.tag_ids.map(tag_id => ({ contact_id: contact.id, tag_id }))
    )
  }

  revalidatePath('/contacts')
  await dispatchWebhook(org_id, 'contact.created', {
    contact_id: contact.id, email: contact.email,
    first_name: contact.first_name, last_name: contact.last_name, org_id,
  }).catch(() => {})
  return contact
}

export async function updateContact(id: string, input: {
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
  company?: string | null
  status?: ContactStatus
  custom_fields?: Record<string, unknown>
  list_ids?: string[]
  tag_ids?: string[]
}) {
  const supabase = await createClient()
  const { list_ids, tag_ids, ...fields } = input

  if (Object.keys(fields).length) {
    const { error } = await supabase.from('contacts').update(fields).eq('id', id)
    if (error) throw new Error(error.message)
  }

  if (list_ids !== undefined) {
    await supabase.from('contact_lists').delete().eq('contact_id', id)
    if (list_ids.length) {
      await supabase.from('contact_lists').insert(
        list_ids.map(list_id => ({ contact_id: id, list_id }))
      )
    }
  }

  if (tag_ids !== undefined) {
    await supabase.from('contact_tags').delete().eq('contact_id', id)
    if (tag_ids.length) {
      await supabase.from('contact_tags').insert(
        tag_ids.map(tag_id => ({ contact_id: id, tag_id }))
      )
    }
  }

  revalidatePath('/contacts')
}

export async function deleteContacts(ids: string[]) {
  const supabase = await createClient()
  const { error } = await supabase.from('contacts').delete().in('id', ids)
  if (error) throw new Error(error.message)
  revalidatePath('/contacts')
}

export async function importContacts(
  rows: Array<{
    email: string
    first_name: string
    last_name: string
    phone?: string
    company?: string
    custom_fields?: Record<string, unknown>
  }>,
  options: { list_id?: string; update_duplicates?: boolean }
): Promise<ImportResult> {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const emails = rows.map(r => r.email)

  const { data: existing } = await supabase
    .from('contacts').select('id, email')
    .eq('organization_id', org_id).in('email', emails)

  const existingMap = new Map((existing ?? []).map((c: any) => [c.email, c.id]))
  const existingEmails = new Set(existingMap.keys())

  const toInsert = rows.filter(r => !existingEmails.has(r.email))
  const toUpdate = rows.filter(r => existingEmails.has(r.email))

  let inserted = 0, updated = 0, skipped = 0
  const errors: string[] = []

  if (toInsert.length) {
    const { error } = await supabase.from('contacts').insert(
      toInsert.map(r => ({
        organization_id: org_id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone ?? null,
        company: r.company ?? null,
        custom_fields: r.custom_fields ?? {},
      }))
    )
    if (error) errors.push(error.message)
    else inserted = toInsert.length
  }

  if (options.update_duplicates && toUpdate.length) {
    for (const r of toUpdate) {
      const { error } = await supabase.from('contacts')
        .update({ first_name: r.first_name, last_name: r.last_name, phone: r.phone ?? null, company: r.company ?? null })
        .eq('id', existingMap.get(r.email))
      if (error) errors.push(error.message)
      else updated++
    }
  } else {
    skipped = toUpdate.length
  }

  if (options.list_id && inserted > 0) {
    const { data: newContacts } = await supabase
      .from('contacts').select('id')
      .eq('organization_id', org_id)
      .in('email', toInsert.map(r => r.email))
    if (newContacts?.length) {
      await supabase.from('contact_lists').insert(
        newContacts.map((c: any) => ({ contact_id: c.id, list_id: options.list_id }))
      )
    }
  }

  revalidatePath('/contacts')
  return { inserted, updated, skipped, errors }
}

export async function createList(name: string) {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const { data, error } = await supabase
    .from('lists').insert({ organization_id: org_id, name }).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/contacts')
  revalidatePath('/lists')
  return data
}

export async function deleteList(id: string) {
  const supabase = await createClient()
  await supabase.from('lists').delete().eq('id', id)
  revalidatePath('/contacts')
  revalidatePath('/lists')
}

export async function createTag(name: string, color: string) {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const { data, error } = await supabase
    .from('tags').insert({ organization_id: org_id, name, color }).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/contacts')
  return data
}
