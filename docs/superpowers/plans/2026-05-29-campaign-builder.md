# Campaign Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build full campaign creation — setup form, full-screen Unlayer drag-and-drop email builder, Brevo API sending, send now/schedule, and campaigns list page.

**Architecture:** Unlayer (`react-email-editor`) provides the canvas engine loaded via Next.js `dynamic()` (no SSR). Server Actions handle CRUD and Brevo sending. The builder page is full-screen, bypassing the dashboard shell padding. Brevo REST API called directly via `fetch` for simplicity.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, react-email-editor (Unlayer), Brevo REST API, Tailwind CSS, shadcn/ui

---

## File Map

| File | Responsibility |
|---|---|
| `lib/campaigns/types.ts` | Shared TypeScript types for all campaign entities |
| `lib/campaigns/queries.ts` | Server-side Supabase read helpers |
| `lib/campaigns/actions.ts` | Server Actions: create, update, send, schedule campaigns |
| `lib/campaigns/brevo.ts` | Brevo REST API wrapper + merge tag replacer |
| `supabase/migrations/003_campaigns.sql` | Schema, triggers, indexes, RLS |
| `components/campaigns/CampaignsList.tsx` | Table with status badges and actions |
| `components/campaigns/CampaignSetupForm.tsx` | New campaign setup form |
| `components/campaigns/BuilderToolbar.tsx` | Dark full-screen toolbar (save, next, toggle) |
| `components/campaigns/EmailBuilder.tsx` | Unlayer canvas wrapper (client-only, no SSR) |
| `components/campaigns/SendModal.tsx` | Recipients + schedule + summary + send |
| `app/(dashboard)/campaigns/page.tsx` | Campaigns list Server Component |
| `app/(dashboard)/campaigns/new/page.tsx` | Setup form page |
| `app/(dashboard)/campaigns/[id]/page.tsx` | Redirect to `/[id]/edit` |
| `app/(dashboard)/campaigns/[id]/edit/page.tsx` | Builder Server Component shell |
| `app/(dashboard)/campaigns/[id]/edit/BuilderClient.tsx` | Full-screen builder Client Component |
| `app/api/cron/send-scheduled/route.ts` | Cron endpoint for scheduled campaigns |
| `vercel.json` | Vercel Cron config: every 5 minutes |

---

## Task 1: Dependencies + Shared Types

**Files:**
- Modify: `package.json`
- Create: `lib/campaigns/types.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/poledilip/email-marketing-saas
npm install react-email-editor
```

No SDK needed — Brevo API is called via `fetch` directly.

- [ ] **Step 2: Create shared types**

Create `lib/campaigns/types.ts`:
```typescript
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
export type CampaignSendStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed'

export type Campaign = {
  id: string
  organization_id: string
  name: string
  subject: string
  preview_text: string | null
  from_name: string
  from_email: string
  status: CampaignStatus
  content_json: Record<string, unknown> | null
  content_html: string | null
  recipient_list_ids: string[]
  recipient_count: number
  scheduled_at: string | null
  sent_at: string | null
  brevo_campaign_ref: string | null
  created_at: string
  updated_at: string
}

export type CampaignSend = {
  id: string
  campaign_id: string
  contact_id: string
  status: CampaignSendStatus
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  brevo_message_id: string | null
}

export type EmailTemplate = {
  id: string
  organization_id: string
  name: string
  thumbnail_url: string | null
  content_json: Record<string, unknown> | null
  content_html: string | null
  created_at: string
}

export type SendResult = {
  sent: number
  queued: number
}
```

- [ ] **Step 3: Add BREVO_API_KEY to .env.local**

Open `/Users/poledilip/email-marketing-saas/.env.local` and add:
```
BREVO_API_KEY=your-brevo-api-key
```

Get your key from: Brevo dashboard → SMTP & API → API Keys → Generate new key.

- [ ] **Step 4: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add package.json package-lock.json lib/campaigns/types.ts .env.local
git commit -m "feat: add campaign deps and shared types"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/003_campaigns.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/003_campaigns.sql`:
```sql
-- campaigns
create table public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  subject             text not null default '',
  preview_text        text,
  from_name           text not null default '',
  from_email          text not null default '',
  status              text not null default 'draft'
                      check (status in ('draft','scheduled','sending','sent','failed')),
  content_json        jsonb,
  content_html        text,
  recipient_list_ids  uuid[] not null default '{}',
  recipient_count     integer not null default 0,
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  brevo_campaign_ref  text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- campaign_sends
create table public.campaign_sends (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  status            text not null default 'queued'
                    check (status in ('queued','sent','delivered','opened','clicked','bounced','unsubscribed')),
  sent_at           timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  brevo_message_id  text,
  unique (campaign_id, contact_id)
);

