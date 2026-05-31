# Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare R2 image uploads to both builders, outbound/inbound webhooks for Zapier/Make/n8n, and Google Analytics 4 tracking across the platform.

**Architecture:** R2 uses presigned PUT URLs (S3-compatible via @aws-sdk) — client uploads directly to R2, bypassing the server. Webhooks fire-and-forget from existing action call sites. GA4 Measurement ID stored in integration_settings; injected via Next.js Script tag in dashboard layout and public pages.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

---

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/009_media.sql` | media_files + integration_settings tables |
| `lib/r2/client.ts` | S3Client configured for Cloudflare R2 |
| `lib/r2/upload.ts` | generatePresignedPutUrl + slugifyFilename |
| `lib/r2/__tests__/upload.test.ts` | TDD tests for slugifyFilename |
| `lib/media/queries.ts` | getRecentUploads |
| `lib/webhooks/dispatch.ts` | dispatchWebhook fire-and-forget helper |
| `lib/webhooks/__tests__/dispatch.test.ts` | TDD tests for event filtering logic |
| `lib/integrations/actions.ts` | saveWebhookSettings, saveGASettings, getIntegrationSettings |
| `app/api/upload/route.ts` | POST: validate → presign → insert media_files → return URLs |
| `app/api/webhooks/inbound/route.ts` | POST: token auth → create_contact/add_to_list/trigger_automation |
| `components/media/UploadModal.tsx` | Drag-drop uploader with recent uploads grid |
| `components/campaigns/EmailBuilder.tsx` (modify) | Register custom Unlayer image uploader |
| `app/(dashboard)/settings/integrations/page.tsx` | Integrations settings UI |
| `app/(dashboard)/layout.tsx` (modify) | Inject GA4 script if measurement_id set |
| `app/p/[slug]/page.tsx` (modify) | Inject GA4 + fire form_submit event |

---

## Task 1: Dependencies + DB Migration

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/009_media.sql`
- Modify: `.env.local`

- [ ] **Step 1: Install AWS SDK for R2**

```bash
cd /Users/poledilip/email-marketing-saas
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/009_media.sql`:
```sql
-- Media files: tracks R2 uploads per org
create table public.media_files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  filename        text not null,
  public_url      text not null,
  size_bytes      integer,
  created_at      timestamptz default now()
);

create index on public.media_files(organization_id, created_at desc);

alter table public.media_files enable row level security;

create policy "org members can manage media files"
  on public.media_files for all
  using (organization_id = public.current_org_id());

-- Integration settings: one row per org
create table public.integration_settings (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid unique not null references public.organizations(id) on delete cascade,
  webhook_url         text,
  webhook_events      text[] not null default '{}',
  webhook_secret      text not null default gen_random_uuid()::text,
  ga_measurement_id   text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create trigger integration_settings_updated_at
  before update on public.integration_settings
  for each row execute function public.set_updated_at();

alter table public.integration_settings enable row level security;

create policy "org members can manage integration settings"
  on public.integration_settings for all
  using (organization_id = public.current_org_id());
```

- [ ] **Step 3: Apply in Supabase dashboard**

Supabase → SQL Editor → paste `009_media.sql` → Run.

- [ ] **Step 4: Add R2 env vars to .env.local**

Open `/Users/poledilip/email-marketing-saas/.env.local` and add:
```
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-access-key
CLOUDFLARE_R2_BUCKET_NAME=mailflow-assets
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

Get these from: Cloudflare dashboard → R2 → Create bucket "mailflow-assets" → Enable public access → Manage R2 API tokens.

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add package.json package-lock.json supabase/migrations/009_media.sql
git commit -m "feat: add media + integration_settings schema, R2 deps"
```

---

## Task 2: R2 Client + Upload Helper (TDD)

