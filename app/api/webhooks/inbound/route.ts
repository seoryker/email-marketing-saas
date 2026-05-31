import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrollContact } from '@/lib/automations/engine'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.token || !body?.action) {
    return NextResponse.json({ error: 'Missing token or action' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: settings } = await supabase
    .from('integration_settings')
    .select('organization_id, webhook_secret')
    .eq('webhook_secret', body.token)
    .single()

  if (!settings) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const org_id = settings.organization_id

  switch (body.action) {
    case 'create_contact': {
      const { email, first_name = '', last_name = '', phone, company } = body.data ?? {}
      if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
      const { data: contact, error } = await supabase
        .from('contacts')
        .upsert({ organization_id: org_id, email, first_name, last_name, phone: phone ?? null, company: company ?? null, status: 'active' },
                 { onConflict: 'organization_id,email' })
        .select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, contact_id: contact.id })
    }

    case 'add_to_list': {
      const { email, list_id, list_name } = body.data ?? {}
      if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
      const { data: contact } = await supabase
        .from('contacts').select('id').eq('email', email).eq('organization_id', org_id).single()
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      let resolvedListId = list_id
      if (!resolvedListId && list_name) {
        const { data: list } = await supabase
          .from('lists').select('id').eq('name', list_name).eq('organization_id', org_id).single()
        resolvedListId = list?.id
      }
      if (!resolvedListId) return NextResponse.json({ error: 'List not found' }, { status: 404 })
      await supabase.from('contact_lists').upsert({ contact_id: contact.id, list_id: resolvedListId }, { onConflict: 'contact_id,list_id' })
      return NextResponse.json({ ok: true })
    }

    case 'trigger_automation': {
      const { email, automation_id } = body.data ?? {}
      if (!email || !automation_id) return NextResponse.json({ error: 'email and automation_id required' }, { status: 400 })
      const { data: contact } = await supabase
        .from('contacts').select('id').eq('email', email).eq('organization_id', org_id).single()
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      await enrollContact(automation_id, contact.id)
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }
}
