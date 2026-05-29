# Campaign Builder (Sub-project 3a) — Design Spec

**Date:** 2026-05-29
**Sub-project:** 3a of 9 (Email Marketing SaaS Platform)
**Scope:** Campaign creation, full-screen drag-and-drop email builder (Unlayer), Brevo API sending, send now / schedule, campaigns list page.
**Not in scope (3b):** Open/click tracking, analytics dashboard, per-contact activity, device breakdown, link heatmap.

---

## Stack

Builds on Foundation + Contacts. Adds:

| Addition | Purpose |
|---|---|
| `react-email-editor` | Unlayer drag-and-drop canvas embedded in Next.js |
| `@getbrevo/brevo` | Official Brevo Node.js SDK for sending via API |

---

## Database Schema

Migration file: `supabase/migrations/003_campaigns.sql`

```sql
-- Campaign record
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

-- Per-contact send record
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

-- Reusable email templates
create table public.email_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  thumbnail_url   text,
  content_json    jsonb,
  content_html    text,
  created_at      timestamptz default now()
);

-- updated_at trigger (reuse set_updated_at from migration 002)
create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- Indexes
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
    exists (select 1 from public.campaigns where id = campaign_id and organization_id = public.current_org_id())
  );

create policy "org members can manage email_templates"
  on public.email_templates for all
  using (organization_id = public.current_org_id());
```

---

## File Structure

```
app/(dashboard)/campaigns/
├── page.tsx                        # Campaigns list (Server Component)
├── new/page.tsx                    # Campaign setup form
├── [id]/
│   ├── page.tsx                    # Redirect → /[id]/edit
│   └── edit/
│       ├── page.tsx                # Full-screen builder (Server Component shell)
│       └── BuilderClient.tsx       # Client Component: Unlayer + toolbar

components/campaigns/
├── CampaignsList.tsx               # Table: name, status badge, stats, actions
├── CampaignSetupForm.tsx           # New campaign: name, subject, from, preview
├── EmailBuilder.tsx                # Unlayer wrapper (client, no SSR)
├── BuilderToolbar.tsx              # Dark top bar: back, name, preview toggle, save/next
├── SendModal.tsx                   # Recipients + schedule + summary + send button

lib/campaigns/
├── types.ts                        # Campaign, CampaignSend, EmailTemplate types
├── queries.ts                      # getCampaigns, getCampaign, getCampaignSends
├── actions.ts                      # createCampaign, updateCampaign, sendCampaign, scheduleCampaign
└── brevo.ts                        # Brevo API wrapper: sendEmail, checkDailyLimit
```

---

## Page Architecture

### Campaigns List (`/campaigns`)

Server Component. Fetches all campaigns ordered by `created_at DESC`.

**Header:** "Campaigns" title + count + "+ New Campaign" button.

**Table columns:** Campaign name, Status badge (draft=grey, scheduled=amber, sending=blue, sent=green, failed=red), Recipients, Open rate (placeholder "—" until 3b), Sent date, ⋯ row menu (Edit / Duplicate / Delete).

**Empty state:** "No campaigns yet" with "+ Create your first campaign" CTA.

### Campaign Setup Form (`/campaigns/new`)

Client Component page (not full-screen). Simple form:
- Campaign name (internal, required)
- Email subject line (required)
- Preview text (optional)
- From name (required, pre-filled from org settings)
- From email (required, pre-filled from org settings)

On submit → creates `campaigns` row with `status: 'draft'` → redirects to `/campaigns/[id]/edit`.

### Full-Screen Builder (`/campaigns/[id]/edit`)

Server Component fetches campaign, passes to `BuilderClient`. Layout is full-screen (bypasses dashboard shell padding via `-m-6 h-screen` trick used in contacts).

**BuilderToolbar (dark, 48px):**
- ← Back to Campaigns (link)
- Campaign name (inline-editable, auto-saves on blur)
- "Draft · Last saved X min ago" status
- Desktop / Mobile preview toggle (calls `unlayerRef.current.setDisplayCondition()`)
- Save draft button (calls `updateCampaign` server action with current JSON + HTML)
- **Next: Recipients →** button → opens `SendModal`

