# Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Unlayer-powered landing page builder with published pages served at /p/[slug] for iframe embedding and form submissions creating contacts.

**Architecture:** Reuses react-email-editor (Unlayer in web mode) and the full-screen builder pattern from campaigns. Pages stored in landing_pages table. Public /p/[slug] route renders content_html with a form intercept script. Form submissions POST to /api/forms/[slug] which upserts contacts.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, react-email-editor (Unlayer, already installed)

---

## File Map

| File | Role | New/Edit |
|---|---|---|
| `supabase/migrations/007_landing_pages.sql` | landing_pages + page_submissions tables, triggers, RLS | New |
| `lib/landing-pages/types.ts` | TypeScript types | New |
| `lib/landing-pages/queries.ts` | getLandingPages, getLandingPage, getLandingPageBySlug, getRecentSubmissions | New |
| `lib/landing-pages/actions.ts` | createLandingPage, updateLandingPage, deleteLandingPage | New |
| `components/landing-pages/LandingPagesList.tsx` | Pages table with Edit/Embed/Delete actions | New |
| `components/landing-pages/EmbedModal.tsx` | iframe embed code + copy button | New |
| `app/(dashboard)/landing-pages/page.tsx` | Pages list Server Component | New |
| `app/(dashboard)/landing-pages/new/page.tsx` | Creates page + redirect to editor | New |
| `app/(dashboard)/landing-pages/[id]/page.tsx` | Redirect to /[id]/edit | New |
| `app/(dashboard)/landing-pages/[id]/edit/page.tsx` | Builder Server Component shell | New |
| `app/(dashboard)/landing-pages/[id]/edit/PageBuilderClient.tsx` | Unlayer canvas + toolbar | New |
| `app/p/[slug]/page.tsx` | Public page renderer (no auth) | New |
| `app/api/forms/[slug]/route.ts` | POST: upsert contact + insert submission | New |

---

## Task 1: DB Migration

- [ ] Create `supabase/migrations/007_landing_pages.sql`:

```sql
create table public.landing_pages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  slug            text unique not null default gen_random_uuid()::text,
  status          text not null default 'draft'
                  check (status in ('draft','published')),
  content_json    jsonb,
  content_html    text,
  add_to_list_id  uuid references public.lists(id) on delete set null,
  submission_count integer not null default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table public.page_submissions (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references public.landing_pages(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  data            jsonb not null default '{}',
  submitted_at    timestamptz default now()
);

create trigger landing_pages_updated_at
  before update on public.landing_pages
  for each row execute function public.set_updated_at();

create or replace function public.increment_page_submission_count()
returns trigger language plpgsql as $$
begin
  update public.landing_pages set submission_count = submission_count + 1 where id = new.page_id;
  return new;
end;
$$;

create trigger page_submission_count
  after insert on public.page_submissions
  for each row execute function public.increment_page_submission_count();

create index on public.landing_pages(organization_id, status);
create index on public.page_submissions(page_id, submitted_at desc);

alter table public.landing_pages enable row level security;
alter table public.page_submissions enable row level security;

create policy "org members can manage landing pages"
  on public.landing_pages for all
  using (organization_id = public.current_org_id());

create policy "org members can view submissions"
  on public.page_submissions for select
  using (
    exists (select 1 from public.landing_pages
            where id = page_id and organization_id = public.current_org_id())
  );
```

- [ ] Apply in Supabase SQL Editor (Dashboard → SQL Editor → paste and run).
- [ ] `git add supabase/migrations/007_landing_pages.sql && git commit -m "feat: add landing_pages and page_submissions tables (migration 007)"`

---

## Task 2: Types + Queries + Actions

- [ ] Create `lib/landing-pages/types.ts`:

```typescript
export type PageStatus = 'draft' | 'published'

export type LandingPage = {
  id: string
  organization_id: string
  name: string
  slug: string
  status: PageStatus
  content_json: Record<string, unknown> | null
  content_html: string | null
  add_to_list_id: string | null
  submission_count: number
  created_at: string
  updated_at: string
}

export type PageSubmission = {
  id: string
  page_id: string
  contact_id: string | null
  data: Record<string, unknown>
  submitted_at: string
}
```

