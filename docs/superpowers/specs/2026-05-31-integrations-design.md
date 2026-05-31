# Integrations (Sub-project 7) — Design Spec

**Date:** 2026-05-31
**Sub-project:** 7 of 9
**Scope:** 7a — Cloudflare R2 image storage for email/landing page builders. 7b — Outbound + inbound webhooks (Zapier/Make/n8n compatible), Google Analytics 4 tracking across platform.

---

## 7a: Cloudflare R2 File Storage

### Environment Variables

```
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET_NAME=mailflow-assets
CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

Obtain from Cloudflare dashboard → R2 → Create bucket → API tokens.

### New Dependency

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

R2 is S3-compatible — the AWS SDK works against R2 by pointing it at the R2 endpoint.

### Database

```sql
-- Migration: 009_media.sql
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
```

### Upload API (`/api/upload/route.ts`)

POST endpoint — authenticated (session required):

1. Parse `filename`, `contentType`, `size` from request body
2. Validate: `contentType` must start with `image/`, `size` ≤ 5MB
3. Get user's `organization_id` from Supabase session
4. Generate R2 key: `{organization_id}/{Date.now()}-{slugified-filename}`
5. Create S3 client pointing to R2 endpoint: `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`
6. Generate presigned PUT URL (15-minute expiry) using `@aws-sdk/s3-request-presigner`
7. Insert `media_files` row with the public URL
8. Return `{ uploadUrl, publicUrl, fileId }`

Client then PUTs the file binary directly to `uploadUrl` (no server bandwidth used).

### Custom Unlayer Image Uploader

Both `EmailBuilder.tsx` (campaigns) and the landing page builder use Unlayer. Override Unlayer's default image uploader by registering a custom handler in the `onLoad` callback:

```typescript
editorRef.current?.registerCallback('selectImage', (data: any, done: (url: string) => void) => {
  // Open custom upload modal
  // When user selects/uploads an image:
  // done({ url: publicUrl })
})
```

The `UploadModal` component:
- Drag-and-drop zone + browse button
- "Recent uploads" grid (last 12 from `media_files` for this org)
- Paste URL option (for external images)
- Progress bar during upload
- On complete: calls `done({ url })` to insert into Unlayer

### File Structure

```
app/api/upload/
└── route.ts                    # POST: presign + insert media_files row

lib/r2/
├── client.ts                   # S3Client pointed at R2 endpoint
└── upload.ts                   # generatePresignedPutUrl(key, contentType): Promise<string>

components/media/
└── UploadModal.tsx             # Drag-drop uploader with recent uploads grid

lib/media/
└── queries.ts                  # getRecentUploads(limit): Promise<MediaFile[]>
```

---

## 7b: Webhooks + Google Analytics

### Database

```sql
-- Added to 009_media.sql
create table public.integration_settings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references public.organizations(id) on delete cascade,
  webhook_url     text,
  webhook_events  text[] not null default '{}',
  ga_measurement_id text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create trigger integration_settings_updated_at
  before update on public.integration_settings
  for each row execute function public.set_updated_at();
alter table public.integration_settings enable row level security;
create policy "org members can manage integration settings"
  on public.integration_settings for all
  using (organization_id = public.current_org_id());
