# Campaign Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Brevo webhook tracking (open/click/bounce/delivery events), a `campaign_stats` SQL view, and a split-view `/analytics` page with KPI cards, opens-over-time chart, contact activity table, and link breakdown table.

**Architecture:** Brevo POSTs to `/api/webhooks/brevo` which updates `campaign_sends` rows. The `/analytics` page is a Server Component fetching from a `campaign_stats` view; clicking a campaign loads detail data via URL param. No new tables — just one new column (`link_url`) and a SQL view.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, recharts (bar chart)

---

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/004_analytics.sql` | Add `link_url` column + `campaign_stats` view |
| `lib/campaigns/brevo.ts` (modify) | Add `trackOpens`, `trackClicks`, `tags` to send body |
| `lib/analytics/queries.ts` | getCampaignsWithStats, getContactActivity, getLinkBreakdown, getOpensOverTime |
| `app/api/webhooks/brevo/route.ts` | POST handler: update campaign_sends on Brevo events |
| `components/analytics/OpensChart.tsx` | recharts BarChart: opens bucketed by time since send |
| `components/analytics/ContactActivityTab.tsx` | Table: per-contact delivery/open/click timestamps |
| `components/analytics/LinkBreakdownTab.tsx` | Table: link URL + click count |
| `components/analytics/CampaignStatsList.tsx` | Left panel: sent campaigns with open/click rates |
| `components/analytics/CampaignStatsPanel.tsx` | Right panel: KPIs + chart + tabs |
| `app/(dashboard)/analytics/AnalyticsClient.tsx` | Client: manages selected campaign, renders split view |
| `app/(dashboard)/analytics/page.tsx` | Server Component: fetches campaigns+stats, passes to client |

---

## Task 1: Install recharts + DB Migration

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/004_analytics.sql`

- [ ] **Step 1: Install recharts**

```bash
cd /Users/poledilip/email-marketing-saas
npm install recharts
```

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/004_analytics.sql`:
```sql
-- Add link_url to campaign_sends for click tracking
alter table public.campaign_sends
  add column if not exists link_url text;

-- Aggregate view for fast stats per campaign
create or replace view public.campaign_stats as
select
  campaign_id,
  count(*) filter (where status != 'queued')                          as total_sent,
  count(*) filter (where status in ('delivered','opened','clicked'))  as delivered,
  count(*) filter (where status in ('opened','clicked'))              as opened,
  count(*) filter (where status = 'clicked')                          as clicked,
  count(*) filter (where status = 'bounced')                          as bounced,
  count(*) filter (where status = 'unsubscribed')                     as unsubscribed
from public.campaign_sends
group by campaign_id;
```

- [ ] **Step 3: Apply in Supabase dashboard**

Supabase → SQL Editor → paste `004_analytics.sql` → Run.

Verify: `campaign_sends` table has `link_url` column. `campaign_stats` view exists.

- [ ] **Step 4: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add package.json package-lock.json supabase/migrations/004_analytics.sql
git commit -m "feat: add analytics deps and DB migration"
```

---

## Task 2: Enable Brevo Tracking in Send API

**Files:**
- Modify: `lib/campaigns/brevo.ts`

- [ ] **Step 1: Update sendTransactionalEmail to include tracking params**

In `lib/campaigns/brevo.ts`, find the `body: JSON.stringify({...})` block inside `sendTransactionalEmail` and update it to include tracking fields and tags:

The current body is:
```typescript
body: JSON.stringify({
  sender: { name: params.fromName, email: params.fromEmail },
  to: [{ email: params.to.email, name: params.to.name }],
  subject: params.subject,
  htmlContent: params.htmlContent,
}),
```

Change `sendTransactionalEmail` signature to accept an optional `campaignId` and update the body:

```typescript
export async function sendTransactionalEmail(params: {
  to: { email: string; name: string }
  subject: string
  htmlContent: string
  fromName: string
  fromEmail: string
  campaignId?: string
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
      trackOpens: 1,
      trackClicks: 1,
      ...(params.campaignId ? { tags: [params.campaignId] } : {}),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message ?? `Brevo API error: ${response.status}`)
  }

  const data = await response.json()
  return (data.messageId as string) ?? ''
}
```