-- email_templates
create table public.email_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  thumbnail_url   text,
  content_json    jsonb,
  content_html    text,
  created_at      timestamptz default now()
);

-- updated_at trigger (set_updated_at already defined in 002_contacts.sql)
create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- indexes
create index on public.campaigns(organization_id, status);
create index on public.campaigns(organization_id, created_at desc);
create index on public.campaign_sends(campaign_id, status);

-- RLS
alter table public.campaigns enable row level security;
alter table public.campaign_sends enable row level security;
alter table public.email_templates enable row level security;

create policy "org members can manage campaigns"
  on public.campaigns for all
  using (organization_id = public.current_org_id());

create policy "org members can manage campaign_sends"
  on public.campaign_sends for all
  using (
    exists (select 1 from public.campaigns
            where id = campaign_id and organization_id = public.current_org_id())
  );

create policy "org members can manage email_templates"
  on public.email_templates for all
  using (organization_id = public.current_org_id());
```

- [ ] **Step 2: Apply in Supabase dashboard**

Go to Supabase → SQL Editor → paste the full `003_campaigns.sql` → Run.

Verify: `campaigns`, `campaign_sends`, `email_templates` tables appear in Table Editor.

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add supabase/migrations/003_campaigns.sql
git commit -m "feat: add campaigns schema, indexes, RLS"
```

---

## Task 3: Brevo Wrapper + Merge Tags (TDD)

**Files:**
- Create: `lib/campaigns/brevo.ts`
- Create: `lib/campaigns/__tests__/brevo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/campaigns/__tests__/brevo.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { replaceMergeTags } from '../brevo'

describe('replaceMergeTags', () => {
  it('replaces first_name', () => {
    expect(replaceMergeTags('Hello {{first_name}}', {
      first_name: 'Rahul', last_name: 'Sharma', email: 'r@test.com', company: null
    })).toBe('Hello Rahul')
  })

  it('replaces all merge tags', () => {
    const html = '{{first_name}} {{last_name}} {{email}} {{company}}'
    expect(replaceMergeTags(html, {
      first_name: 'Alice', last_name: 'Smith', email: 'a@test.com', company: 'Acme'
    })).toBe('Alice Smith a@test.com Acme')
  })

  it('replaces null company with empty string', () => {
    expect(replaceMergeTags('Co: {{company}}', {
      first_name: '', last_name: '', email: 'a@test.com', company: null
    })).toBe('Co: ')
  })

  it('replaces all occurrences (global replace)', () => {
    expect(replaceMergeTags('{{first_name}} and {{first_name}}', {
      first_name: 'Bob', last_name: '', email: 'b@test.com', company: null
    })).toBe('Bob and Bob')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/campaigns/__tests__/brevo.test.ts
```
Expected: FAIL — `brevo` module not found

- [ ] **Step 3: Create brevo.ts**

Create `lib/campaigns/brevo.ts`:
```typescript
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

export async function sendTransactionalEmail(params: {
  to: { email: string; name: string }
  subject: string
  htmlContent: string
  fromName: string
  fromEmail: string
}): Promise<string> {
  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: params.fromName, email: params.fromEmail },
      to: [{ email: params.to.email, name: params.to.name }],
      subject: params.subject,
      htmlContent: params.htmlContent,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message ?? `Brevo API error: ${response.status}`)
  }

  const data = await response.json()
  return (data.messageId as string) ?? ''
}

export function replaceMergeTags(
  html: string,
  contact: { first_name: string; last_name: string; email: string; company: string | null }
): string {
  return html
    .replace(/\{\{first_name\}\}/g, contact.first_name || '')
    .replace(/\{\{last_name\}\}/g, contact.last_name || '')
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{company\}\}/g, contact.company || '')
}

export async function countTodaySends(orgId: string, supabase: any): Promise<number> {
  const todayMidnight = new Date()
  todayMidnight.setUTCHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('campaign_sends')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', todayMidnight.toISOString())
    .not('sent_at', 'is', null)
    .in('campaign_id',
      supabase.from('campaigns').select('id').eq('organization_id', orgId)
    )

  return count ?? 0
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/campaigns/__tests__/brevo.test.ts
```
Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/campaigns/brevo.ts lib/campaigns/__tests__/brevo.test.ts
git commit -m "feat: add Brevo wrapper and merge tag helpers"
```

---

## Task 4: Campaign Queries

**Files:**
- Create: `lib/campaigns/queries.ts`

- [ ] **Step 1: Create queries.ts**

Create `lib/campaigns/queries.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import type { Campaign, CampaignSend } from './types'

