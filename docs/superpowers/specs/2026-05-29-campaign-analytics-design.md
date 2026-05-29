# Campaign Analytics (Sub-project 3b) — Design Spec

**Date:** 2026-05-29
**Sub-project:** 3b of 9
**Scope:** Brevo webhook receiver for open/click/bounce/delivery events, update campaign_sends table, analytics split-view page at /analytics with KPIs, opens-over-time chart, contact activity tab, link breakdown tab.

---

## Stack

Adds no new dependencies. Uses existing Supabase, Next.js, and Brevo integration from 3a.

---

## Tracking Architecture

### Enable Brevo tracking in send API call

In `lib/campaigns/brevo.ts`, add to the Brevo request body:
```json
{
  "trackOpens": 1,
  "trackClicks": 1,
  "tags": ["<campaignId>"]
}
```

`tags` lets the webhook identify which campaign an event belongs to (as a fallback alongside `messageId`).

### Brevo Webhook Events

Brevo POSTs to `/api/webhooks/brevo` for each event. Payload shape:
```json
{
  "event": "opened",
  "email": "contact@example.com",
  "date": "2026-05-29T10:23:00.000Z",
  "messageId": "<brevo-message-id>",
  "tags": ["campaign-uuid"],
  "link": "https://..."
}
```

Event types handled: `delivered`, `opened`, `clicked`, `bounced`, `unsubscribed`, `softBounce`.

### Webhook Handler (`/api/webhooks/brevo/route.ts`)

1. Parse POST body
2. Look up `campaign_sends` row by `brevo_message_id`
3. Map event → DB update:
   - `delivered` → `status = 'delivered'`
   - `opened` → `status = 'opened'`, `opened_at = date`
   - `clicked` → `status = 'clicked'`, `clicked_at = date`
   - `bounced` / `softBounce` → `status = 'bounced'`
   - `unsubscribed` → `status = 'unsubscribed'`, also update `contacts.status = 'unsubscribed'`
4. Return `200 OK` (always — Brevo retries on non-200)

**No HMAC verification at launch** — Brevo's webhook secret is optional and can be added later. The endpoint is safe to leave public since it only updates existing rows (no inserts).

### One-time Brevo Setup (manual)

Brevo dashboard → Transactional → Settings → Webhooks → Add:
- URL: `https://<your-vercel-domain>/api/webhooks/brevo`
- Events: delivered, opened, clicked, hard bounce, soft bounce, unsubscribe

---

## Database Changes

No new tables. One new column on `campaign_sends`:

```sql
-- Migration: 004_analytics.sql
alter table public.campaign_sends
  add column if not exists link_url text;
```

`link_url` stores the clicked link URL for the Link Breakdown tab.

One helper view for fast aggregation:

```sql
create or replace view public.campaign_stats as
select
  campaign_id,
  count(*) filter (where status != 'queued') as total_sent,
  count(*) filter (where status = 'delivered' or status in ('opened','clicked')) as delivered,
  count(*) filter (where status in ('opened','clicked')) as opened,
  count(*) filter (where status = 'clicked') as clicked,
  count(*) filter (where status = 'bounced') as bounced,
  count(*) filter (where status = 'unsubscribed') as unsubscribed
from public.campaign_sends
group by campaign_id;
```

---

## File Structure

```
app/api/webhooks/brevo/
└── route.ts                    # POST handler for Brevo events

app/(dashboard)/analytics/
├── page.tsx                    # Server Component: fetches campaigns + stats
└── AnalyticsClient.tsx         # Client Component: split view + tabs

components/analytics/
├── CampaignStatsList.tsx       # Left panel: sent campaigns with open/click rates
├── CampaignStatsPanel.tsx      # Right panel: KPIs + chart + activity tabs
├── OpensChart.tsx              # Bar chart: opens over time (recharts)
├── ContactActivityTab.tsx      # Table: per-contact delivery/open/click timestamps
└── LinkBreakdownTab.tsx        # Table: link URL + click count

lib/analytics/
├── queries.ts                  # getCampaignStats, getContactActivity, getLinkBreakdown, getOpensOverTime
```

**Add to `lib/campaigns/brevo.ts`:** `trackOpens: 1, trackClicks: 1, tags: [campaignId]` in the send body.

---

## Page Architecture

### `/analytics` Page

Server Component. Fetches all sent campaigns with their stats from `campaign_stats` view. Passes to `AnalyticsClient`.

**Default state:** First sent campaign is pre-selected.

### `AnalyticsClient`

Client Component. Manages selected campaign ID state. Renders:
- `CampaignStatsList` (left, 260px fixed)
- `CampaignStatsPanel` (right, flex-1)

When a campaign is clicked in the left panel → fetches detail data for right panel via `router.push(?id=campaignId)` (URL param drives selection, makes it shareable/refreshable).

### Left Panel — `CampaignStatsList`

- Lists only campaigns with `status = 'sent'`
- Each row: campaign name, sent date, open rate %, click rate %
- Active campaign highlighted in blue
- Clicking a campaign updates the URL param

### Right Panel — `CampaignStatsPanel`

**Header:** Campaign name, sent date, from address, status badge.

**5 KPI cards (row):**
- Delivered (count + %)
- Opened (count + %)
- Clicked (count + %)
- Bounced (count + %)
- Unsubscribed (count + %)

**Opens-over-time chart (`OpensChart`):**
- Bar chart using `recharts` library
- X-axis: time buckets (1h, 2h, 3h, 4h, 6h, 12h, 1d, 2d, 3d, 4d, 5d, 6d+) relative to `sent_at`
- Y-axis: number of opens in that bucket
- Data from `getOpensOverTime(campaignId)` which groups `opened_at` timestamps into buckets

**Tabs:**

*Contact Activity tab:*
- Table columns: Contact name + email, Delivered ✓/—, Opened (✓ + time or —), Clicked (✓ + time or —)
- Data from `getContactActivity(campaignId)` joining `campaign_sends` + `contacts`
- Paginated: 50 rows per page

*Link Breakdown tab:*
- Table columns: Link URL (truncated), Click count
- Groups by `link_url` from `campaign_sends` where `status = 'clicked'`
- Sorted by click count descending

---

## recharts Integration

Add recharts for the opens chart:

```bash
npm install recharts
```

`OpensChart` uses `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip` from recharts. Rendered client-side only (`'use client'`).

---

## What Is Explicitly Out of Scope

- Real-time dashboard updates (Supabase Realtime) — add later
- Geographic breakdown / device breakdown
- Heatmap overlay on email content
- A/B test comparison
- Export to CSV/PDF