- [ ] **Step 2: Update sendCampaign in actions.ts to pass campaignId**

In `lib/campaigns/actions.ts`, find the `sendTransactionalEmail` call and add `campaignId`:

Current call:
```typescript
const messageId = await sendTransactionalEmail({
  to: { email: contact.email, name: `${contact.first_name} ${contact.last_name}`.trim() || contact.email },
  subject: campaign.subject,
  htmlContent: personalizedHtml,
  fromName: campaign.from_name,
  fromEmail: campaign.from_email,
})
```

Updated call:
```typescript
const messageId = await sendTransactionalEmail({
  to: { email: contact.email, name: `${contact.first_name} ${contact.last_name}`.trim() || contact.email },
  subject: campaign.subject,
  htmlContent: personalizedHtml,
  fromName: campaign.from_name,
  fromEmail: campaign.from_email,
  campaignId: campaignId,
})
```

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/campaigns/brevo.ts lib/campaigns/actions.ts
git commit -m "feat: enable Brevo open/click tracking in send API"
```

---

## Task 3: Analytics Queries

**Files:**
- Create: `lib/analytics/queries.ts`

- [ ] **Step 1: Create queries.ts**

Create `lib/analytics/queries.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import type { Campaign } from '@/lib/campaigns/types'

export type CampaignWithStats = Campaign & {
  stats: {
    total_sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    unsubscribed: number
    open_rate: number
    click_rate: number
  }
}

export type ContactActivity = {
  contact_id: string
  first_name: string
  last_name: string
  email: string
  status: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
}

export type LinkBreakdown = {
  link_url: string
  click_count: number
}

export type OpensBucket = {
  bucket: string
  count: number
}

export async function getCampaignsWithStats(): Promise<CampaignWithStats[]> {
  const supabase = await createClient()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })

  if (!campaigns?.length) return []

  const campaignIds = campaigns.map((c: any) => c.id)

  const { data: statsRows } = await supabase
    .from('campaign_stats')
    .select('*')
    .in('campaign_id', campaignIds)

  const statsMap = new Map((statsRows ?? []).map((s: any) => [s.campaign_id, s]))

  return campaigns.map((c: any) => {
    const s = statsMap.get(c.id) ?? {
      total_sent: 0, delivered: 0, opened: 0,
      clicked: 0, bounced: 0, unsubscribed: 0,
    }
    const open_rate = s.total_sent > 0 ? Math.round((s.opened / s.total_sent) * 100) : 0
    const click_rate = s.total_sent > 0 ? Math.round((s.clicked / s.total_sent) * 100) : 0
    return { ...c, stats: { ...s, open_rate, click_rate } }
  }) as CampaignWithStats[]
}

