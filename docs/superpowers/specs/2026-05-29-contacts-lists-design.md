# Contacts & Lists — Design Spec

**Date:** 2026-05-29
**Sub-project:** 2 of 9 (Email Marketing SaaS Platform)
**Scope:** Contact management, lists, tags, custom fields, CSV import, manual add/edit. No email sending.
**Email provider note:** Brevo (brevo.com) free tier (300 emails/day) will be used in sub-project 3 (Campaign Builder) and sub-project 4 (Automations) for sending and automation.

---

## Stack

Builds on Foundation (sub-project 1). Same stack: Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase, shadcn/ui. Adds:

| Addition | Purpose |
|---|---|
| `papaparse` | Client-side CSV parsing |
| `@tanstack/react-table` | Headless data table (sorting, pagination, column visibility) |

---

## Database Schema

Migration file: `supabase/migrations/002_contacts.sql`

```sql
-- Core contact record
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null,
  first_name      text not null default '',
  last_name       text not null default '',
  phone           text,
  company         text,
  status          text not null default 'active'
                  check (status in ('active', 'unsubscribed', 'bounced')),
  custom_fields   jsonb not null default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (organization_id, email)
);

-- Named lists
create table public.lists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  contact_count   integer not null default 0,
  created_at      timestamptz default now()
);

-- Contact ↔ List junction
create table public.contact_lists (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  list_id    uuid not null references public.lists(id) on delete cascade,
  added_at   timestamptz default now(),
  primary key (contact_id, list_id)
);

-- Org-scoped tags
create table public.tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  color           text not null default '#6b7280',
  created_at      timestamptz default now(),
  unique (organization_id, name)
);

-- Contact ↔ Tag junction
create table public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- Custom field definitions (schema for JSONB on contacts)
create table public.custom_field_definitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  field_key       text not null,
  label           text not null,
  field_type      text not null default 'text'
                  check (field_type in ('text', 'number', 'date', 'dropdown')),
  options         jsonb,
  created_at      timestamptz default now(),
  unique (organization_id, field_key)
);
```

**Triggers:**
- `updated_at` on `contacts` — auto-updated on every row change
- `contact_count` on `lists` — trigger on `contact_lists` INSERT/DELETE increments/decrements `lists.contact_count`

**Indexes:**
- `contacts(organization_id, email)` — unique index (duplicate detection)
- `contacts(organization_id, status)` — fast status filtering
- `contacts(organization_id, created_at DESC)` — default sort

**RLS:** All tables use `organization_id = current_org_id()` policy (same helper as Foundation).

---

## Page Architecture

### File Structure

```
app/(dashboard)/contacts/
├── page.tsx                    # Contacts list page (Server Component)
├── loading.tsx                 # Skeleton loader
└── [id]/
    └── page.tsx                # (Unused — detail shown in drawer)

app/(dashboard)/lists/
├── page.tsx                    # Lists management page
└── [id]/page.tsx               # Contacts filtered by list

components/contacts/
├── ContactsTable.tsx           # TanStack table with sorting, pagination
├── ContactsToolbar.tsx         # Search, filter, sort, column toggle
├── ContactDrawer.tsx           # Add/Edit/View slide-over drawer
├── ContactForm.tsx             # Form inside drawer (shared add/edit)
├── BulkActionBar.tsx           # Appears when rows are checked
├── ListsSidebar.tsx            # Left panel: lists nav + tag filters
├── ImportModal.tsx             # 3-step CSV import wizard
├── ImportColumnMapper.tsx      # Step 2: column → field mapping UI
└── TagPicker.tsx               # Multi-select tag input (shared)

lib/contacts/
├── actions.ts                  # Server Actions: createContact, updateContact, deleteContacts, importContacts
├── queries.ts                  # Supabase query helpers: getContacts, getContact, getLists, getTags
└── csv.ts                      # CSV parsing + validation helpers (uses papaparse)
```

---

## Contacts Page Layout

**Left panel (180px fixed):**
- "All Contacts" item with total count — always first, selected by default
- Org's lists with contact_count badge
- "+ New list" button (inline creation)
- Tags section with colored chips — clicking filters table to contacts with that tag
- "+ New tag" button (inline creation)

