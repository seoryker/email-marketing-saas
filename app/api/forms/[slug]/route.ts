import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await request.json().catch(() => ({}))
  const supabase = await createClient()
  const { data: page } = await supabase.from('landing_pages').select('id, organization_id, status, add_to_list_id').eq('slug', slug).single()
  if (!page || page.status !== 'published') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const email = String(data.email || data.Email || '').trim().toLowerCase()
  let contact_id: string | null = null
  if (email) {
    const firstName = String(data.first_name || data['First Name'] || data.name || '').trim()
    const lastName = String(data.last_name || data['Last Name'] || '').trim()
    const { data: contact } = await supabase.from('contacts').upsert({ organization_id: page.organization_id, email, first_name: firstName, last_name: lastName, status: 'active' }, { onConflict: 'organization_id,email' }).select('id').single()
    contact_id = contact?.id ?? null
    if (contact_id && page.add_to_list_id) {
      await supabase.from('contact_lists').upsert({ contact_id, list_id: page.add_to_list_id }, { onConflict: 'contact_id,list_id' })
    }
  }
  await supabase.from('page_submissions').insert({ page_id: page.id, contact_id, data })
  const { dispatchWebhook } = await import('@/lib/webhooks/dispatch')
  await dispatchWebhook(page.organization_id, 'form.submitted', {
    page_id: page.id, email: email || null, data, org_id: page.organization_id,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