export async function getContactActivity(
  campaignId: string,
  page = 1
): Promise<{ rows: ContactActivity[]; total: number }> {
  const supabase = await createClient()
  const PER_PAGE = 50

  const { data, count } = await supabase
    .from('campaign_sends')
    .select(
      'contact_id, status, sent_at, opened_at, clicked_at, contacts(first_name, last_name, email)',
      { count: 'exact' }
    )
    .eq('campaign_id', campaignId)
    .order('sent_at', { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  const rows: ContactActivity[] = (data ?? []).map((r: any) => ({
    contact_id: r.contact_id,
    first_name: r.contacts?.first_name ?? '',
    last_name: r.contacts?.last_name ?? '',
    email: r.contacts?.email ?? '',
    status: r.status,
    sent_at: r.sent_at,
    opened_at: r.opened_at,
    clicked_at: r.clicked_at,
  }))

  return { rows, total: count ?? 0 }
}

export async function getLinkBreakdown(campaignId: string): Promise<LinkBreakdown[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('campaign_sends')
    .select('link_url')
    .eq('campaign_id', campaignId)
    .eq('status', 'clicked')
    .not('link_url', 'is', null)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.link_url) {
      counts.set(row.link_url, (counts.get(row.link_url) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([link_url, click_count]) => ({ link_url, click_count }))
    .sort((a, b) => b.click_count - a.click_count)
}

export async function getOpensOverTime(
  campaignId: string,
  sentAt: string
): Promise<OpensBucket[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('campaign_sends')
    .select('opened_at')
    .eq('campaign_id', campaignId)
    .not('opened_at', 'is', null)

  const sent = new Date(sentAt).getTime()

  const buckets: Record<string, number> = {
    '1h': 0, '2h': 0, '3h': 0, '4h': 0,
    '6h': 0, '12h': 0, '1d': 0, '2d': 0,
    '3d': 0, '4d': 0, '5d': 0, '6d+': 0,
  }

  const thresholds: [string, number][] = [
    ['1h', 1], ['2h', 2], ['3h', 3], ['4h', 4],
    ['6h', 6], ['12h', 12], ['1d', 24], ['2d', 48],
    ['3d', 72], ['4d', 96], ['5d', 120], ['6d+', Infinity],
  ]

  for (const row of data ?? []) {
    if (!row.opened_at) continue
    const hoursAfter = (new Date(row.opened_at).getTime() - sent) / 3_600_000
    for (const [label, maxHours] of thresholds) {
      if (hoursAfter <= maxHours) {
        buckets[label]++
        break
      }
    }
  }

  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }))
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/analytics/queries.ts
git commit -m "feat: add analytics query helpers"
```

---

## Task 4: Brevo Webhook Handler (TDD)

**Files:**
- Create: `app/api/webhooks/brevo/route.ts`
- Create: `app/api/webhooks/brevo/__tests__/handler.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/webhooks/brevo/__tests__/handler.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockUpdate = vi.fn().mockResolvedValue({ error: null })
const mockEq = vi.fn(() => ({ eq: mockEq, single: vi.fn().mockResolvedValue({ data: { id: 'send-1', contact_id: 'contact-1' } }) }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect, update: vi.fn(() => ({ eq: mockEq })) }))
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

// Import after mocking
const { POST } = await import('../route')