- [ ] Create `lib/landing-pages/queries.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import type { LandingPage } from './types'

export async function getLandingPages(): Promise<LandingPage[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('landing_pages')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as LandingPage[]
}

export async function getLandingPage(id: string): Promise<LandingPage | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('id', id)
    .single()
  return data as LandingPage | null
}

export async function getLandingPageBySlug(slug: string): Promise<LandingPage | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('slug', slug)
    .single()
  return data as LandingPage | null
}

export async function getRecentSubmissions(
  pageId: string,
  limit = 5
): Promise<Array<{ email: string; submitted_at: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('page_submissions')
    .select('data, submitted_at')
    .eq('page_id', pageId)
    .order('submitted_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r: any) => ({
    email: String(r.data?.email ?? r.data?.Email ?? ''),
    submitted_at: r.submitted_at,
  }))
}
```

- [ ] Create `lib/landing-pages/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PageStatus } from './types'

async function getOrgId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: p } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!p) throw new Error('No profile')
  return p.organization_id as string
}

export async function createLandingPage(name: string): Promise<string> {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const { data, error } = await supabase
    .from('landing_pages')
    .insert({ organization_id: org_id, name })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/landing-pages')
  return data.id
}

export async function updateLandingPage(
  id: string,
  input: {
    name?: string
    status?: PageStatus
    content_json?: Record<string, unknown>
    content_html?: string
    add_to_list_id?: string | null
  }
) {
  const supabase = await createClient()
  const { error } = await supabase.from('landing_pages').update(input).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/landing-pages')
  revalidatePath(`/landing-pages/${id}/edit`)
}

export async function deleteLandingPage(id: string) {
  const supabase = await createClient()
  await supabase.from('landing_pages').delete().eq('id', id)
  revalidatePath('/landing-pages')
}
```

- [ ] `git add lib/landing-pages/ && git commit -m "feat: add landing pages types, queries, and server actions"`

---

## Task 3: LandingPagesList + EmbedModal components

- [ ] Create `components/landing-pages/EmbedModal.tsx`:

```typescript
'use client'
import { useState } from 'react'
import type { LandingPage } from '@/lib/landing-pages/types'

export default function EmbedModal({ page, onClose }: { page: LandingPage; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const host = typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'
  const embedCode = `<iframe\n  src="${host}/p/${page.slug}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border:none;max-width:640px"\n></iframe>`

  function copy() {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Embed: {page.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">iframe embed code</p>
            <pre className="rounded-lg bg-slate-900 p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap font-mono">
              {embedCode}
            </pre>
            <button
              onClick={copy}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {copied ? '✓ Copied!' : 'Copy embed code'}
            </button>
          </div>
          {page.status !== 'published' && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              ⚠️ This page is a draft. Publish it first for the embed to work.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] Create `components/landing-pages/LandingPagesList.tsx`:

```typescript
'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteLandingPage } from '@/lib/landing-pages/actions'
import EmbedModal from './EmbedModal'
import type { LandingPage } from '@/lib/landing-pages/types'