```

### Outbound Webhooks

**Events dispatched:**
| Event | Payload |
|---|---|
| `contact.created` | `{ contact_id, email, first_name, last_name, org_id }` |
| `contact.unsubscribed` | `{ contact_id, email, org_id }` |
| `campaign.sent` | `{ campaign_id, name, recipient_count, org_id }` |
| `form.submitted` | `{ page_id, page_name, email, data, org_id }` |
| `automation.completed` | `{ automation_id, name, contact_id, org_id }` |

**Dispatch logic (`lib/webhooks/dispatch.ts`):**
```typescript
export async function dispatchWebhook(orgId: string, event: string, payload: object): Promise<void>
```
1. Fetch `integration_settings` for org — get `webhook_url` + `webhook_events`
2. If `webhook_url` empty or event not in `webhook_events`, return early
3. POST to `webhook_url`:
   ```json
   { "event": "contact.created", "timestamp": "...", "data": {...} }
   ```
4. Fire-and-forget with 5s timeout — webhook failures don't affect the main flow

**Call sites:** Add `dispatchWebhook` calls at:
- `lib/contacts/actions.ts` → `createContact` (after insert)
- `lib/campaigns/actions.ts` → `sendCampaign` (after status = 'sent')
- `app/api/forms/[slug]/route.ts` → after `page_submissions` insert
- `lib/automations/engine.ts` → `completeEnrollment`
- `app/api/webhooks/brevo/route.ts` → `unsubscribed` event

### Inbound Webhook (`/api/webhooks/inbound/route.ts`)

Public POST endpoint (no auth — relies on org-specific token):

```
POST /api/webhooks/inbound
{ "token": "org-webhook-token", "action": "create_contact", "data": { "email": "...", "first_name": "..." } }
```

Actions supported:
- `create_contact` — upserts contact
- `add_to_list` — adds contact to list by list name or ID
- `trigger_automation` — enrolls contact in automation by ID

**Token:** The `integration_settings` table stores a `webhook_secret` (UUID, auto-generated). Shown in the Integrations settings page for users to copy into Zapier.

Add `webhook_secret text default gen_random_uuid()::text` to `integration_settings`.

### Google Analytics 4

**How it works:**
1. User enters GA4 Measurement ID (`G-XXXXXXXXXX`) in Settings → Integrations
2. Stored in `integration_settings.ga_measurement_id`
3. The dashboard layout (`app/(dashboard)/layout.tsx`) fetches org's `ga_measurement_id` server-side
4. If set, injects `<Script>` tags (Next.js `next/script`) for GA4 gtag.js
5. Public landing pages (`app/p/[slug]/page.tsx`) also read the org's GA4 ID and inject the same script

**Events fired:**
- `page_view` — automatic via GA4 (standard)
- `form_submit` — custom event fired in the form submission script on `/p/[slug]`
- `campaign_created` — fired client-side when new campaign is created (optional, low priority)

### Integrations Settings Page (`/settings/integrations`)

Single page under Settings with three sections:

**1. Image Storage (R2)**
- Status badge: Connected / Not configured
- Shows `CLOUDFLARE_R2_PUBLIC_URL` if configured (env-based, no UI input needed)

**2. Webhooks**
- "Outbound webhook URL" input — where to POST events
- Checkboxes for which events to send (contact.created, campaign.sent, form.submitted, etc.)
- "Inbound webhook token" — read-only, shows the secret + copy button
- Test webhook button — sends a `test` event to the configured URL

**3. Google Analytics**
- GA4 Measurement ID input (`G-XXXXXXXXXX`)
- Save button
- Preview: "Tracking active on dashboard and landing pages"

### File Structure

```
app/api/
├── upload/route.ts             # R2 presigned upload
└── webhooks/inbound/route.ts   # Inbound webhook handler

app/(dashboard)/settings/
└── integrations/
    └── page.tsx                # Integrations settings page + client

lib/r2/
├── client.ts                   # S3Client for R2
└── upload.ts                   # generatePresignedPutUrl

lib/webhooks/
└── dispatch.ts                 # dispatchWebhook helper

lib/media/
└── queries.ts                  # getRecentUploads

lib/integrations/
└── actions.ts                  # saveWebhookSettings, saveGASettings

components/media/
└── UploadModal.tsx             # Upload modal for Unlayer builders
```

---

## What Is Explicitly Out of Scope

- Native Zapier app (requires Zapier partner review)
- Shopify / WooCommerce / HubSpot / Salesforce / Meta Ads (separate sub-projects)
- Webhook retry logic / delivery logs (V2)
- R2 file deletion on campaign/page delete
- Video upload support
- Image CDN optimization (Cloudflare Images)