function makeRequest(body: object) {
  return new Request('http://localhost/api/webhooks/brevo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Brevo webhook handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 for opened event', async () => {
    const req = makeRequest({
      event: 'opened',
      email: 'test@example.com',
      date: '2026-05-29T10:00:00Z',
      messageId: 'msg-123',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 200 for unknown messageId (graceful ignore)', async () => {
    mockEq.mockImplementationOnce(() => ({
      eq: mockEq,
      single: vi.fn().mockResolvedValue({ data: null }),
    }))
    const req = makeRequest({
      event: 'opened',
      email: 'unknown@example.com',
      date: '2026-05-29T10:00:00Z',
      messageId: 'unknown-msg',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 200 for bounced event', async () => {
    const req = makeRequest({
      event: 'bounced',
      email: 'bounce@example.com',
      date: '2026-05-29T10:00:00Z',
      messageId: 'msg-456',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run "app/api/webhooks/brevo/__tests__/handler.test.ts"
```
Expected: FAIL — route module not found

- [ ] **Step 3: Create webhook handler**

Create `app/api/webhooks/brevo/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BrevoEventType =
  | 'delivered' | 'opened' | 'clicked'
  | 'bounced' | 'softBounce' | 'unsubscribed'

type BrevoPayload = {
  event: BrevoEventType
  email: string
  date: string
  messageId: string
  tags?: string[]
  link?: string
}

export async function POST(request: Request) {
  let body: BrevoPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true }) // malformed body — ignore
  }

  const supabase = await createClient()

  // Find the campaign_sends row by Brevo message ID
  const { data: send } = await supabase
    .from('campaign_sends')
    .select('id, contact_id')
    .eq('brevo_message_id', body.messageId)
    .single()

  if (!send) {
    // Unknown message ID — could be a test event or old data. Always 200.
    return NextResponse.json({ ok: true })
  }

  const update: Record<string, string> = {}

  switch (body.event) {
    case 'delivered':
      update.status = 'delivered'
      break
    case 'opened':
      update.status = 'opened'
      update.opened_at = body.date
      break
    case 'clicked':
      update.status = 'clicked'
      update.clicked_at = body.date
      if (body.link) update.link_url = body.link
      break
    case 'bounced':
    case 'softBounce':
      update.status = 'bounced'
      break
    case 'unsubscribed':
      update.status = 'unsubscribed'
      await supabase
        .from('contacts')
        .update({ status: 'unsubscribed' })
        .eq('id', send.contact_id)
      break
  }

  if (Object.keys(update).length) {
    await supabase
      .from('campaign_sends')
      .update(update)
      .eq('id', send.id)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run "app/api/webhooks/brevo/__tests__/handler.test.ts"
```
Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/api/webhooks/brevo/
git commit -m "feat: add Brevo webhook handler"
```

---

## Task 5: OpensChart Component

**Files:**
- Create: `components/analytics/OpensChart.tsx`

- [ ] **Step 1: Create OpensChart**

Create `components/analytics/OpensChart.tsx`:
```typescript
'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { OpensBucket } from '@/lib/analytics/queries'

type Props = { data: OpensBucket[] }

export default function OpensChart({ data }: Props) {
  const max = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-medium text-slate-700">Opens over time</p>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            cursor={{ fill: '#f1f5f9' }}
          />
          <Bar dataKey="count" name="Opens" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.count === max ? '#3b82f6' : '#bfdbfe'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/analytics/OpensChart.tsx
git commit -m "feat: add OpensChart component"
```

---

## Task 6: ContactActivityTab + LinkBreakdownTab

**Files:**
- Create: `components/analytics/ContactActivityTab.tsx`
- Create: `components/analytics/LinkBreakdownTab.tsx`

- [ ] **Step 1: Create ContactActivityTab**

Create `components/analytics/ContactActivityTab.tsx`:
```typescript
import type { ContactActivity } from '@/lib/analytics/queries'

type Props = {
  rows: ContactActivity[]
  total: number
  page: number
  onPageChange: (p: number) => void
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const STATUS_DOT: Record<string, string> = {
  clicked: '#10b981',
  opened: '#3b82f6',
  delivered: '#94a3b8',
  bounced: '#ef4444',
  unsubscribed: '#f59e0b',
  queued: '#e2e8f0',
  sent: '#94a3b8',
}

export default function ContactActivityTab({ rows, total, page, onPageChange }: Props) {
  const PER_PAGE = 50
  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Contact</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Opened</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Clicked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.contact_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-900">
                    {`${row.first_name} ${row.last_name}`.trim() || '—'}
                  </div>
                  <div className="text-slate-400">{row.email}</div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_DOT[row.status] ?? '#94a3b8' }}
                    />
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{fmt(row.opened_at)}</td>
                <td className="px-4 py-2.5 text-slate-500">{fmt(row.clicked_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No send data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}</span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create LinkBreakdownTab**

Create `components/analytics/LinkBreakdownTab.tsx`:
```typescript
import type { LinkBreakdown } from '@/lib/analytics/queries'

export default function LinkBreakdownTab({ links }: { links: LinkBreakdown[] }) {
  if (links.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        No link clicks recorded yet
      </div>
    )
  }

  const maxClicks = links[0].click_count

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-slate-500">Link</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-500">Clicks</th>
            <th className="px-4 py-2.5 w-32"></th>
          </tr>
        </thead>
        <tbody>
          {links.map(link => (
            <tr key={link.link_url} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <a
                  href={link.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline max-w-xs block truncate"
                >
                  {link.link_url}
                </a>
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-slate-900">
                {link.click_count}
              </td>
              <td className="px-4 py-2.5">
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${(link.click_count / maxClicks) * 100}%` }}
                  />
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

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/analytics/ContactActivityTab.tsx components/analytics/LinkBreakdownTab.tsx
git commit -m "feat: add ContactActivityTab and LinkBreakdownTab"
```

---

## Task 7: CampaignStatsList + CampaignStatsPanel

**Files:**
- Create: `components/analytics/CampaignStatsList.tsx`
- Create: `components/analytics/CampaignStatsPanel.tsx`

- [ ] **Step 1: Create CampaignStatsList**

Create `components/analytics/CampaignStatsList.tsx`:
```typescript
import type { CampaignWithStats } from '@/lib/analytics/queries'

type Props = {
  campaigns: CampaignWithStats[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function CampaignStatsList({ campaigns, selectedId, onSelect }: Props) {
  if (campaigns.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-400">
        No sent campaigns yet
      </div>
    )
  }

  return (
    <div className="space-y-1 p-2">
      {campaigns.map(campaign => (
        <button
          key={campaign.id}
          onClick={() => onSelect(campaign.id)}
          className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
            selectedId === campaign.id
              ? 'bg-blue-50 border border-blue-200'
              : 'border border-transparent hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium truncate max-w-[140px] ${
              selectedId === campaign.id ? 'text-blue-700' : 'text-slate-800'
            }`}>
              {campaign.name}
            </span>
            <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1">
              {campaign.sent_at
                ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—'}
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-[11px] text-slate-500">
              📬 <span className="font-medium text-slate-700">{campaign.stats.open_rate}%</span> open
            </span>
            <span className="text-[11px] text-slate-500">
              🔗 <span className="font-medium text-slate-700">{campaign.stats.click_rate}%</span> click
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create CampaignStatsPanel**

Create `components/analytics/CampaignStatsPanel.tsx`:
```typescript
'use client'

import { useState } from 'react'
import OpensChart from './OpensChart'
import ContactActivityTab from './ContactActivityTab'
import LinkBreakdownTab from './LinkBreakdownTab'
import type { CampaignWithStats, ContactActivity, LinkBreakdown, OpensBucket } from '@/lib/analytics/queries'

type Props = {
  campaign: CampaignWithStats
  opensData: OpensBucket[]
  activityRows: ContactActivity[]
  activityTotal: number
  links: LinkBreakdown[]
  onActivityPageChange: (page: number) => void
  activityPage: number
}

const KPI_CONFIG = [
  { key: 'delivered', label: 'Delivered', color: 'text-slate-900' },
  { key: 'opened', label: 'Opened', color: 'text-blue-600' },
  { key: 'clicked', label: 'Clicked', color: 'text-green-600' },
  { key: 'bounced', label: 'Bounced', color: 'text-amber-600' },
  { key: 'unsubscribed', label: 'Unsubscribed', color: 'text-red-500' },
] as const

export default function CampaignStatsPanel({
  campaign, opensData, activityRows, activityTotal,
  links, onActivityPageChange, activityPage,
}: Props) {
  const [tab, setTab] = useState<'activity' | 'links'>('activity')
  const { stats } = campaign

  function rate(count: number) {
    if (!stats.total_sent) return '0%'
    return `${Math.round((count / stats.total_sent) * 100)}%`
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{campaign.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sent {campaign.sent_at ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
            {' · '}{campaign.from_name} &lt;{campaign.from_email}&gt;
          </p>
        </div>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">sent</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-3">
          {KPI_CONFIG.map(({ key, label, color }) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className={`text-xl font-bold ${color}`}>{stats[key].toLocaleString()}</p>
              <p className="mt-0.5 text-[9px] text-slate-400">{label}</p>
              <p className="text-[10px] text-slate-500">{rate(stats[key])}</p>
            </div>
          ))}
        </div>

        {/* Opens chart */}
        <OpensChart data={opensData} />

        {/* Tabs */}
        <div>
          <div className="flex border-b border-slate-200 mb-3">
            <button
              onClick={() => setTab('activity')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === 'activity'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Contact Activity
            </button>
            <button
              onClick={() => setTab('links')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === 'links'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Link Breakdown
            </button>
          </div>

          {tab === 'activity' && (
            <ContactActivityTab
              rows={activityRows}
              total={activityTotal}
              page={activityPage}
              onPageChange={onActivityPageChange}
            />
          )}
          {tab === 'links' && <LinkBreakdownTab links={links} />}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/analytics/CampaignStatsList.tsx components/analytics/CampaignStatsPanel.tsx
git commit -m "feat: add CampaignStatsList and CampaignStatsPanel"
```

---

## Task 8: Analytics Page

**Files:**
- Create: `app/(dashboard)/analytics/AnalyticsClient.tsx`
- Modify: `app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Create AnalyticsClient**

Create `app/(dashboard)/analytics/AnalyticsClient.tsx`:
```typescript
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CampaignStatsList from '@/components/analytics/CampaignStatsList'
import CampaignStatsPanel from '@/components/analytics/CampaignStatsPanel'
import type { CampaignWithStats, ContactActivity, LinkBreakdown, OpensBucket } from '@/lib/analytics/queries'

type Props = {
  campaigns: CampaignWithStats[]
  initialSelected: string | null
  initialActivity: { rows: ContactActivity[]; total: number }
  initialLinks: LinkBreakdown[]
  initialOpens: OpensBucket[]
}

export default function AnalyticsClient({
  campaigns,
  initialSelected,
  initialActivity,
  initialLinks,
  initialOpens,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activityPage, setActivityPage] = useState(1)
  const [activityData, setActivityData] = useState(initialActivity)
  const [, startTransition] = useTransition()

  const selectedId = searchParams.get('id') ?? initialSelected
  const selected = campaigns.find(c => c.id === selectedId) ?? campaigns[0] ?? null

  function handleSelect(id: string) {
    setActivityPage(1)
    const params = new URLSearchParams(searchParams.toString())
    params.set('id', id)
    router.push(`/analytics?${params.toString()}`)
  }

  function handlePageChange(page: number) {
    setActivityPage(page)
    // Re-fetch activity for new page via router refresh with page param
    const params = new URLSearchParams(searchParams.toString())
    params.set('activityPage', String(page))
    startTransition(() => router.push(`/analytics?${params.toString()}`))
  }

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        No sent campaigns yet. Send your first campaign to see analytics.
      </div>
    )
  }

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      {/* Left panel */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h1 className="text-sm font-semibold text-slate-900">Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">{campaigns.length} sent campaigns</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CampaignStatsList
            campaigns={campaigns}
            selectedId={selected.id}
            onSelect={handleSelect}
          />
        </div>
      </div>

      {/* Right panel */}
      <CampaignStatsPanel
        campaign={selected}
        opensData={initialOpens}
        activityRows={initialActivity.rows}
        activityTotal={initialActivity.total}
        links={initialLinks}
        onActivityPageChange={handlePageChange}
        activityPage={activityPage}
      />
    </div>
  )
}
```

- [ ] **Step 2: Replace analytics page**

Replace ALL contents of `app/(dashboard)/analytics/page.tsx`:
```typescript
import { Suspense } from 'react'
import { getCampaignsWithStats, getContactActivity, getLinkBreakdown, getOpensOverTime } from '@/lib/analytics/queries'
import AnalyticsClient from './AnalyticsClient'

type Props = {
  searchParams: Promise<{ id?: string; activityPage?: string }>
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams
  const activityPage = Number(params.activityPage ?? 1)

  const campaigns = await getCampaignsWithStats()
  const selectedId = params.id ?? campaigns[0]?.id ?? null

  const [activity, links, opens] = selectedId
    ? await Promise.all([
        getContactActivity(selectedId, activityPage),
        getLinkBreakdown(selectedId),
        getOpensOverTime(selectedId, campaigns.find(c => c.id === selectedId)?.sent_at ?? new Date().toISOString()),
      ])
    : [{ rows: [], total: 0 }, [], []]

  return (
    <Suspense>
      <AnalyticsClient
        campaigns={campaigns}
        initialSelected={selectedId}
        initialActivity={activity}
        initialLinks={links}
        initialOpens={opens}
      />
    </Suspense>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 4: Commit + tag**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/(dashboard)/analytics/ components/analytics/
git commit -m "feat: add analytics split-view page"
git tag v0.3b-analytics
```