export default function LandingPagesList({ pages }: { pages: LandingPage[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [embedPage, setEmbedPage] = useState<LandingPage | null>(null)

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">📄</div>
        <h3 className="text-sm font-semibold text-slate-900">No landing pages yet</h3>
        <p className="mt-1.5 text-xs text-slate-500">
          Build embeddable lead capture pages with the drag-and-drop editor
        </p>
        <Link
          href="/landing-pages/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
        >
          + Create your first page
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Page</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Submissions</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pages.map(page => (
              <tr key={page.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/landing-pages/${page.id}/edit`}
                    className="font-medium text-slate-900 hover:text-blue-600"
                  >
                    {page.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    page.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {page.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{page.submission_count}</td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(page.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/landing-pages/${page.id}/edit`} className="text-blue-500 hover:underline">
                      Edit
                    </Link>
                    <button onClick={() => setEmbedPage(page)} className="text-slate-500 hover:text-slate-700">
                      Embed
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Delete "${page.name}"?`)) return
                        startTransition(async () => {
                          await deleteLandingPage(page.id)
                          router.refresh()
                        })
                      }}
                      disabled={isPending}
                      className="text-red-400 hover:text-red-600 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {embedPage && <EmbedModal page={embedPage} onClose={() => setEmbedPage(null)} />}
    </>
  )
}
```

- [ ] `git add components/landing-pages/ && git commit -m "feat: add LandingPagesList and EmbedModal components"`

---

## Task 4: PageBuilderClient + dashboard pages

- [ ] Create `app/(dashboard)/landing-pages/[id]/edit/PageBuilderClient.tsx`:

```typescript
'use client'
import { useRef, useState, useCallback, useTransition } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { updateLandingPage } from '@/lib/landing-pages/actions'
import EmbedModal from '@/components/landing-pages/EmbedModal'
import type { LandingPage } from '@/lib/landing-pages/types'
import type { EmailBuilderRef } from '@/components/campaigns/EmailBuilder'

const EmailBuilder = dynamic(() => import('@/components/campaigns/EmailBuilder'), { ssr: false })

export default function PageBuilderClient({ page }: { page: LandingPage }) {
  const builderRef = useRef<EmailBuilderRef>(null)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(page.name)
  const [showEmbed, setShowEmbed] = useState(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  const handleDesignChange = useCallback(() => {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(handleSave, 30_000)
  }, [])

  async function handleSave() {
    if (!builderRef.current) return
    const { design, html } = await builderRef.current.exportHtml()
    startTransition(async () => {
      await updateLandingPage(page.id, { content_json: design, content_html: html })
    })
  }

  async function handleTogglePublish() {
    const newStatus = page.status === 'published' ? 'draft' : 'published'
    startTransition(async () => {
      await updateLandingPage(page.id, { status: newStatus })
    })
  }

  function handleNameBlur() {
    if (name !== page.name && name.trim()) {
      startTransition(async () => {
        await updateLandingPage(page.id, { name: name.trim() })
      })
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden -m-6">
      {/* Toolbar */}
      <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4">
        <Link
          href="/landing-pages"
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 pr-4 border-r border-slate-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Landing Pages
        </Link>
        <input
          className="flex-1 bg-transparent text-sm font-medium text-slate-100 outline-none max-w-xs"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            onClick={handleTogglePublish}
            disabled={isPending}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              page.status === 'published'
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {page.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
          <button
            onClick={() => setShowEmbed(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Get Embed →
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex flex-1 min-h-0">
        <EmailBuilder
          ref={builderRef}
          initialDesign={page.content_json ?? null}
          onDesignChange={handleDesignChange}
        />
      </div>

      {/* Status bar */}
      <div className="flex h-7 flex-shrink-0 items-center gap-6 border-t border-slate-800 bg-slate-900 px-4">
        <span className="text-[10px] text-slate-500">
          Submissions: <span className="text-slate-400">{page.submission_count}</span>
        </span>
        <span className="text-[10px] text-slate-500">
          Status:{' '}
          <span className={page.status === 'published' ? 'text-green-400' : 'text-slate-400'}>
            {page.status}
          </span>
        </span>
      </div>

      {showEmbed && <EmbedModal page={page} onClose={() => setShowEmbed(false)} />}
    </div>
  )
}
```

- [ ] Create `app/(dashboard)/landing-pages/page.tsx`:

```typescript
import Link from 'next/link'
import { getLandingPages } from '@/lib/landing-pages/queries'
import LandingPagesList from '@/components/landing-pages/LandingPagesList'

export default async function LandingPagesPage() {
  const pages = await getLandingPages()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Landing Pages</h1>
          <p className="text-sm text-slate-500">{pages.length} page{pages.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/landing-pages/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Page
        </Link>
      </div>
      <LandingPagesList pages={pages} />
    </div>
  )
}
```

- [ ] Create `app/(dashboard)/landing-pages/new/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createLandingPage } from '@/lib/landing-pages/actions'

export default async function NewLandingPagePage() {
  const id = await createLandingPage('Untitled Page')
  redirect(`/landing-pages/${id}/edit`)
}
```

- [ ] Create `app/(dashboard)/landing-pages/[id]/page.tsx`:

```typescript
import { redirect } from 'next/navigation'

type Props = { params: Promise<{ id: string }> }

export default async function LandingPagePage({ params }: Props) {
  const { id } = await params
  redirect(`/landing-pages/${id}/edit`)
}
```

- [ ] Create `app/(dashboard)/landing-pages/[id]/edit/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { getLandingPage } from '@/lib/landing-pages/queries'
import PageBuilderClient from './PageBuilderClient'

type Props = { params: Promise<{ id: string }> }

export default async function EditLandingPagePage({ params }: Props) {
  const { id } = await params
  const page = await getLandingPage(id)
  if (!page) notFound()

  return <PageBuilderClient page={page} />
}
```

- [ ] `git add app/(dashboard)/landing-pages/ && git commit -m "feat: add landing pages builder UI (list, editor, new page)"`

---

## Task 5: Public page + form submission API

- [ ] Create `app/p/[slug]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { getLandingPageBySlug } from '@/lib/landing-pages/queries'

type Props = { params: Promise<{ slug: string }> }

export default async function PublicLandingPage({ params }: Props) {
  const { slug } = await params
  const page = await getLandingPageBySlug(slug)
  if (!page || page.status !== 'published') notFound()

  const formScript = `
    document.querySelectorAll('form').forEach(function(form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var data = {};
        new FormData(form).forEach(function(v, k) { data[k] = v; });
        var btn = form.querySelector('button[type=submit], input[type=submit]');
        if (btn) btn.disabled = true;
        try {
          await fetch('/api/forms/${slug}', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
          });
          form.innerHTML = '<div style="text-align:center;padding:32px;font-size:18px">✅ Thank you! We\\'ll be in touch.</div>';
        } catch(err) {
          if (btn) btn.disabled = false;
        }
      });
    });
  `

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{page.name}</title>
      </head>
      <body style={{ margin: 0, padding: 0, background: '#f8fafc' }}>
        <div dangerouslySetInnerHTML={{ __html: page.content_html ?? '<p>Page coming soon.</p>' }} />
        <script dangerouslySetInnerHTML={{ __html: formScript }} />
      </body>
    </html>
  )
}
```

- [ ] Create `app/api/forms/[slug]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const data = await request.json().catch(() => ({}))

  const supabase = await createClient()

  const { data: page } = await supabase
    .from('landing_pages')
    .select('id, organization_id, status, add_to_list_id')
    .eq('slug', slug)
    .single()

  if (!page || page.status !== 'published') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const email = String(data.email || data.Email || '').trim().toLowerCase()
  let contact_id: string | null = null

  if (email) {
    const firstName = String(data.first_name || data['First Name'] || data.name || '').trim()
    const lastName = String(data.last_name || data['Last Name'] || '').trim()

    const { data: contact } = await supabase
      .from('contacts')
      .upsert(
        {
          organization_id: page.organization_id,
          email,
          first_name: firstName,
          last_name: lastName,
          status: 'active',
        },
        { onConflict: 'organization_id,email' }
      )
      .select('id')
      .single()

    contact_id = contact?.id ?? null

    if (contact_id && page.add_to_list_id) {
      await supabase
        .from('contact_lists')
        .upsert(
          { contact_id, list_id: page.add_to_list_id },
          { onConflict: 'contact_id,list_id' }
        )
    }
  }

  await supabase.from('page_submissions').insert({
    page_id: page.id,
    contact_id,
    data,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] `npx tsc --noEmit` — fix any TypeScript errors before committing.
- [ ] `git add app/p/ app/api/forms/ && git commit -m "feat: add public landing page renderer and form submission API"`
- [ ] `git tag v0.6.0-landing-pages`

---

## Acceptance Criteria

- [ ] `/landing-pages` list page renders with empty state and "+ New Page" button.
- [ ] Clicking "+ New Page" creates a record and redirects to the Unlayer builder at `/landing-pages/[id]/edit`.
- [ ] "Publish" button toggles `status` between `draft` and `published` with optimistic feedback.
- [ ] "Get Embed →" opens EmbedModal with a pre-filled iframe snippet and working copy button.
- [ ] Published page at `/p/[slug]` renders without dashboard chrome (no sidebar/header).
- [ ] Draft pages at `/p/[slug]` return 404.
- [ ] Submitting a form on a published page creates/updates a contact in the org and inserts a `page_submissions` row.
- [ ] `submission_count` on the landing page increments after each form submit (trigger fires).
- [ ] `npx tsc --noEmit` passes with zero errors.
