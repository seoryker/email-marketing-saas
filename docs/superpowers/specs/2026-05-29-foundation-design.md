# Foundation — Design Spec

**Date:** 2026-05-29
**Sub-project:** 1 of 9 (Email Marketing SaaS Platform)
**Scope:** Auth, onboarding, dashboard shell. No billing.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Auth + DB | Supabase (PostgreSQL, RLS, Auth) |
| Deployment | Vercel (frontend) + Supabase cloud |

---

## Project Structure

```
email-marketing-saas/
├── app/
│   ├── (auth)/                 # Unauthenticated routes
│   │   ├── login/page.tsx
│   │   ├── verify-otp/page.tsx
│   │   ├── signup/page.tsx
│   │   └── onboarding/page.tsx
│   ├── (dashboard)/            # Protected routes (middleware-guarded)
│   │   ├── layout.tsx          # Shell: icon sidebar + top bar
│   │   └── dashboard/page.tsx  # Home with KPI cards + empty state
│   └── api/
│       └── auth/callback/route.ts  # Supabase OAuth redirect handler
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx       # Phone/email tabs + Google OAuth button
│   │   ├── OtpForm.tsx         # 6-digit OTP input with resend timer
│   │   └── OnboardingForm.tsx  # Name + org name
│   ├── layout/
│   │   ├── Sidebar.tsx         # Icon sidebar, expands to 220px on hover
│   │   ├── TopBar.tsx          # Page title + notifications + avatar
│   │   └── DashboardShell.tsx  # Composes sidebar + topbar + slot
│   └── ui/                     # shadcn/ui primitives
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser Supabase client
│   │   └── server.ts           # Server-side Supabase client (cookies)
│   └── utils.ts
├── middleware.ts                # Protect (dashboard) routes, redirect to /login
└── supabase/
    └── migrations/
        └── 001_foundation.sql  # organizations, profiles, invitations + RLS
```

---

## Authentication Flow

**Phone/OTP (default tab):**
1. User enters phone number → Supabase sends OTP via SMS (Twilio)
2. 6-digit OTP entry screen with 60s resend timer
3. On success → check if profile exists → onboarding if new, dashboard if returning

**Email/Password (secondary tab):**
1. User enters email + password → Supabase `signInWithPassword`
2. On success → same profile check as above

**Google OAuth:**
1. Redirect to Google via Supabase `signInWithOAuth`
2. Callback at `/api/auth/callback` exchanges code for session
3. Same profile check — onboarding if new user, dashboard if returning

**Session management:** Supabase handles JWT refresh automatically. Next.js middleware reads the session cookie on every request to `(dashboard)` routes. Unauthenticated requests redirect to `/login`.

---

## Onboarding

Shown once, immediately after first login regardless of auth method.

Fields:
- Full name (required)
- Organization name (required)

On submit: creates `organizations` row + `profiles` row via Supabase DB trigger (trigger fires on `auth.users` insert; onboarding form updates the pre-created rows with name/org data). Redirects to `/dashboard`.

---

## Database Schema

```sql
-- organizations: multi-tenant root
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  logo_url    text,
  created_at  timestamptz default now()
);

-- profiles: extends auth.users with app data
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  full_name       text,
  avatar_url      text,
  role            text not null default 'owner' check (role in ('owner','admin','member')),
  created_at      timestamptz default now()
);

-- invitations: future team member onboarding
create table invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  email           text not null,
  role            text not null default 'member',
  token           text unique not null,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz default now()
);
```

**RLS policies:**
- `profiles`: users read/write only rows where `organization_id` matches their own
- `organizations`: members can SELECT, only `owner` role can UPDATE/DELETE
- `invitations`: org admins/owners can INSERT; anyone can SELECT by token for accept flow

**DB trigger:** On `auth.users` INSERT, auto-create a stub `organizations` row and `profiles` row so the onboarding form always has rows to UPDATE (never INSERT from the client).

---

## Dashboard Shell

**Sidebar (56px collapsed, 220px expanded on hover):**
- Dark background (`#0f172a`)
- Logo icon at top
- Nav items with icon + label (label hidden when collapsed): Dashboard, Campaigns, Automations, Contacts, Analytics, Integrations, Settings
- Divider before Integrations + Settings
- User avatar + name + org at bottom
- Active item highlighted in blue

**Top bar (56px height):**
- Current page title (left)
- Notifications bell icon (right)
- User avatar (right, opens profile dropdown)

**Dashboard home page:**
- Greeting: "Good morning, {name} 👋"
- Sub-heading: org name
- 4 KPI cards: Total Campaigns, Emails Sent, Contacts, Quick Start CTA
- Empty state card with "Create Campaign" + "Import Contacts" CTAs
- All KPI values are 0 / placeholder until later sub-projects populate them

**Non-dashboard nav items** (Campaigns, Automations, Contacts, Analytics, Integrations, Settings) render a placeholder page: "Coming soon" with page title. Built out in subsequent sub-projects.

---

## What Is Explicitly Out of Scope

- Billing / subscription management (sub-project 1b)
- Campaign creation or sending (sub-project 3)
- Contact management (sub-project 2)
- Email templates (sub-project 3)
- Team invite UI beyond DB schema (sub-project 9)
- Dark mode (deferred — not blocking launch)
- Microsoft OAuth (deferred — Google covers 90% of use case)
