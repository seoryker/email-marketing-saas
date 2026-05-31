import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePresignedPutUrl, buildPublicUrl, buildR2Key, isValidImageType, isValidFileSize } from '@/lib/r2/upload'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.filename || !body?.contentType || !body?.size) {
    return NextResponse.json({ error: 'Missing filename, contentType, or size' }, { status: 400 })
  }
  if (!isValidImageType(body.contentType)) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
  }
  if (!isValidFileSize(body.size)) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  const key = buildR2Key(profile.organization_id, body.filename)
  const publicUrl = buildPublicUrl(key)
  const uploadUrl = await generatePresignedPutUrl(key, body.contentType)

  await supabase.from('media_files').insert({
    organization_id: profile.organization_id,
    filename: body.filename,
    public_url: publicUrl,
    size_bytes: body.size,
  })

  return NextResponse.json({ uploadUrl, publicUrl })
}
