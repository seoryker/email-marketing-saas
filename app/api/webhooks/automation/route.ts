import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrollContact } from '@/lib/automations/engine'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.email || !body?.automation_id) {
    return NextResponse.json({ error: 'Missing email or automation_id' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: automation } = await supabase
    .from('automations').select('id, organization_id, status')
    .eq('id', body.automation_id).single()

  if (!automation || automation.status !== 'active') {
    return NextResponse.json({ error: 'Automation not found or not active' }, { status: 404 })
  }

  const { data: contact } = await supabase
    .from('contacts').select('id')
    .eq('email', body.email).eq('organization_id', automation.organization_id).single()

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  await enrollContact(automation.id, contact.id)
  return NextResponse.json({ ok: true })
}