export async function getCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as Campaign[]
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()
  return data as Campaign | null
}

export async function getCampaignSendStats(campaignId: string): Promise<{
  total: number
  sent: number
  queued: number
}> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaign_sends')
    .select('status')
    .eq('campaign_id', campaignId)

  const rows = data ?? []
  return {
    total: rows.length,
    sent: rows.filter((r: any) => r.status !== 'queued').length,
    queued: rows.filter((r: any) => r.status === 'queued').length,
  }
}

export async function getDueScheduledCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
  return (data ?? []) as Campaign[]
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/campaigns/queries.ts
git commit -m "feat: add campaign queries"
```

---

## Task 5: Campaign Actions

**Files:**
- Create: `lib/campaigns/actions.ts`

- [ ] **Step 1: Create actions.ts**

Create `lib/campaigns/actions.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendTransactionalEmail, replaceMergeTags, countTodaySends } from './brevo'
import type { CampaignStatus, SendResult } from './types'

const DAILY_SEND_LIMIT = 300

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile) throw new Error('Profile not found')
  return profile.organization_id
}

export async function createCampaign(input: {
  name: string
  subject: string
  preview_text?: string
  from_name: string
  from_email: string
}): Promise<string> {
  const supabase = await createClient()
  const org_id = await getOrgId()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      organization_id: org_id,
      name: input.name,
      subject: input.subject,
      preview_text: input.preview_text ?? null,
      from_name: input.from_name,
      from_email: input.from_email,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/campaigns')
  return data.id
}

