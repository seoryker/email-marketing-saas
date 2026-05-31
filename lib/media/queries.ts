import { createClient } from '@/lib/supabase/server'

export type MediaFile = {
  id: string
  organization_id: string
  filename: string
  public_url: string
  size_bytes: number | null
  created_at: string
}

export async function getRecentUploads(limit = 12): Promise<MediaFile[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('media_files').select('*')
    .order('created_at', { ascending: false }).limit(limit)
  return (data ?? []) as MediaFile[]
}