**Files:**
- Create: `lib/r2/client.ts`
- Create: `lib/r2/upload.ts`
- Create: `lib/r2/__tests__/upload.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/r2/__tests__/upload.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { slugifyFilename, isValidImageType, isValidFileSize } from '../upload'

describe('slugifyFilename', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugifyFilename('My Hero Banner.jpg')).toBe('my-hero-banner.jpg')
  })

  it('removes special characters', () => {
    expect(slugifyFilename('image (1).png')).toBe('image-1.png')
  })

  it('preserves extension', () => {
    expect(slugifyFilename('photo.JPEG')).toBe('photo.jpeg')
  })
})

describe('isValidImageType', () => {
  it('accepts common image types', () => {
    expect(isValidImageType('image/jpeg')).toBe(true)
    expect(isValidImageType('image/png')).toBe(true)
    expect(isValidImageType('image/gif')).toBe(true)
    expect(isValidImageType('image/webp')).toBe(true)
  })

  it('rejects non-image types', () => {
    expect(isValidImageType('application/pdf')).toBe(false)
    expect(isValidImageType('text/plain')).toBe(false)
  })
})

describe('isValidFileSize', () => {
  it('accepts files under 5MB', () => {
    expect(isValidFileSize(4 * 1024 * 1024)).toBe(true)
  })

  it('rejects files over 5MB', () => {
    expect(isValidFileSize(6 * 1024 * 1024)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/r2/__tests__/upload.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create R2 client**

Create `lib/r2/client.ts`:
```typescript
import { S3Client } from '@aws-sdk/client-s3'

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

export const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!
export const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!
```

- [ ] **Step 4: Create upload helpers**

Create `lib/r2/upload.ts`:
```typescript
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from './client'

export function slugifyFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot).toLowerCase() : ''
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug}${ext}`
}

export function isValidImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function isValidFileSize(bytes: number): boolean {
  return bytes <= 5 * 1024 * 1024 // 5MB
}

export async function generatePresignedPutUrl(
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(r2Client, command, { expiresIn: 900 }) // 15 minutes
}

export function buildPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

export function buildR2Key(orgId: string, filename: string): string {
  return `${orgId}/${Date.now()}-${slugifyFilename(filename)}`
}
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/r2/__tests__/upload.test.ts
```
Expected: PASS — 7 tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/r2/
git commit -m "feat: add R2 client and upload helpers"
```

---

## Task 3: Upload API Route + Media Queries

**Files:**
- Create: `app/api/upload/route.ts`
- Create: `lib/media/queries.ts`

- [ ] **Step 1: Create media queries**

Create `lib/media/queries.ts`:
```typescript
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
    .from('media_files')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as MediaFile[]
}
```

- [ ] **Step 2: Create upload API route**

Create `app/api/upload/route.ts`:
```typescript
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

  // Insert media_files row immediately (before upload completes)
  // This makes it appear in recent uploads even if user navigates away
  await supabase.from('media_files').insert({
    organization_id: profile.organization_id,
    filename: body.filename,
    public_url: publicUrl,
    size_bytes: body.size,
  })

  return NextResponse.json({ uploadUrl, publicUrl })
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/api/upload/ lib/media/
git commit -m "feat: add upload API route and media queries"
```

---

## Task 4: UploadModal Component

**Files:**
- Create: `components/media/UploadModal.tsx`

- [ ] **Step 1: Create UploadModal**

Create `components/media/UploadModal.tsx`:
```typescript
'use client'

import { useState, useRef, useCallback } from 'react'

type Props = {
  onSelect: (url: string) => void
  onClose: () => void
  recentUploads?: Array<{ public_url: string; filename: string }>
}