export async function updateCampaign(id: string, input: {
  name?: string
  subject?: string
  preview_text?: string | null
  from_name?: string
  from_email?: string
  content_json?: Record<string, unknown>
  content_html?: string
  recipient_list_ids?: string[]
  status?: CampaignStatus
  scheduled_at?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaigns')
    .update(input)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/campaigns')
  revalidatePath(`/campaigns/${id}/edit`)
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient()
  await supabase.from('campaigns').delete().eq('id', id)
  revalidatePath('/campaigns')
}

export async function sendCampaign(
  campaignId: string,
  listIds: string[]
): Promise<SendResult> {
  const supabase = await createClient()
  const org_id = await getOrgId()

  // Fetch campaign
  const { data: campaign } = await supabase
    .from('campaigns').select('*').eq('id', campaignId).single()
  if (!campaign) throw new Error('Campaign not found')
  if (!campaign.content_html) throw new Error('Campaign has no email content')
  if (!['draft', 'scheduled'].includes(campaign.status)) {
    throw new Error(`Cannot send campaign with status: ${campaign.status}`)
  }

  // Fetch active contacts from selected lists (deduplicated)
  const { data: contactListRows } = await supabase
    .from('contact_lists')
    .select('contact_id')
    .in('list_id', listIds)

  const contactIds = [...new Set((contactListRows ?? []).map((r: any) => r.contact_id))]

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company')
    .in('id', contactIds)
    .eq('status', 'active')

  const activeContacts = contacts ?? []

  // Check daily limit
  const todaySent = await countTodaySends(org_id, supabase)
  const remaining = Math.max(0, DAILY_SEND_LIMIT - todaySent)
  const toSendNow = activeContacts.slice(0, remaining)
  const toQueue = activeContacts.slice(remaining)

  // Update campaign to sending
  await supabase.from('campaigns').update({
    status: 'sending',
    recipient_list_ids: listIds,
    recipient_count: activeContacts.length,
  }).eq('id', campaignId)

  // Send emails
  let sent = 0
  for (const contact of toSendNow) {
    try {
      const personalizedHtml = replaceMergeTags(campaign.content_html, {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        company: contact.company,
      })
      const messageId = await sendTransactionalEmail({
        to: { email: contact.email, name: `${contact.first_name} ${contact.last_name}`.trim() || contact.email },
        subject: campaign.subject,
        htmlContent: personalizedHtml,
        fromName: campaign.from_name,
        fromEmail: campaign.from_email,
      })
      await supabase.from('campaign_sends').upsert({
        campaign_id: campaignId,
        contact_id: contact.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        brevo_message_id: messageId,
      }, { onConflict: 'campaign_id,contact_id' })
      sent++
    } catch {
      // Individual send failures don't abort the batch
    }
  }

  // Queue remaining contacts
  if (toQueue.length) {
    await supabase.from('campaign_sends').upsert(
      toQueue.map((c: any) => ({
        campaign_id: campaignId,
        contact_id: c.id,
        status: 'queued',
      })),
      { onConflict: 'campaign_id,contact_id' }
    )
  }

  // Mark campaign sent
  await supabase.from('campaigns').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', campaignId)

  revalidatePath('/campaigns')
  return { sent, queued: toQueue.length }
}

export async function scheduleCampaign(
  campaignId: string,
  listIds: string[],
  scheduledAt: string
) {
  const supabase = await createClient()

  await supabase.from('campaigns').update({
    status: 'scheduled',
    recipient_list_ids: listIds,
    scheduled_at: scheduledAt,
  }).eq('id', campaignId)

  revalidatePath('/campaigns')
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/campaigns/actions.ts
git commit -m "feat: add campaign server actions"
```

---

## Task 6: CampaignsList Component

**Files:**
- Create: `components/campaigns/CampaignsList.tsx`
- Create: `components/campaigns/__tests__/CampaignsList.test.tsx`

- [ ] **Step 1: Write failing test**

Create `components/campaigns/__tests__/CampaignsList.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CampaignsList from '../CampaignsList'
import type { Campaign } from '@/lib/campaigns/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const campaigns: Campaign[] = [
  {
    id: '1', organization_id: 'org', name: 'Summer Sale',
    subject: 'Big deals inside', preview_text: null,
    from_name: 'HiringHood', from_email: 'hello@hiringhood.com',
    status: 'sent', content_json: null, content_html: null,
    recipient_list_ids: [], recipient_count: 500,
    scheduled_at: null, sent_at: '2026-05-28T10:00:00Z',
    brevo_campaign_ref: null, created_at: '2026-05-20T00:00:00Z',
    updated_at: '2026-05-28T10:00:00Z',
  },
  {
    id: '2', organization_id: 'org', name: 'Product Launch',
    subject: 'New product!', preview_text: null,
    from_name: 'HiringHood', from_email: 'hello@hiringhood.com',
    status: 'draft', content_json: null, content_html: null,
    recipient_list_ids: [], recipient_count: 0,
    scheduled_at: null, sent_at: null,
    brevo_campaign_ref: null, created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
  },
]

describe('CampaignsList', () => {
  it('renders campaign names', () => {
    render(<CampaignsList campaigns={campaigns} />)
    expect(screen.getByText('Summer Sale')).toBeInTheDocument()
    expect(screen.getByText('Product Launch')).toBeInTheDocument()
  })

  it('renders status badges', () => {
    render(<CampaignsList campaigns={campaigns} />)
    expect(screen.getByText('sent')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  it('renders empty state when no campaigns', () => {
    render(<CampaignsList campaigns={[]} />)
    expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/campaigns/__tests__/CampaignsList.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create CampaignsList**

Create `components/campaigns/CampaignsList.tsx`:
```typescript
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCampaign } from '@/lib/campaigns/actions'
import type { Campaign, CampaignStatus } from '@/lib/campaigns/types'

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-amber-100 text-amber-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export default function CampaignsList({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteCampaign(id)
      router.refresh()
    })
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
          <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">No campaigns yet</h3>
        <p className="mt-1.5 text-xs text-slate-500">Create your first email campaign to start reaching your contacts</p>
        <Link
          href="/campaigns/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
        >
          + Create your first campaign
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Campaign</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Recipients</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Open rate</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Date</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(campaign => (
            <tr key={campaign.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link
                  href={`/campaigns/${campaign.id}/edit`}
                  className="font-medium text-slate-900 hover:text-blue-600"
                >
                  {campaign.name}
                </Link>
                <p className="mt-0.5 text-slate-400 truncate max-w-xs">{campaign.subject}</p>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[campaign.status]}`}>
                  {campaign.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {campaign.recipient_count > 0 ? campaign.recipient_count.toLocaleString() : '—'}
              </td>
              <td className="px-4 py-3 text-slate-400">—</td>
              <td className="px-4 py-3 text-slate-400">
                {campaign.sent_at
                  ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/campaigns/${campaign.id}/edit`} className="text-blue-500 hover:underline">
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(campaign.id, campaign.name)}
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
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/campaigns/__tests__/CampaignsList.test.tsx
```
Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/campaigns/CampaignsList.tsx components/campaigns/__tests__/CampaignsList.test.tsx
git commit -m "feat: add CampaignsList component"
```

---

## Task 7: CampaignSetupForm

**Files:**
- Create: `components/campaigns/CampaignSetupForm.tsx`
- Create: `components/campaigns/__tests__/CampaignSetupForm.test.tsx`

- [ ] **Step 1: Write failing test**

Create `components/campaigns/__tests__/CampaignSetupForm.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CampaignSetupForm from '../CampaignSetupForm'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('CampaignSetupForm', () => {
  it('renders required fields', () => {
    render(<CampaignSetupForm />)
    expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/subject line/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/from name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/from email/i)).toBeInTheDocument()
  })

  it('renders continue button', () => {
    render(<CampaignSetupForm />)
    expect(screen.getByRole('button', { name: /continue to builder/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/campaigns/__tests__/CampaignSetupForm.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create CampaignSetupForm**

Create `components/campaigns/CampaignSetupForm.tsx`:
```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCampaign } from '@/lib/campaigns/actions'

export default function CampaignSetupForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const id = await createCampaign({
          name,
          subject,
          preview_text: previewText || undefined,
          from_name: fromName,
          from_email: fromEmail,
        })
        router.push(`/campaigns/${id}/edit`)
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Create Campaign</h1>
        <p className="mt-1 text-sm text-slate-500">Fill in the basics before designing your email</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-1.5">
          <Label htmlFor="name">Campaign name (internal) *</Label>
          <Input
            id="name"
            placeholder="e.g. Summer Sale 2026"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <p className="text-xs text-slate-400">Only visible to you — not shown to recipients</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject line *</Label>
          <Input
            id="subject"
            placeholder="e.g. Summer Sale is HERE 🔥"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="previewText">Preview text</Label>
          <Input
            id="previewText"
            placeholder="Short summary shown in inbox preview..."
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fromName">From name *</Label>
            <Input
              id="fromName"
              placeholder="Your name or brand"
              value={fromName}
              onChange={e => setFromName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fromEmail">From email *</Label>
            <Input
              id="fromEmail"
              type="email"
              placeholder="hello@yourdomain.com"
              value={fromEmail}
              onChange={e => setFromEmail(e.target.value)}
              required
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Creating...' : 'Continue to Builder →'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/campaigns/__tests__/CampaignSetupForm.test.tsx
```
Expected: PASS — 2 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/campaigns/CampaignSetupForm.tsx components/campaigns/__tests__/CampaignSetupForm.test.tsx
git commit -m "feat: add CampaignSetupForm"
```

---

## Task 8: BuilderToolbar

**Files:**
- Create: `components/campaigns/BuilderToolbar.tsx`

- [ ] **Step 1: Create BuilderToolbar**

Create `components/campaigns/BuilderToolbar.tsx`:
```typescript
'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { updateCampaign } from '@/lib/campaigns/actions'
import type { Campaign } from '@/lib/campaigns/types'

type Props = {
  campaign: Campaign
  lastSaved: Date | null
  isSaving: boolean
  onSave: () => void
  onNext: () => void
}

export default function BuilderToolbar({ campaign, lastSaved, isSaving, onSave, onNext }: Props) {
  const [name, setName] = useState(campaign.name)
  const [, startTransition] = useTransition()

  function handleNameBlur() {
    if (name === campaign.name || !name.trim()) return
    startTransition(async () => {
      await updateCampaign(campaign.id, { name: name.trim() })
    })
  }

  const savedLabel = isSaving
    ? 'Saving...'
    : lastSaved
    ? `Saved ${Math.round((Date.now() - lastSaved.getTime()) / 60000)} min ago`
    : 'Unsaved changes'

  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4">
      <Link
        href="/campaigns"
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 pr-4 border-r border-slate-700"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Campaigns
      </Link>

      <div className="flex-1">
        <input
          className="bg-transparent text-sm font-medium text-slate-100 outline-none placeholder:text-slate-500 w-full max-w-xs"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Campaign name..."
        />
        <p className="text-[10px] text-slate-500 mt-0.5">
          {campaign.status === 'draft' ? 'Draft' : campaign.status} · {savedLabel}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={onNext}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          Next: Recipients →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/campaigns/BuilderToolbar.tsx
git commit -m "feat: add BuilderToolbar"
```

---

## Task 9: EmailBuilder (Unlayer Canvas)

**Files:**
- Create: `components/campaigns/EmailBuilder.tsx`

- [ ] **Step 1: Create EmailBuilder**

Create `components/campaigns/EmailBuilder.tsx`:
```typescript
'use client'

import { useRef, forwardRef, useImperativeHandle } from 'react'
import dynamic from 'next/dynamic'

// Load Unlayer only in browser — it uses window APIs
const EmailEditor = dynamic(
  () => import('react-email-editor').then(m => m.default),
  { ssr: false, loading: () => (
    <div className="flex flex-1 items-center justify-center bg-slate-700">
      <div className="text-sm text-slate-400">Loading editor...</div>
    </div>
  )}
)

export type EmailBuilderRef = {
  exportHtml: () => Promise<{ design: Record<string, unknown>; html: string }>
  loadDesign: (design: Record<string, unknown>) => void
}

type Props = {
  initialDesign?: Record<string, unknown> | null
  onDesignChange?: () => void
}

const EmailBuilder = forwardRef<EmailBuilderRef, Props>(
  ({ initialDesign, onDesignChange }, ref) => {
    const editorRef = useRef<any>(null)

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
    }

    return (
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
    )
  }
)

EmailBuilder.displayName = 'EmailBuilder'
export default EmailBuilder
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/campaigns/EmailBuilder.tsx
git commit -m "feat: add Unlayer EmailBuilder wrapper"
```

---

## Task 10: SendModal

**Files:**
- Create: `components/campaigns/SendModal.tsx`

- [ ] **Step 1: Create SendModal**

Create `components/campaigns/SendModal.tsx`:
```typescript
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { sendCampaign, scheduleCampaign } from '@/lib/campaigns/actions'
import type { Campaign } from '@/lib/campaigns/types'
import type { List } from '@/lib/contacts/types'

type Props = {
  open: boolean
  campaign: Campaign
  lists: List[]
  onClose: () => void
  onSent: (result: { sent: number; queued: number }) => void
}

export default function SendModal({ open, campaign, lists, onClose, onSent }: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedLists, setSelectedLists] = useState<string[]>(campaign.recipient_list_ids)
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const estimatedCount = lists
    .filter(l => selectedLists.includes(l.id))
    .reduce((sum, l) => sum + l.contact_count, 0)

  function toggleList(id: string) {
    setSelectedLists(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function handleSend() {
    if (selectedLists.length === 0) {
      setError('Select at least one list to send to')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        if (sendMode === 'now') {
          const result = await sendCampaign(campaign.id, selectedLists)
          onSent(result)
        } else {
          if (!scheduledAt) { setError('Pick a date and time'); return }
          await scheduleCampaign(campaign.id, selectedLists, new Date(scheduledAt).toISOString())
          onSent({ sent: 0, queued: estimatedCount })
        }
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Send Campaign</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Recipients */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">Send to *</p>
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 p-3 min-h-10">
              {lists.map(list => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => toggleList(list.id)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    selectedLists.includes(list.id)
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {list.name} ({list.contact_count})
                </button>
              ))}
              {lists.length === 0 && (
                <span className="text-xs text-slate-400">No lists — create one in Contacts first</span>
              )}
            </div>
            {estimatedCount > 0 && (
              <p className="mt-1.5 text-xs text-slate-500">~{estimatedCount.toLocaleString()} contacts · active only</p>
            )}
          </div>

          {/* When to send */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">When to send</p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3">
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${sendMode === 'now' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                  {sendMode === 'now' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm text-slate-700">Send immediately</span>
                <input type="radio" className="hidden" checked={sendMode === 'now'} onChange={() => setSendMode('now')} />
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${sendMode === 'schedule' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                  {sendMode === 'schedule' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm text-slate-700">Schedule for later</span>
                <input type="radio" className="hidden" checked={sendMode === 'schedule'} onChange={() => setSendMode('schedule')} />
              </label>
              {sendMode === 'schedule' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="ml-7 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                />
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Summary</p>
            {[
              ['Subject', campaign.subject],
              ['From', `${campaign.from_name} <${campaign.from_email}>`],
              ['Recipients', `~${estimatedCount.toLocaleString()} contacts`],
              ['Sending', sendMode === 'now' ? 'Immediately' : scheduledAt ? new Date(scheduledAt).toLocaleString() : 'Scheduled'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-700 text-right max-w-[200px] truncate">{value}</span>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              ← Edit Email
            </Button>
            <Button
              onClick={handleSend}
              disabled={isPending || selectedLists.length === 0}
              className="flex-1"
            >
              {isPending ? 'Sending...' : sendMode === 'now' ? '🚀 Send Now' : '📅 Schedule'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/campaigns/SendModal.tsx
git commit -m "feat: add SendModal"
```

---

## Task 11: BuilderClient + Builder Page

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/edit/BuilderClient.tsx`
- Create: `app/(dashboard)/campaigns/[id]/edit/page.tsx`
- Create: `app/(dashboard)/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create BuilderClient**

Create `app/(dashboard)/campaigns/[id]/edit/BuilderClient.tsx`:
```typescript
'use client'

import { useRef, useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import BuilderToolbar from '@/components/campaigns/BuilderToolbar'
import SendModal from '@/components/campaigns/SendModal'
import { updateCampaign } from '@/lib/campaigns/actions'
import type { Campaign } from '@/lib/campaigns/types'
import type { List } from '@/lib/contacts/types'
import type { EmailBuilderRef } from '@/components/campaigns/EmailBuilder'
import dynamic from 'next/dynamic'

const EmailBuilder = dynamic(
  () => import('@/components/campaigns/EmailBuilder'),
  { ssr: false }
)

type Props = {
  campaign: Campaign
  lists: List[]
}

export default function BuilderClient({ campaign, lists }: Props) {
  const router = useRouter()
  const builderRef = useRef<EmailBuilderRef>(null)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  const handleDesignChange = useCallback(() => {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(handleSave, 30_000)
  }, [])

  async function handleSave() {
    if (!builderRef.current) return
    const { design, html } = await builderRef.current.exportHtml()
    startTransition(async () => {
      await updateCampaign(campaign.id, {
        content_json: design,
        content_html: html,
      })
      setLastSaved(new Date())
    })
  }

  function handleSent(result: { sent: number; queued: number }) {
    setSendModalOpen(false)
    const msg = result.queued > 0
      ? `Sent to ${result.sent} contacts. ${result.queued} queued (daily limit).`
      : `Successfully sent to ${result.sent} contacts!`
    alert(msg)
    router.push('/campaigns')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden -m-6">
      <BuilderToolbar
        campaign={campaign}
        lastSaved={lastSaved}
        isSaving={isPending}
        onSave={handleSave}
        onNext={() => setSendModalOpen(true)}
      />

      <div className="flex flex-1 min-h-0">
        <EmailBuilder
          ref={builderRef}
          initialDesign={campaign.content_json ?? null}
          onDesignChange={handleDesignChange}
        />
      </div>

      <div className="flex h-7 flex-shrink-0 items-center gap-6 border-t border-slate-800 bg-slate-900 px-4">
        <span className="text-[10px] text-slate-500">
          Subject: <span className="text-slate-400">{campaign.subject}</span>
        </span>
        <span className="text-[10px] text-slate-500">
          From: <span className="text-slate-400">{campaign.from_name} &lt;{campaign.from_email}&gt;</span>
        </span>
      </div>

      <SendModal
        open={sendModalOpen}
        campaign={campaign}
        lists={lists}
        onClose={() => setSendModalOpen(false)}
        onSent={handleSent}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create builder page**

Create `app/(dashboard)/campaigns/[id]/edit/page.tsx`:
```typescript
import { notFound } from 'next/navigation'
import { getCampaign } from '@/lib/campaigns/queries'
import { getLists } from '@/lib/contacts/queries'
import BuilderClient from './BuilderClient'

type Props = { params: Promise<{ id: string }> }

export default async function BuilderPage({ params }: Props) {
  const { id } = await params
  const [campaign, lists] = await Promise.all([getCampaign(id), getLists()])
  if (!campaign) notFound()
  return <BuilderClient campaign={campaign} lists={lists} />
}
```

- [ ] **Step 3: Create [id] redirect page**

Create `app/(dashboard)/campaigns/[id]/page.tsx`:
```typescript
import { redirect } from 'next/navigation'

type Props = { params: Promise<{ id: string }> }

export default async function CampaignRedirectPage({ params }: Props) {
  const { id } = await params
  redirect(`/campaigns/${id}/edit`)
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/(dashboard)/campaigns/[id]/
git commit -m "feat: add full-screen builder page"
```

---

## Task 12: Campaigns List Page + New Campaign Page

**Files:**
- Modify: `app/(dashboard)/campaigns/page.tsx`
- Create: `app/(dashboard)/campaigns/new/page.tsx`

- [ ] **Step 1: Replace campaigns placeholder page**

Replace `app/(dashboard)/campaigns/page.tsx`:
```typescript
import Link from 'next/link'
import { getCampaigns } from '@/lib/campaigns/queries'
import CampaignsList from '@/components/campaigns/CampaignsList'

export default async function CampaignsPage() {
  const campaigns = await getCampaigns()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500">{campaigns.length} campaigns</p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Campaign
        </Link>
      </div>
      <CampaignsList campaigns={campaigns} />
    </div>
  )
}
```

- [ ] **Step 2: Create new campaign page**

Create `app/(dashboard)/campaigns/new/page.tsx`:
```typescript
import CampaignSetupForm from '@/components/campaigns/CampaignSetupForm'

export default function NewCampaignPage() {
  return (
    <div className="py-6">
      <CampaignSetupForm />
    </div>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/(dashboard)/campaigns/
git commit -m "feat: add campaigns list and new campaign pages"
```

---

## Task 13: Cron Route + Vercel Config

**Files:**
- Create: `app/api/cron/send-scheduled/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create cron route**

Create `app/api/cron/send-scheduled/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { getDueScheduledCampaigns } from '@/lib/campaigns/queries'
import { sendCampaign } from '@/lib/campaigns/actions'

export async function GET(request: Request) {
  // Verify this is called by Vercel Cron (optional auth header)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dueCampaigns = await getDueScheduledCampaigns()

  const results = await Promise.allSettled(
    dueCampaigns.map(async (campaign) => {
      const result = await sendCampaign(campaign.id, campaign.recipient_list_ids)
      return { id: campaign.id, name: campaign.name, ...result }
    })
  )

  const summary = results.map((r, i) => ({
    campaign: dueCampaigns[i]?.name,
    status: r.status,
    result: r.status === 'fulfilled' ? r.value : (r as any).reason?.message,
  }))

  return NextResponse.json({ processed: dueCampaigns.length, summary })
}
```

- [ ] **Step 2: Create vercel.json**

Create `vercel.json` at project root:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-scheduled",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Add CRON_SECRET to .env.local (optional security)**

Add to `.env.local`:
```
CRON_SECRET=your-random-secret-string
```

- [ ] **Step 4: Run all tests + final tag**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 5: Commit + tag**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/api/cron/ vercel.json
git commit -m "feat: add scheduled send cron route"
git tag v0.3.0-campaigns
```

---

## Final Verification

- [ ] **Start dev server and test manually**

```bash
cd /Users/poledilip/email-marketing-saas
npm run dev
```

Test these paths:

1. `/campaigns` — shows empty state with "Create your first campaign" CTA
2. Click "+ New Campaign" → `/campaigns/new` — fill form → "Continue to Builder"
3. Builder opens full-screen — Unlayer canvas loads, toolbar shows campaign name
4. Design an email in the canvas using blocks
5. Click "Save draft" — toast/status updates to "Saved just now"
6. Click "Next: Recipients →" — SendModal opens
7. Select a list → estimated count shows
8. Select "Schedule for later" → datetime picker appears
9. Click "Send Now" → campaign sends via Brevo, redirects to `/campaigns`
10. `/campaigns` — shows campaign with `sent` status badge and recipient count
