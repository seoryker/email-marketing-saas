# Landing Pages & Forms (Sub-project 6) — Design Spec

**Date:** 2026-05-29
**Sub-project:** 6 of 9
**Scope:** Unlayer-powered landing page builder, published pages served at `/p/[id]` (public iframe embed), form submission → contact creation, embed code modal.

---

## Stack

No new dependencies. Reuses `react-email-editor` (Unlayer) already installed from sub-project 3a.

---

## Database Schema

Migration: `supabase/migrations/007_landing_pages.sql`

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

-- Increment submission_count on insert
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

---

## File Structure

```
app/(dashboard)/landing-pages/
├── page.tsx                        # Pages list (Server Component)
└── [id]/
    ├── page.tsx                    # Redirect → /[id]/edit
    └── edit/
        ├── page.tsx                # Builder Server Component shell
        └── PageBuilderClient.tsx   # Unlayer canvas + toolbar (reuse email builder pattern)

app/p/
└── [slug]/
    └── page.tsx                    # Public page: renders content_html + form handler

app/api/
└── forms/
    └── [slug]/
        └── route.ts                # POST: create contact + page_submission

components/landing-pages/
├── LandingPagesList.tsx            # Table: name, status, submissions, embed/edit
└── EmbedModal.tsx                  # Shows iframe code + recent submissions
```

---

## Page Architecture

### Landing Pages List (`/landing-pages`)

Server Component. Shows table of all landing pages.

**Table columns:** Name, Status badge (draft=grey, published=green), Submissions count, Created date, action buttons: Edit / Embed / Delete.

**Empty state:** Icon + "No pages yet" + "+ Create your first landing page" CTA.

### Page Builder (`/landing-pages/[id]/edit`)

Full-screen Unlayer builder — identical pattern to campaign builder (`/campaigns/[id]/edit`). Reuses `EmailBuilder`, `BuilderToolbar` component patterns.

**Toolbar differences from email builder:**
- "Publish" button (green) instead of "Next: Recipients →"
- Publish toggles `status` between `draft` and `published`
- "Get Embed →" button opens `EmbedModal`
- Status bar shows: Submissions count, Last submission time

**Unlayer options for landing pages:**
```typescript
options={{
  displayMode: 'web',  // web mode instead of email mode
  locale: 'en-US',
  mergeTags: {},  // no merge tags for landing pages
  features: { textEditor: { cleanPaste: true } },
}}
```

### Public Page (`/p/[slug]`)

**No auth required.** Fetches the landing page by slug, renders `content_html` inside a minimal HTML shell (no dashboard sidebar/header). Adds a `<script>` that intercepts the form submit and POSTs to `/api/forms/[slug]` via `fetch`.

```typescript
// Injected script
<script>{`
  document.querySelector('form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await fetch('/api/forms/${slug}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    e.target.innerHTML = '<p style="text-align:center;padding:20px;font-size:16px">✅ Thank you!</p>';
  });
`}</script>
```

If `status !== 'published'` → return 404.

### Form Submission API (`/api/forms/[slug]`)

POST handler — no auth required (public endpoint):
1. Fetch landing page by slug, verify `status === 'published'`
2. Extract `email`, `name` (or `first_name`/`last_name`) from submitted form data
3. If email present: upsert contact in `contacts` table for the page's org
4. If `add_to_list_id` set on the page: add contact to that list
5. Insert `page_submissions` row with contact_id + raw form data
6. Return `{ ok: true }`

### Embed Modal

Client component opened by "Get Embed →" toolbar button. Shows:
- iframe embed code (pre-filled with `https://[host]/p/[slug]`)
- "Copy" button
- Recent submissions (last 5 — fetched from `page_submissions` joined with contacts)

---

## What Is Explicitly Out of Scope

- Popup builder (inline modal triggered by scroll/exit intent)
- Custom domain for pages (`pages.yourdomain.com`)
- A/B testing landing pages
- Analytics/heatmaps on landing pages
- Multi-step forms / conditional logic in forms
- Payment collection on landing pages