export default function UploadModal({ onSelect, onClose, recentUploads = [] }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setError(null)
    setUploading(true)
    setProgress(10)

    try {
      // Get presigned URL
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Upload failed')
      }

      const { uploadUrl, publicUrl } = await res.json()
      setProgress(40)

      // Upload directly to R2
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      })

      if (!uploadRes.ok) throw new Error('Failed to upload to storage')

      setProgress(100)
      setTimeout(() => {
        setUploading(false)
        onSelect(publicUrl)
      }, 300)
    } catch (err: any) {
      setError(err.message)
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Upload Image</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
          >
            {uploading ? (
              <div className="space-y-2">
                <div className="text-2xl">⏫</div>
                <p className="text-xs font-medium text-slate-700">Uploading...</p>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-3xl">🖼️</div>
                <p className="text-sm font-medium text-slate-700">Drop image here</p>
                <p className="text-xs text-slate-400">PNG, JPG, GIF, WebP · Max 5MB</p>
                <button className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                  Browse files
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Paste URL */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">Or paste image URL</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={pasteUrl}
                onChange={e => setPasteUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500"
              />
              <button
                onClick={() => pasteUrl && onSelect(pasteUrl)}
                disabled={!pasteUrl}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-40 hover:bg-slate-700"
              >
                Use
              </button>
            </div>
          </div>

          {/* Recent uploads */}
          {recentUploads.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-700">Recent uploads</p>
              <div className="grid grid-cols-4 gap-2">
                {recentUploads.slice(0, 12).map(f => (
                  <button
                    key={f.public_url}
                    onClick={() => onSelect(f.public_url)}
                    className="aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-blue-400 hover:ring-2 hover:ring-blue-200 transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.public_url} alt={f.filename} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/media/UploadModal.tsx
git commit -m "feat: add UploadModal component"
```

---

## Task 5: Wire UploadModal into EmailBuilder

**Files:**
- Modify: `components/campaigns/EmailBuilder.tsx`

- [ ] **Step 1: Update EmailBuilder to accept upload handler prop and open UploadModal**

Read `components/campaigns/EmailBuilder.tsx`, then update it to:
1. Accept an optional `onImageUpload` prop
2. Register Unlayer's `selectImage` callback to open the UploadModal

Replace the entire `components/campaigns/EmailBuilder.tsx` file with:
```typescript
'use client'

import { useRef, forwardRef, useImperativeHandle, useState } from 'react'
import dynamic from 'next/dynamic'
import UploadModal from '@/components/media/UploadModal'
import type { MediaFile } from '@/lib/media/queries'

const EmailEditor = dynamic(
  () => import('react-email-editor').then(m => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-slate-700">
        <div className="text-sm text-slate-400">Loading editor...</div>
      </div>
    )
  }
)

export type EmailBuilderRef = {
  exportHtml: () => Promise<{ design: Record<string, unknown>; html: string }>
  loadDesign: (design: Record<string, unknown>) => void
}

type Props = {
  initialDesign?: Record<string, unknown> | null
  onDesignChange?: () => void
  recentUploads?: MediaFile[]
}

const EmailBuilder = forwardRef<EmailBuilderRef, Props>(
  ({ initialDesign, onDesignChange, recentUploads = [] }, ref) => {
    const editorRef = useRef<any>(null)
    const [showUploadModal, setShowUploadModal] = useState(false)
    const selectImageDoneRef = useRef<((url: string) => void) | null>(null)

    useImperativeHandle(ref, () => ({
      exportHtml: () =>
        new Promise((resolve) => {
          editorRef.current?.exportHtml((data: any) => {
            resolve({ design: data.design, html: data.html })
          })
        }),
      loadDesign: (design: Record<string, unknown>) => {
        editorRef.current?.loadDesign(design)
      },
    }))

    function handleLoad() {
      if (initialDesign) {
        editorRef.current?.loadDesign(initialDesign)
      }
      editorRef.current?.addEventListener('design:updated', () => {
        onDesignChange?.()
      })
      // Register custom image uploader
      editorRef.current?.registerCallback('selectImage', (_data: any, done: (url: string) => void) => {
        selectImageDoneRef.current = done
        setShowUploadModal(true)
      })
    }

    function handleImageSelected(url: string) {
      setShowUploadModal(false)
      selectImageDoneRef.current?.(url)
      selectImageDoneRef.current = null
    }

    return (
      <>
        <EmailEditor
          ref={editorRef}
          onLoad={handleLoad}
          options={{
            locale: 'en-US',
            mergeTags: {
              first_name: { name: 'First Name', value: '{{first_name}}' },
              last_name: { name: 'Last Name', value: '{{last_name}}' },
              email: { name: 'Email', value: '{{email}}' },
              company: { name: 'Company', value: '{{company}}' },
            },
          }}
          style={{ flex: 1, minHeight: 0 }}
        />
        {showUploadModal && (
          <UploadModal
            onSelect={handleImageSelected}
            onClose={() => { setShowUploadModal(false); selectImageDoneRef.current = null }}
            recentUploads={recentUploads}
          />
        )}
      </>
    )
  }
)

EmailBuilder.displayName = 'EmailBuilder'
export default EmailBuilder
```

- [ ] **Step 2: Update campaign builder page to pass recentUploads**

In `app/(dashboard)/campaigns/[id]/edit/page.tsx`, add `getRecentUploads` call:

```typescript
import { notFound } from 'next/navigation'
import { getCampaign } from '@/lib/campaigns/queries'
import { getLists } from '@/lib/contacts/queries'
import { getRecentUploads } from '@/lib/media/queries'
import BuilderClient from './BuilderClient'

type Props = { params: Promise<{ id: string }> }

export default async function BuilderPage({ params }: Props) {
  const { id } = await params
  const [campaign, lists, recentUploads] = await Promise.all([
    getCampaign(id),
    getLists(),
    getRecentUploads(12),
  ])
  if (!campaign) notFound()
  return <BuilderClient campaign={campaign} lists={lists} recentUploads={recentUploads} />
}
```

Update `BuilderClient.tsx` to accept and pass `recentUploads` to `EmailBuilder`:

In `app/(dashboard)/campaigns/[id]/edit/BuilderClient.tsx`, add `recentUploads: MediaFile[]` to `Props` type and pass it to `<EmailBuilder recentUploads={recentUploads} />`.

Also update the landing page builder the same way — in `app/(dashboard)/landing-pages/[id]/edit/page.tsx` add `getRecentUploads(12)` and pass to `PageBuilderClient`.

In `app/(dashboard)/landing-pages/[id]/edit/PageBuilderClient.tsx` add `recentUploads?: MediaFile[]` to props and pass `recentUploads={recentUploads ?? []}` to `<EmailBuilder>`.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/campaigns/EmailBuilder.tsx app/(dashboard)/campaigns/[id]/edit/ app/(dashboard)/landing-pages/[id]/edit/
git commit -m "feat: wire R2 upload modal into Unlayer builders"
```

---

## Task 6: Webhook Dispatch (TDD) + Wire Into Call Sites

**Files:**
- Create: `lib/webhooks/dispatch.ts`
- Create: `lib/webhooks/__tests__/dispatch.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/webhooks/__tests__/dispatch.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { shouldDispatch } from '../dispatch'

describe('shouldDispatch', () => {
  it('dispatches when event is in webhook_events and url is set', () => {
    expect(shouldDispatch(
      { webhook_url: 'https://hook.example.com', webhook_events: ['contact.created', 'campaign.sent'] },
      'contact.created'
    )).toBe(true)
  })

  it('skips when event not in webhook_events', () => {
    expect(shouldDispatch(
      { webhook_url: 'https://hook.example.com', webhook_events: ['campaign.sent'] },
      'contact.created'
    )).toBe(false)
  })

  it('skips when webhook_url is empty', () => {
    expect(shouldDispatch(
      { webhook_url: '', webhook_events: ['contact.created'] },
      'contact.created'
    )).toBe(false)
  })

  it('skips when webhook_url is null', () => {
    expect(shouldDispatch(
      { webhook_url: null, webhook_events: ['contact.created'] },
      'contact.created'
    )).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/webhooks/__tests__/dispatch.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create dispatch.ts**

Create `lib/webhooks/dispatch.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'

type WebhookSettings = {
  webhook_url: string | null
  webhook_events: string[]
}

export function shouldDispatch(settings: WebhookSettings, event: string): boolean {
  return !!(settings.webhook_url && settings.webhook_events.includes(event))
}

export async function dispatchWebhook(
  orgId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: settings } = await supabase
      .from('integration_settings')
      .select('webhook_url, webhook_events')
      .eq('organization_id', orgId)
      .single()

    if (!settings || !shouldDispatch(settings, event)) return

    await fetch(settings.webhook_url!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Fire-and-forget — webhook failures never affect the main flow
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/webhooks/__tests__/dispatch.test.ts
```
Expected: PASS — 4 tests pass

- [ ] **Step 5: Wire into lib/contacts/actions.ts**

In `lib/contacts/actions.ts`, add `import { dispatchWebhook } from '@/lib/webhooks/dispatch'` at the top.

In the `createContact` function, after `revalidatePath('/contacts')`, add:
```typescript
await dispatchWebhook(org_id, 'contact.created', {
  contact_id: contact.id,
  email: contact.email,
  first_name: contact.first_name,
  last_name: contact.last_name,
  org_id,
}).catch(() => {})
```

- [ ] **Step 6: Wire into lib/campaigns/actions.ts**

In `lib/campaigns/actions.ts`, at the end of `sendCampaign` (after `revalidatePath`), add:
```typescript
const { data: { user } } = await supabase.auth.getUser()
if (user) {
  const { data: p } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
  if (p) {
    await dispatchWebhook(p.organization_id, 'campaign.sent', {
      campaign_id: campaignId,
      recipient_count: activeContacts.length,
      sent: sent,
      org_id: p.organization_id,
    }).catch(() => {})
  }
}
```

Add import at top: `import { dispatchWebhook } from '@/lib/webhooks/dispatch'`

- [ ] **Step 7: Wire into app/api/forms/[slug]/route.ts**

In `app/api/forms/[slug]/route.ts`, after `await supabase.from('page_submissions').insert(...)`, add:
```typescript
const { dispatchWebhook } = await import('@/lib/webhooks/dispatch')
await dispatchWebhook(page.organization_id, 'form.submitted', {
  page_id: page.id,
  email: email || null,
  data,
  org_id: page.organization_id,
}).catch(() => {})
```

- [ ] **Step 8: Run all tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/webhooks/ lib/contacts/actions.ts lib/campaigns/actions.ts app/api/forms/
git commit -m "feat: add webhook dispatch and wire into call sites"
```

---

## Task 7: Inbound Webhook Route

**Files:**
- Create: `app/api/webhooks/inbound/route.ts`

- [ ] **Step 1: Create inbound webhook handler**

Create `app/api/webhooks/inbound/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrollContact } from '@/lib/automations/engine'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.token || !body?.action) {
    return NextResponse.json({ error: 'Missing token or action' }, { status: 400 })
  }

  const supabase = await createClient()

  // Validate token
  const { data: settings } = await supabase
    .from('integration_settings')
    .select('organization_id, webhook_secret')
    .eq('webhook_secret', body.token)
    .single()

  if (!settings) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

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

      await supabase.from('contact_lists')
        .upsert({ contact_id: contact.id, list_id: resolvedListId }, { onConflict: 'contact_id,list_id' })
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/api/webhooks/inbound/
git commit -m "feat: add inbound webhook route"
```

---

## Task 8: Integration Settings Page

**Files:**
- Create: `lib/integrations/actions.ts`
- Create: `app/(dashboard)/settings/integrations/page.tsx`

- [ ] **Step 1: Create integration actions**

Create `lib/integrations/actions.ts`:
```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getOrgId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: p } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
  if (!p) throw new Error('No profile')
  return { supabase, org_id: p.organization_id as string }
}

export async function getIntegrationSettings() {
  const { supabase, org_id } = await getOrgId()
  const { data } = await supabase
    .from('integration_settings')
    .select('*')
    .eq('organization_id', org_id)
    .single()
  return data
}

export async function saveWebhookSettings(input: { webhook_url: string; webhook_events: string[] }) {
  const { supabase, org_id } = await getOrgId()
  await supabase.from('integration_settings').upsert(
    { organization_id: org_id, webhook_url: input.webhook_url, webhook_events: input.webhook_events },
    { onConflict: 'organization_id' }
  )
  revalidatePath('/settings/integrations')
}

export async function saveGASettings(ga_measurement_id: string) {
  const { supabase, org_id } = await getOrgId()
  await supabase.from('integration_settings').upsert(
    { organization_id: org_id, ga_measurement_id: ga_measurement_id || null },
    { onConflict: 'organization_id' }
  )
  revalidatePath('/settings/integrations')
}

export async function sendTestWebhook() {
  const { supabase, org_id } = await getOrgId()
  const { data: settings } = await supabase
    .from('integration_settings')
    .select('webhook_url')
    .eq('organization_id', org_id)
    .single()

  if (!settings?.webhook_url) throw new Error('No webhook URL configured')

  const res = await fetch(settings.webhook_url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), data: { message: 'Test webhook from MailFlow' } }),
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
  return { ok: true }
}
```

- [ ] **Step 2: Create integrations settings page**

Create `app/(dashboard)/settings/integrations/page.tsx`:
```typescript
import { getIntegrationSettings } from '@/lib/integrations/actions'
import IntegrationsClient from './IntegrationsClient'

export default async function IntegrationsPage() {
  const settings = await getIntegrationSettings()
  return <IntegrationsClient settings={settings} />
}
```

Create `app/(dashboard)/settings/integrations/IntegrationsClient.tsx`:
```typescript
'use client'

import { useState, useTransition } from 'react'
import { saveWebhookSettings, saveGASettings, sendTestWebhook } from '@/lib/integrations/actions'

const WEBHOOK_EVENTS = [
  { value: 'contact.created', label: 'Contact created' },
  { value: 'contact.unsubscribed', label: 'Contact unsubscribed' },
  { value: 'campaign.sent', label: 'Campaign sent' },
  { value: 'form.submitted', label: 'Form submitted' },
  { value: 'automation.completed', label: 'Automation completed' },
]

type Props = {
  settings: {
    webhook_url: string | null
    webhook_events: string[]
    webhook_secret: string
    ga_measurement_id: string | null
  } | null
}

export default function IntegrationsClient({ settings }: Props) {
  const [isPending, startTransition] = useTransition()
  const [webhookUrl, setWebhookUrl] = useState(settings?.webhook_url ?? '')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(settings?.webhook_events ?? [])
  const [gaId, setGaId] = useState(settings?.ga_measurement_id ?? '')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function toggleEvent(event: string) {
    setSelectedEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    )
  }

  function copySecret() {
    navigator.clipboard.writeText(settings?.webhook_secret ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Integrations</h1>
        <p className="text-sm text-slate-500 mt-0.5">Connect MailFlow to external tools</p>
      </div>

      {/* Webhooks section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Webhooks</h2>
          <p className="text-xs text-slate-500 mt-0.5">Send events to Zapier, Make, n8n, or any webhook-compatible tool</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Outbound webhook URL</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700">Send events for</label>
          <div className="space-y-1.5">
            {WEBHOOK_EVENTS.map(e => (
              <label key={e.value} className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={selectedEvents.includes(e.value)}
                  onChange={() => toggleEvent(e.value)}
                  className="h-3.5 w-3.5 rounded" />
                <span className="text-xs text-slate-700">{e.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => startTransition(async () => { await saveWebhookSettings({ webhook_url: webhookUrl, webhook_events: selectedEvents }) })}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save webhook settings
          </button>
          <button
            onClick={() => startTransition(async () => {
              try { await sendTestWebhook(); setTestResult('✓ Test sent successfully') }
              catch (err: any) { setTestResult(`✗ ${err.message}`) }
              setTimeout(() => setTestResult(null), 5000)
            })}
            disabled={isPending || !webhookUrl}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Send test event
          </button>
        </div>
        {testResult && <p className={`text-xs ${testResult.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{testResult}</p>}

        {settings?.webhook_secret && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
            <p className="text-xs font-medium text-slate-700">Inbound webhook token</p>
            <p className="text-[11px] text-slate-500">Use this token to send data INTO MailFlow from external tools:</p>
            <p className="text-[10px] text-slate-400 font-mono">POST https://yourapp.com/api/webhooks/inbound</p>
            <div className="flex gap-2">
              <code className="flex-1 rounded bg-slate-900 px-2 py-1.5 text-[11px] text-green-400 font-mono truncate">
                {settings.webhook_secret}
              </code>
              <button onClick={copySecret}
                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-white">
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Google Analytics section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Google Analytics 4</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track activity across your dashboard and landing pages</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Measurement ID</label>
          <input
            type="text"
            value={gaId}
            onChange={e => setGaId(e.target.value)}
            placeholder="G-XXXXXXXXXX"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-400">Find this in Google Analytics → Admin → Data Streams → your stream</p>
        </div>

        <button
          onClick={() => startTransition(async () => { await saveGASettings(gaId) })}
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save GA settings
        </button>

        {gaId && <p className="text-xs text-green-600">✓ Tracking active on dashboard and landing pages</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add Integrations to settings nav**

Update `app/(dashboard)/settings/page.tsx` to add a nav or keep redirect to `/settings/team`. The settings layout should show sub-nav tabs: Team | Integrations.

Create `app/(dashboard)/settings/layout.tsx`:
```typescript
import Link from 'next/link'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
      </div>
      <div className="flex border-b border-slate-200 gap-0">
        <Link href="/settings/team"
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300">
          Team
        </Link>
        <Link href="/settings/integrations"
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300">
          Integrations
        </Link>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/integrations/ app/(dashboard)/settings/integrations/ app/(dashboard)/settings/layout.tsx
git commit -m "feat: add integrations settings page"
```

---

## Task 9: Google Analytics Injection

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/p/[slug]/page.tsx`

- [ ] **Step 1: Inject GA4 into dashboard layout**

Read `app/(dashboard)/layout.tsx`, then add GA4 script injection. After fetching the profile, also fetch `integration_settings`:

```typescript
import Script from 'next/script'
// ... existing imports

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (!profile.full_name) redirect('/onboarding')

  // Fetch GA4 measurement ID
  const { data: integrationSettings } = await supabase
    .from('integration_settings')
    .select('ga_measurement_id')
    .eq('organization_id', (profile as any).organization_id ?? '')
    .single()

  const gaMeasurementId = integrationSettings?.ga_measurement_id ?? null

  const profileData = {
    full_name: profile.full_name,
    organizations: { name: (profile.organizations as { name: string } | null)?.name ?? '' },
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {gaMeasurementId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaMeasurementId}');
          `}</Script>
        </>
      )}
      <Sidebar profile={profileData} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar profile={profileData} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Inject GA4 into public landing pages**

Read `app/p/[slug]/page.tsx`, then update it to inject GA4 if the org has a measurement ID. The page already fetches `page` which has `organization_id`. Add a query for `integration_settings`:

```typescript
// After fetching page:
const { data: integrationSettings } = await supabase
  .from('integration_settings')
  .select('ga_measurement_id')
  .eq('organization_id', page.organization_id)
  .single()

const gaMeasurementId = integrationSettings?.ga_measurement_id ?? null
```

Then in the returned HTML, add before `</head>`:
```typescript
{gaMeasurementId && `
  <script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>
  <script>
    window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
    gtag('js',new Date());gtag('config','${gaMeasurementId}');
  </script>
`}
```

Also update the form submission script to fire a GA4 conversion event after successful submit:
```typescript
const formScript = `...existing script...
  // After successful submit, also fire GA4 event
  if(typeof gtag !== 'undefined'){
    gtag('event','form_submit',{page_id:'${page.id}',page_name:'${page.name.replace(/'/g, "\\'")}'});
  }
...`
```

- [ ] **Step 3: Run all tests + tag + push**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
git add app/(dashboard)/layout.tsx app/p/
git commit -m "feat: inject GA4 tracking on dashboard and public pages"
git tag v0.7.0-integrations
git push origin main --tags
```