**EmailBuilder (Unlayer canvas):**
- `react-email-editor` mounted with `dynamic(() => import(...), { ssr: false })`
- `onLoad` callback: loads `content_json` if campaign has existing design
- `onDesignChange` callback: auto-saves debounced every 30 seconds
- Merge tags configured: `{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{company}}`
- Custom blocks disabled (use default Unlayer blocks)
- Editor locale: English

**Bottom status bar (dark, 28px):**
- Subject line preview
- From address
- Spam score (Unlayer built-in)

### Send Modal

Slide-over modal triggered by "Next: Recipients" button.

**Recipients section:**
- Multi-select list picker (chips, same pattern as ContactForm)
- Shows estimated contact count: queries `contact_count` sum from selected lists, deduplicates by showing "~N contacts"
- "Active contacts only" note (contacts with `status = 'active'`)

**When to send:**
- Radio: "Send immediately" (default) / "Schedule for later"
- If scheduled: datetime picker (date + time + timezone)

**Summary card:** Subject, From, Recipients count, Sending time.

**Send button:**
- "Send Now" → calls `sendCampaign` server action
- "Schedule" → calls `scheduleCampaign` server action → sets `status: 'scheduled'`, `scheduled_at`

---

## Brevo API Integration

### Environment

```
BREVO_API_KEY=your-brevo-api-key
```

Obtain from Brevo dashboard → SMTP & API → API Keys.

### lib/campaigns/brevo.ts

```typescript
// Wraps @getbrevo/brevo SDK
export async function sendTransactionalEmail(params: {
  to: { email: string; name: string }
  subject: string
  htmlContent: string  // merge tags already replaced
  fromName: string
  fromEmail: string
}): Promise<string>   // returns Brevo messageId

export async function countTodaySends(orgId: string): Promise<number>
// Counts campaign_sends rows with sent_at >= today midnight UTC for this org
```

### lib/campaigns/actions.ts — sendCampaign

```typescript
export async function sendCampaign(campaignId: string): Promise<{ sent: number; queued: number }>
```

**Logic:**
1. Fetch campaign + verify `status === 'draft'` or `'scheduled'`
2. Fetch all active contacts from `recipient_list_ids` (deduplicated by contact ID)
3. Count today's sends via `countTodaySends` → cap at 300 per day (Brevo free limit)
4. Set campaign `status = 'sending'`
5. For each contact (up to daily remaining limit):
   - Replace merge tags in `content_html`: `{{first_name}}` → contact.first_name, etc.
   - Call `sendTransactionalEmail`
   - Insert `campaign_sends` row with `status: 'sent'`, `brevo_message_id`
6. For contacts beyond daily limit: insert `campaign_sends` rows with `status: 'queued'`
7. Update campaign: `status = 'sent'`, `sent_at = now()`, `recipient_count = total`
8. Return `{ sent, queued }`

**If queued contacts exist:** Campaign shows status `sent` with a note "X contacts queued — will send when daily limit resets."

### Merge tag replacement

```typescript
function replaceMergeTags(html: string, contact: Contact): string {
  return html
    .replace(/{{first_name}}/g, contact.first_name || '')
    .replace(/{{last_name}}/g, contact.last_name || '')
    .replace(/{{email}}/g, contact.email)
    .replace(/{{company}}/g, contact.company || '')
}
```

### Scheduling

A Next.js route handler at `app/api/cron/send-scheduled/route.ts` checks for due campaigns. Called by Vercel Cron (configured in `vercel.json`) every 5 minutes:

```json
{
  "crons": [{ "path": "/api/cron/send-scheduled", "schedule": "*/5 * * * *" }]
}
```

The route: fetches campaigns with `status = 'scheduled'` AND `scheduled_at <= now()`, calls `sendCampaign` for each.

---

## What Is Explicitly Out of Scope (3b)

- Open/click tracking (requires Brevo webhook receiver)
- Per-contact activity timeline
- Campaign analytics dashboard (open rate, click rate, bounce rate charts)
- Device/geo breakdown
- Link click heatmap
- A/B testing
- Subject line optimizer
- Spam score checker beyond Unlayer built-in
