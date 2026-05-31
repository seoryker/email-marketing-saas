'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PageStatus } from './types'

async function getOrgId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: p } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
  if (!p) throw new Error('No profile')
  return p.organization_id as string
}

export async function createLandingPage(name: string): Promise<string> {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const { data, error } = await supabase
    .from('landing_pages').insert({ organization_id: org_id, name }).select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath('/landing-pages')
  return data.id
}

export async function updateLandingPage(id: string, input: {
  name?: string; status?: PageStatus
  content_json?: Record<string, unknown>; content_html?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('landing_pages').update(input).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/landing-pages')
}

export async function deleteLandingPage(id: string) {
  const supabase = await createClient()
  await supabase.from('landing_pages').delete().eq('id', id)
  revalidatePath('/landing-pages')
}
