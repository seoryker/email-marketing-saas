import { createClient } from '@/lib/supabase/server'
import type { LandingPage } from './types'

export async function getLandingPages(): Promise<LandingPage[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('landing_pages').select('*').order('created_at', { ascending: false })
  return (data ?? []) as LandingPage[]
}

export async function getLandingPage(id: string): Promise<LandingPage | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('landing_pages').select('*').eq('id', id).single()
  return data as LandingPage | null
}

export async function getLandingPageBySlug(slug: string): Promise<LandingPage | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('landing_pages').select('*').eq('slug', slug).single()
  return data as LandingPage | null
}