**Main area:**
- **Page header:** "Contacts" title + total/active count + "Import CSV" button + "+ Add Contact" button
- **Toolbar:** search input, Filter button, Sort button, Columns button
- **Bulk action bar:** appears above table when ≥1 row checked — shows "N selected" + Add to list / Add tag / Delete actions
- **Data table:** checkbox, Name (avatar initials + full name), Email, Tags, Status badge, Added date, ⋯ row menu
- **Pagination:** "Showing X–Y of Z" + prev/next buttons (50 contacts per page)

**Table interactions:**
- Column headers are sortable (click to sort asc/desc)
- Row click → opens ContactDrawer in view mode
- Row ⋯ menu → Edit / Add to list / Delete
- Checking rows → BulkActionBar appears

---

## Contact Drawer (Add / Edit / View)

Single `ContactDrawer` component with three modes controlled by a `mode` prop: `'add' | 'edit' | 'view'`.

**View mode:**
- Header: avatar initials, full name, email, status badge, ✕ close
- Placeholder engagement stats: emails received, open rate, click rate (all 0 — populated in sub-project 3)
- All standard + custom fields listed as label/value pairs
- Lists chips + Tags chips
- "Edit contact" button → switches to edit mode

**Add / Edit mode:**
- Section: Contact Info — first name, last name, email (required), phone, company
- Section: Lists & Tags — multi-select list picker, tag picker with color chips
- Section: Custom Fields — rendered dynamically from `custom_field_definitions` per org
- Actions: Save / Cancel

---

## CSV Import (3-step Wizard)

**Step 1 — Upload:**
- Drag-and-drop zone + click-to-browse (accepts `.csv` only, max 10MB)
- "Download sample CSV template" link
- PapaParse reads file client-side on drop/select — no upload yet

**Step 2 — Map Columns:**
- Auto-detect common column names (case-insensitive): "email", "first name", "last_name", "phone", "company", etc.
- Show CSV column → Contact field mapping table
- Unmapped columns can be assigned to existing custom fields or skipped
- "Back" button returns to Step 1

**Step 3 — Confirm:**
- Summary: total rows / valid / duplicates / invalid emails
- "Add to list" optional dropdown (select existing list or type to create)
- "Skip duplicates (update existing contacts)" checkbox — checked by default
- "Import N contacts" button triggers server action
- On success → drawer closes, table refreshes with new count

**Import server action logic:**
1. Validate all rows (email format, required fields)
2. Check duplicates: `SELECT email FROM contacts WHERE organization_id = $1 AND email = ANY($2)`
3. Bulk insert valid non-duplicate rows via `supabase.from('contacts').insert(rows)`
4. If "update duplicates" checked: upsert instead of insert
5. If list selected: bulk insert into `contact_lists`
6. Return `{ inserted, updated, skipped, errors }`

---

## Lists Management

Route: `/lists` — separate page from contacts.

- Table of org's lists: name, description, contact count, created date, actions
- Click list name → `/lists/[id]` which renders `ContactsTable` filtered to that list
- Create list: inline name input on the page (no modal needed)
- Delete list: removes list + all `contact_lists` rows (contacts themselves are NOT deleted)

---

## Custom Fields

Managed in Settings (sub-project settings page — placeholder for now). Schema stored in `custom_field_definitions`. For this sub-project:

- Custom fields render in ContactForm from `custom_field_definitions` queried per org
- JSONB on contacts stores `{ field_key: value }` — no validation at DB level, validated in server action
- Field types: `text` (input), `number` (number input), `date` (date picker), `dropdown` (select from `options` array)

---

## What Is Explicitly Out of Scope

- Email sending or campaign assignment (sub-project 3)
- Engagement stats on contact detail (sub-project 3)
- Advanced segment builder with dynamic rules (sub-project 5 — Analytics)
- Contact activity timeline / history (sub-project 3)
- CRM pipeline / deals (not planned)
- Brevo API integration (sub-project 3)
- Custom fields Settings UI (sub-project settings — basic CRUD via Supabase dashboard for now)
