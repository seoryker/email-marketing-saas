# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Production build
npm run test         # Run tests in watch mode (Vitest)
npm run test:run     # Run all tests once (CI mode)
npm run lint         # ESLint
```

Run a single test file:
```bash
npm run test:run lib/contacts/__tests__/csv.test.ts
```

---

## Architecture Overview

This is an **Email Marketing SaaS platform** built with Next.js 14 App Router, Supabase (PostgreSQL + Auth + RLS), and Tailwind CSS. It is organized as 9 shipped sub-projects.

### Route Groups

| Group | Path | Purpose |
|---|---|---|
| `(auth)` | `/login`, `/verify-otp`, `/onboarding` | Unauthenticated pages |
| `(dashboard)` | `/dashboard`, `/campaigns`, etc. | Protected pages (session required) |
| Public | `/p/[slug]`, `/invite/[token]` | Public landing pages + invite acceptance |
| API | `/api/*` | Upload, webhooks, cron, forms |

### Multi-Tenancy

Every user belongs to an `organization`. All app data is scoped to `organization_id`. Supabase Row Level Security (RLS) enforces this at the DB layer using the `current_org_id()` helper function — no application-level filtering needed.

The trigger `on_auth_user_created` auto-creates stub `organizations` + `profiles` rows on signup. The onboarding form UPDATEs them with real name/org data.

### Auth Flow

Phone/OTP → `/verify-otp` → onboarding → `/dashboard`
Email/password or Google OAuth → onboarding (if new) or `/dashboard` (if returning)

`middleware.ts` protects all `(dashboard)` routes. Viewers (role = `viewer`) are blocked from write routes (`/campaigns/new`, `*/edit`, etc.).

### 4-Role Permission System

| Role | Key restrictions |
|---|---|
| `owner` | Full access including delete org, manage all members |
| `admin` | Full access except delete org; can invite/remove members |
| `member` | All content features; cannot manage team |
| `viewer` | Read-only; blocked from create/edit routes by middleware |

---

## Key Libraries & Where They're Used

| Library | Used in |
|---|---|
| `@supabase/ssr` | `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts` |
| `react-email-editor` (Unlayer) | `components/campaigns/EmailBuilder.tsx` — email + landing page builder canvas |
| `@xyflow/react` | `components/automations/AutomationCanvas.tsx` — automation flowchart |
| `@tanstack/react-table` | `components/contacts/ContactsTable.tsx` |
| `recharts` | `components/dashboard/` — analytics charts |
| `papaparse` | `lib/contacts/csv.ts` — CSV import parsing |
| `@aws-sdk/client-s3` | `lib/r2/` — Cloudflare R2 image uploads |
| `lucide-react` | Icons throughout |
| `shadcn/ui` | `components/ui/` — base components (Button, Input, etc.) |

---

## Database Migrations

Applied in order via Supabase SQL Editor. Never modify existing migrations — add new ones.

| File | Contents |
|---|---|
| `001_foundation.sql` | `organizations`, `profiles`, `invitations` + auth trigger |
| `002_contacts.sql` | `contacts`, `lists`, `contact_lists`, `tags`, `contact_tags`, `custom_field_definitions` |
| `003_campaigns.sql` | `campaigns`, `campaign_sends`, `email_templates` |
| `004_analytics.sql` | `link_url` column on `campaign_sends` + `campaign_stats` view |
| `005_automations.sql` | `automations`, `automation_steps`, `automation_edges`, `automation_enrollments`, `automation_step_states` |
| `006_analytics_dashboard.sql` | `subscriber_growth_daily`, `unsubscribe_daily`, `campaign_performance_daily` views |
| `007_landing_pages.sql` | `landing_pages`, `page_submissions` |
| `008_team.sql` | Adds `viewer` to `profiles.role` constraint |
| `009_media.sql` | `media_files`, `integration_settings` |

---

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
BREVO_API_KEY=                    # Transactional email (300/day free)
BREVO_FROM_EMAIL=                 # Sender address
CLOUDFLARE_R2_ACCOUNT_ID=         # R2 image storage
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=        # https://pub-xxx.r2.dev
NEXT_PUBLIC_APP_URL=              # Used in team invite emails
CRON_SECRET=                      # Protects /api/cron/* routes
```

---

## Lib Conventions

### Server vs Client Supabase

- `lib/supabase/server.ts` — async, uses Next.js cookies. Use in Server Components, Server Actions, API routes.
- `lib/supabase/client.ts` — browser singleton. Use in Client Components (`'use client'`).

### Server Actions

All mutations use Next.js Server Actions (`'use server'`). They call `revalidatePath()` after mutations to clear the Next.js cache. Pattern:

```typescript
// lib/*/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // ...
}
```

### Fire-and-Forget Webhooks

Outbound webhooks (`lib/webhooks/dispatch.ts`) never throw — failures are silently caught so they never affect the main user flow.

---

## Full-Screen Pages

Three pages bypass the dashboard shell by using `-m-6 h-screen`:
- Campaign email builder: `app/(dashboard)/campaigns/[id]/edit/BuilderClient.tsx`
- Landing page builder: `app/(dashboard)/landing-pages/[id]/edit/PageBuilderClient.tsx`
- Automation builder: `app/(dashboard)/automations/[id]/edit/AutomationBuilderClient.tsx`

All use the same pattern: dark toolbar at top, canvas in the middle, status bar at the bottom.

---

## Execution Engine (Automations)

The Vercel Cron at `*/1 * * * *` calls `/api/cron/process-automations` which runs `processScheduledSteps()`. This fetches up to 100 pending `automation_step_states` and executes each step type (send_email, wait, condition, add_tag, etc.).

Triggers fire `enrollContact()` from:
- `lib/contacts/actions.ts` → after contact/list/tag events
- `app/api/webhooks/brevo/route.ts` → on opened/clicked/unsubscribed events
- `app/api/webhooks/automation/route.ts` → external POST

---

## Email Sending (Brevo)

`lib/campaigns/brevo.ts` sends transactional emails via Brevo REST API (free: 300/day).

`sendCampaign()` in `lib/campaigns/actions.ts` batches sends respecting the 300/day limit — contacts beyond the limit get `status: 'queued'` in `campaign_sends` and are processed the next day via cron.

Merge tags (`{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{company}}`) are replaced server-side before each send via `replaceMergeTags()`.

---

## R2 Image Uploads

Upload flow: client requests presigned PUT URL from `/api/upload` → server validates + inserts `media_files` row → client PUTs binary directly to R2 → public URL inserted into Unlayer canvas.

Stored at: `{organization_id}/{timestamp}-{slugified-filename}.{ext}`

The custom Unlayer uploader is registered in `components/campaigns/EmailBuilder.tsx` via `registerCallback('selectImage', ...)`.

---

## Testing

Tests use Vitest + React Testing Library. Run with `npm run test:run`.

Test files live next to the code they test in `__tests__/` directories:
- `lib/contacts/__tests__/csv.test.ts`
- `lib/r2/__tests__/upload.test.ts`
- `lib/webhooks/__tests__/dispatch.test.ts`
- `lib/team/__tests__/permissions.test.ts`
- `lib/automations/__tests__/engine.test.ts`
- `components/contacts/__tests__/`
- `components/campaigns/__tests__/`
- etc.

Supabase is always mocked in tests via `vi.mock('@/lib/supabase/server', ...)`.
