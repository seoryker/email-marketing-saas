# Contacts & Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build full contact management — data table, lists, tags, custom fields, CSV import, and manual add/edit — on top of the Foundation auth/shell.

**Architecture:** Server Components fetch data (contacts, lists, tags) and pass to Client Components. URL search params drive pagination/filtering so views are shareable. Server Actions handle all mutations. TanStack Table v8 powers the data grid client-side.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, TanStack Table v8, PapaParse, Tailwind CSS, shadcn/ui

---

## File Map

| File | Responsibility |
|---|---|
| `lib/contacts/types.ts` | Shared TypeScript types for all contact entities |
| `lib/contacts/queries.ts` | Server-side Supabase read helpers |
| `lib/contacts/actions.ts` | Server Actions: CRUD, import, list/tag management |
| `lib/contacts/csv.ts` | Pure CSV parse/validate/map helpers (PapaParse) |
| `supabase/migrations/002_contacts.sql` | Schema, triggers, indexes, RLS |
| `components/contacts/TagPicker.tsx` | Multi-select tag chips input |
| `components/contacts/ListsSidebar.tsx` | Left panel: lists nav + tag filter chips |
| `components/contacts/ContactsTable.tsx` | TanStack Table with sort, pagination, row select |
| `components/contacts/ContactsToolbar.tsx` | Search input + Filter/Sort/Columns buttons |
| `components/contacts/BulkActionBar.tsx` | Appears when rows selected: bulk actions |
| `components/contacts/ContactForm.tsx` | Add/edit form (standard + custom fields) |
| `components/contacts/ContactDrawer.tsx` | Slide-over: view / add / edit modes |
| `components/contacts/ImportColumnMapper.tsx` | Step 2 of import: CSV col → field mapping |
| `components/contacts/ImportModal.tsx` | 3-step CSV import wizard |
| `app/(dashboard)/contacts/page.tsx` | Server Component: fetches + passes to client |
| `app/(dashboard)/contacts/loading.tsx` | Skeleton loader |
| `app/(dashboard)/lists/page.tsx` | Lists management page |
| `app/(dashboard)/lists/[id]/page.tsx` | Contacts filtered by list |

---

## Task 1: Dependencies + Shared Types

**Files:**
- Modify: `package.json`
- Create: `lib/contacts/types.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/poledilip/email-marketing-saas
npm install papaparse @tanstack/react-table
npm install -D @types/papaparse
```

- [ ] **Step 2: Create shared types**

Create `lib/contacts/types.ts`:
```typescript
export type ContactStatus = 'active' | 'unsubscribed' | 'bounced'

export type Contact = {
  id: string
  organization_id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  company: string | null
  status: ContactStatus
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ContactWithRelations = Contact & {
  tags: Tag[]
  lists: List[]
}

export type List = {
  id: string
  organization_id: string
  name: string
  description: string | null
  contact_count: number
  created_at: string
}

export type Tag = {
  id: string
  organization_id: string
  name: string
  color: string
  created_at: string
}

export type CustomFieldDefinition = {
  id: string
  organization_id: string
  field_key: string
  label: string
  field_type: 'text' | 'number' | 'date' | 'dropdown'
  options: string[] | null
  created_at: string
}

export type ImportResult = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export type ContactsFilter = {
  search?: string
  list_id?: string
  tag_id?: string
  status?: ContactStatus
  page?: number
  sort?: string
  order?: 'asc' | 'desc'
}

export type ContactsPage = {
  contacts: ContactWithRelations[]
  total: number
  page: number
  per_page: number
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add package.json package-lock.json lib/contacts/types.ts
git commit -m "feat: add contacts deps and shared types"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/002_contacts.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/002_contacts.sql`:
```sql
-- contacts
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

-- lists
create table public.lists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  contact_count   integer not null default 0,
  created_at      timestamptz default now()
);

-- contact ↔ list
create table public.contact_lists (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  list_id    uuid not null references public.lists(id) on delete cascade,
  added_at   timestamptz default now(),
  primary key (contact_id, list_id)
);

-- tags
create table public.tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  color           text not null default '#6b7280',
  created_at      timestamptz default now(),
  unique (organization_id, name)
);

-- contact ↔ tag
create table public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- custom field definitions
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

-- updated_at trigger for contacts
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- contact_count trigger on lists
create or replace function public.update_list_contact_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.lists set contact_count = contact_count + 1 where id = new.list_id;
  elsif TG_OP = 'DELETE' then
    update public.lists set contact_count = greatest(contact_count - 1, 0) where id = old.list_id;
  end if;
  return null;
end;
$$;

create trigger contact_lists_count
  after insert or delete on public.contact_lists
  for each row execute function public.update_list_contact_count();

-- indexes
create index on public.contacts(organization_id, status);
create index on public.contacts(organization_id, created_at desc);

-- RLS
alter table public.contacts enable row level security;
alter table public.lists enable row level security;
alter table public.contact_lists enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.custom_field_definitions enable row level security;

create policy "org members can manage contacts"
  on public.contacts for all
  using (organization_id = public.current_org_id());

create policy "org members can manage lists"
  on public.lists for all
  using (organization_id = public.current_org_id());

create policy "org members can manage contact_lists"
  on public.contact_lists for all
  using (
    exists (select 1 from public.contacts where id = contact_id and organization_id = public.current_org_id())
  );

create policy "org members can manage tags"
  on public.tags for all
  using (organization_id = public.current_org_id());

create policy "org members can manage contact_tags"
  on public.contact_tags for all
  using (
    exists (select 1 from public.contacts where id = contact_id and organization_id = public.current_org_id())
  );

create policy "org members can manage custom field definitions"
  on public.custom_field_definitions for all
  using (organization_id = public.current_org_id());
```

- [ ] **Step 2: Apply in Supabase dashboard**

Go to your Supabase project → SQL Editor → paste the full contents of `002_contacts.sql` → Run.

Verify in Table Editor: `contacts`, `lists`, `contact_lists`, `tags`, `contact_tags`, `custom_field_definitions` all exist.

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add supabase/migrations/002_contacts.sql
git commit -m "feat: add contacts schema, triggers, indexes, RLS"
```

---

## Task 3: CSV Helpers (TDD)

**Files:**
- Create: `lib/contacts/csv.ts`
- Create: `lib/contacts/__tests__/csv.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/contacts/__tests__/csv.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { autoDetectColumns, isValidEmail, applyMapping } from '../csv'
import type { ColumnMapping, ParsedRow } from '../csv'

describe('autoDetectColumns', () => {
  it('detects email column', () => {
    const result = autoDetectColumns(['Email Address', 'Name'])
    expect(result[0].contact_field).toBe('email')
  })

  it('detects first_name column', () => {
    const result = autoDetectColumns(['First Name'])
    expect(result[0].contact_field).toBe('first_name')
  })

  it('returns null for unknown columns', () => {
    const result = autoDetectColumns(['Favourite Color'])
    expect(result[0].contact_field).toBeNull()
  })
})

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejects email without @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })
})

describe('applyMapping', () => {
  const rows: ParsedRow[] = [
    { 'Email': 'a@test.com', 'Name': 'Alice' },
    { 'Email': 'invalid', 'Name': 'Bob' },
  ]
  const mapping: ColumnMapping[] = [
    { csv_column: 'Email', contact_field: 'email' },
    { csv_column: 'Name', contact_field: null },
  ]

  it('maps valid rows', () => {
    const { valid } = applyMapping(rows, mapping)
    expect(valid).toHaveLength(1)
    expect(valid[0].email).toBe('a@test.com')
  })

  it('counts invalid emails', () => {
    const { invalidEmails } = applyMapping(rows, mapping)
    expect(invalidEmails).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/contacts/__tests__/csv.test.ts
```
Expected: FAIL — `csv` module not found

- [ ] **Step 3: Create csv.ts**

Create `lib/contacts/csv.ts`:
```typescript
import Papa from 'papaparse'

export type ParsedRow = Record<string, string>

export type MappedContact = {
  email: string
  first_name: string
  last_name: string
  phone?: string
  company?: string
  custom_fields?: Record<string, unknown>
}

export type ColumnMapping = {
  csv_column: string
  contact_field: string | null
}

const FIELD_ALIASES: Record<string, string> = {
  'email': 'email',
  'email address': 'email',
  'e-mail': 'email',
  'first name': 'first_name',
  'firstname': 'first_name',
  'first_name': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'last_name': 'last_name',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'company': 'company',
  'organisation': 'company',
  'organization': 'company',
}

export function parseCSV(file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data as ParsedRow[],
        })
      },
      error: reject,
    })
  })
}

export function autoDetectColumns(headers: string[]): ColumnMapping[] {
  return headers.map((col) => ({
    csv_column: col,
    contact_field: FIELD_ALIASES[col.toLowerCase()] ?? null,
  }))
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function applyMapping(
  rows: ParsedRow[],
  mapping: ColumnMapping[],
  customFieldKeys: string[] = []
): { valid: MappedContact[]; invalidEmails: number } {
  const valid: MappedContact[] = []
  let invalidEmails = 0

  for (const row of rows) {
    const contact: MappedContact = {
      email: '',
      first_name: '',
      last_name: '',
      custom_fields: {},
    }

    for (const { csv_column, contact_field } of mapping) {
      if (!contact_field) continue
      const value = (row[csv_column] ?? '').trim()
      if (contact_field === 'email') contact.email = value
      else if (contact_field === 'first_name') contact.first_name = value
      else if (contact_field === 'last_name') contact.last_name = value
      else if (contact_field === 'phone') contact.phone = value
      else if (contact_field === 'company') contact.company = value
      else if (customFieldKeys.includes(contact_field)) {
        contact.custom_fields![contact_field] = value
      }
    }

    if (!contact.email || !isValidEmail(contact.email)) {
      invalidEmails++
      continue
    }
    valid.push(contact)
  }

  return { valid, invalidEmails }
}

export function generateSampleCSV(): string {
  return Papa.unparse([
    { 'First Name': 'Alice', 'Last Name': 'Smith', 'Email': 'alice@example.com', 'Phone': '+1 555 0100', 'Company': 'Acme Inc' },
    { 'First Name': 'Bob', 'Last Name': 'Jones', 'Email': 'bob@example.com', 'Phone': '', 'Company': '' },
  ])
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/contacts/__tests__/csv.test.ts
```
Expected: PASS — 7 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/contacts/csv.ts lib/contacts/__tests__/csv.test.ts
git commit -m "feat: add CSV parse/map helpers"
```

---

## Task 4: Server Queries

**Files:**
- Create: `lib/contacts/queries.ts`

- [ ] **Step 1: Create queries.ts**

Create `lib/contacts/queries.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import type {
  ContactsFilter, ContactsPage, ContactWithRelations,
  List, Tag, CustomFieldDefinition
} from './types'

export const PER_PAGE = 50

export async function getContacts(filter: ContactsFilter = {}): Promise<ContactsPage> {
  const supabase = await createClient()
  const { search, list_id, tag_id, status, page = 1, sort = 'created_at', order = 'desc' } = filter

  let query = supabase
    .from('contacts')
    .select(
      '*, tags:contact_tags(tag:tags(*)), lists:contact_lists(list:lists(*))',
      { count: 'exact' }
    )
    .order(sort, { ascending: order === 'asc' })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  if (search) {
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    )
  }
  if (status) query = query.eq('status', status)
  if (list_id) {
    const { data: ids } = await supabase
      .from('contact_lists').select('contact_id').eq('list_id', list_id)
    query = query.in('id', (ids ?? []).map((r: { contact_id: string }) => r.contact_id))
  }
  if (tag_id) {
    const { data: ids } = await supabase
      .from('contact_tags').select('contact_id').eq('tag_id', tag_id)
    query = query.in('id', (ids ?? []).map((r: { contact_id: string }) => r.contact_id))
  }

  const { data, count, error } = await query
  if (error) throw error

  const contacts: ContactWithRelations[] = (data ?? []).map((c: any) => ({
    ...c,
    tags: (c.tags ?? []).map((t: any) => t.tag).filter(Boolean),
    lists: (c.lists ?? []).map((l: any) => l.list).filter(Boolean),
  }))

  return { contacts, total: count ?? 0, page, per_page: PER_PAGE }
}

export async function getContact(id: string): Promise<ContactWithRelations | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('*, tags:contact_tags(tag:tags(*)), lists:contact_lists(list:lists(*))')
    .eq('id', id)
    .single()
  if (error) return null
  return {
    ...data,
    tags: (data.tags ?? []).map((t: any) => t.tag).filter(Boolean),
    lists: (data.lists ?? []).map((l: any) => l.list).filter(Boolean),
  }
}

export async function getLists(): Promise<List[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('lists').select('*').order('name')
  return data ?? []
}

export async function getTags(): Promise<Tag[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('tags').select('*').order('name')
  return data ?? []
}

export async function getCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('custom_field_definitions').select('*').order('label')
  return data ?? []
}

export async function getTotalContactCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('contacts').select('*', { count: 'exact', head: true })
  return count ?? 0
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/contacts/queries.ts
git commit -m "feat: add contact server queries"
```

---

## Task 5: Server Actions

**Files:**
- Create: `lib/contacts/actions.ts`

- [ ] **Step 1: Create actions.ts**

Create `lib/contacts/actions.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ContactStatus, ImportResult } from './types'

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile) throw new Error('Profile not found')
  return profile.organization_id
}

export async function createContact(input: {
  email: string
  first_name: string
  last_name: string
  phone?: string
  company?: string
  custom_fields?: Record<string, unknown>
  list_ids?: string[]
  tag_ids?: string[]
}) {
  const supabase = await createClient()
  const org_id = await getOrgId()

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      organization_id: org_id,
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone ?? null,
      company: input.company ?? null,
      custom_fields: input.custom_fields ?? {},
    })
    .select().single()

  if (error) throw new Error(error.message)

  if (input.list_ids?.length) {
    await supabase.from('contact_lists').insert(
      input.list_ids.map(list_id => ({ contact_id: contact.id, list_id }))
    )
  }
  if (input.tag_ids?.length) {
    await supabase.from('contact_tags').insert(
      input.tag_ids.map(tag_id => ({ contact_id: contact.id, tag_id }))
    )
  }

  revalidatePath('/contacts')
  return contact
}

export async function updateContact(id: string, input: {
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
  company?: string | null
  status?: ContactStatus
  custom_fields?: Record<string, unknown>
  list_ids?: string[]
  tag_ids?: string[]
}) {
  const supabase = await createClient()
  const { list_ids, tag_ids, ...fields } = input

  if (Object.keys(fields).length) {
    const { error } = await supabase.from('contacts').update(fields).eq('id', id)
    if (error) throw new Error(error.message)
  }

  if (list_ids !== undefined) {
    await supabase.from('contact_lists').delete().eq('contact_id', id)
    if (list_ids.length) {
      await supabase.from('contact_lists').insert(
        list_ids.map(list_id => ({ contact_id: id, list_id }))
      )
    }
  }

  if (tag_ids !== undefined) {
    await supabase.from('contact_tags').delete().eq('contact_id', id)
    if (tag_ids.length) {
      await supabase.from('contact_tags').insert(
        tag_ids.map(tag_id => ({ contact_id: id, tag_id }))
      )
    }
  }

  revalidatePath('/contacts')
}

export async function deleteContacts(ids: string[]) {
  const supabase = await createClient()
  const { error } = await supabase.from('contacts').delete().in('id', ids)
  if (error) throw new Error(error.message)
  revalidatePath('/contacts')
}

export async function importContacts(
  rows: Array<{
    email: string
    first_name: string
    last_name: string
    phone?: string
    company?: string
    custom_fields?: Record<string, unknown>
  }>,
  options: { list_id?: string; update_duplicates?: boolean }
): Promise<ImportResult> {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const emails = rows.map(r => r.email)

  const { data: existing } = await supabase
    .from('contacts').select('id, email')
    .eq('organization_id', org_id).in('email', emails)

  const existingMap = new Map((existing ?? []).map((c: any) => [c.email, c.id]))
  const existingEmails = new Set(existingMap.keys())

  const toInsert = rows.filter(r => !existingEmails.has(r.email))
  const toUpdate = rows.filter(r => existingEmails.has(r.email))

  let inserted = 0, updated = 0, skipped = 0
  const errors: string[] = []

  if (toInsert.length) {
    const { error } = await supabase.from('contacts').insert(
      toInsert.map(r => ({
        organization_id: org_id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone ?? null,
        company: r.company ?? null,
        custom_fields: r.custom_fields ?? {},
      }))
    )
    if (error) errors.push(error.message)
    else inserted = toInsert.length
  }

  if (options.update_duplicates && toUpdate.length) {
    for (const r of toUpdate) {
      const { error } = await supabase.from('contacts')
        .update({ first_name: r.first_name, last_name: r.last_name, phone: r.phone ?? null, company: r.company ?? null })
        .eq('id', existingMap.get(r.email))
      if (error) errors.push(error.message)
      else updated++
    }
  } else {
    skipped = toUpdate.length
  }

  if (options.list_id && inserted > 0) {
    const { data: newContacts } = await supabase
      .from('contacts').select('id')
      .eq('organization_id', org_id)
      .in('email', toInsert.map(r => r.email))
    if (newContacts?.length) {
      await supabase.from('contact_lists').insert(
        newContacts.map((c: any) => ({ contact_id: c.id, list_id: options.list_id }))
      )
    }
  }

  revalidatePath('/contacts')
  return { inserted, updated, skipped, errors }
}

export async function createList(name: string) {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const { data, error } = await supabase
    .from('lists').insert({ organization_id: org_id, name }).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/contacts')
  revalidatePath('/lists')
  return data
}

export async function deleteList(id: string) {
  const supabase = await createClient()
  await supabase.from('lists').delete().eq('id', id)
  revalidatePath('/contacts')
  revalidatePath('/lists')
}

export async function createTag(name: string, color: string) {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const { data, error } = await supabase
    .from('tags').insert({ organization_id: org_id, name, color }).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/contacts')
  return data
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/contacts/actions.ts
git commit -m "feat: add contact server actions"
```

---

## Task 6: TagPicker Component

**Files:**
- Create: `components/contacts/TagPicker.tsx`
- Create: `components/contacts/__tests__/TagPicker.test.tsx`

- [ ] **Step 1: Write failing test**

Create `components/contacts/__tests__/TagPicker.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagPicker from '../TagPicker'
import type { Tag } from '@/lib/contacts/types'

const tags: Tag[] = [
  { id: '1', organization_id: 'org', name: 'vip', color: '#f59e0b', created_at: '' },
  { id: '2', organization_id: 'org', name: 'india', color: '#10b981', created_at: '' },
]

describe('TagPicker', () => {
  it('shows placeholder when nothing selected', () => {
    render(<TagPicker tags={tags} selected={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/select tags/i)).toBeInTheDocument()
  })

  it('shows selected tag chips', () => {
    render(<TagPicker tags={tags} selected={['1']} onChange={vi.fn()} />)
    expect(screen.getByText('vip')).toBeInTheDocument()
  })

  it('opens dropdown on click', async () => {
    const user = userEvent.setup()
    render(<TagPicker tags={tags} selected={[]} onChange={vi.fn()} />)
    await user.click(screen.getByText(/select tags/i))
    expect(screen.getByPlaceholderText(/search tags/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/contacts/__tests__/TagPicker.test.tsx
```
Expected: FAIL — module not found

- [ ] **Step 3: Create TagPicker component**

Create `components/contacts/TagPicker.tsx`:
```typescript
'use client'

import { useState } from 'react'
import type { Tag } from '@/lib/contacts/types'

type Props = {
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export default function TagPicker({ tags, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = tags.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string) {
    onChange(selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id])
  }

  const selectedTags = tags.filter(t => selected.includes(t.id))

  return (
    <div className="relative">
      <div
        className="min-h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 cursor-pointer flex flex-wrap gap-1 items-center"
        onClick={() => setOpen(o => !o)}
      >
        {selectedTags.length === 0 && (
          <span className="text-sm text-muted-foreground">Select tags...</span>
        )}
        {selectedTags.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: `${tag.color}25`, color: tag.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tag.color }} />
            {tag.name}
            <button
              type="button"
              className="ml-0.5 hover:opacity-70 leading-none"
              onClick={e => { e.stopPropagation(); toggle(tag.id) }}
            >×</button>
          </span>
        ))}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <div className="p-2 border-b">
              <input
                autoFocus
                className="w-full rounded border px-2 py-1 text-sm outline-none focus:border-blue-500"
                placeholder="Search tags..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>
            <div className="max-h-48 overflow-auto p-1">
              {filtered.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags found</p>
              )}
              {filtered.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={() => { toggle(tag.id); setSearch('') }}
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                  {tag.name}
                  {selected.includes(tag.id) && (
                    <span className="ml-auto text-blue-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/contacts/__tests__/TagPicker.test.tsx
```
Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/contacts/TagPicker.tsx components/contacts/__tests__/TagPicker.test.tsx
git commit -m "feat: add TagPicker component"
```

---

## Task 7: ListsSidebar

**Files:**
- Create: `components/contacts/ListsSidebar.tsx`

- [ ] **Step 1: Create ListsSidebar**

Create `components/contacts/ListsSidebar.tsx`:
```typescript
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createList, createTag } from '@/lib/contacts/actions'
import type { List, Tag } from '@/lib/contacts/types'

const TAG_COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

type Props = {
  lists: List[]
  tags: Tag[]
  totalCount: number
}

export default function ListsSidebar({ lists, tags, totalCount }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const activeListId = searchParams.get('list_id')
  const activeTagId = searchParams.get('tag_id')

  const [addingList, setAddingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('list_id')
    params.delete('tag_id')
    params.delete('page')
    if (value) params.set(key, value)
    router.push(`/contacts?${params.toString()}`)
  }

  async function handleCreateList() {
    if (!newListName.trim()) return
    startTransition(async () => {
      await createList(newListName.trim())
      setNewListName('')
      setAddingList(false)
    })
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return
    startTransition(async () => {
      await createTag(newTagName.trim(), newTagColor)
      setNewTagName('')
      setAddingTag(false)
    })
  }

  return (
    <aside className="w-44 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
      {/* Lists */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lists</p>

      <button
        onClick={() => setFilter('list_id', null)}
        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs mb-0.5 ${
          !activeListId && !activeTagId
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        <span>All Contacts</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${!activeListId && !activeTagId ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
          {totalCount}
        </span>
      </button>

      {lists.map(list => (
        <button
          key={list.id}
          onClick={() => setFilter('list_id', list.id)}
          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs mb-0.5 ${
            activeListId === list.id
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="truncate">{list.name}</span>
          <span className="ml-1 text-slate-400 text-[10px]">{list.contact_count}</span>
        </button>
      ))}

      {addingList ? (
        <div className="mt-1 flex gap-1">
          <input
            autoFocus
            className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
            placeholder="List name"
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateList(); if (e.key === 'Escape') setAddingList(false) }}
          />
        </div>
      ) : (
        <button
          onClick={() => setAddingList(true)}
          className="mt-1 w-full text-left px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
        >
          + New list
        </button>
      )}

      {/* Tags */}
      <p className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tags</p>

      <div className="flex flex-wrap gap-1">
        {tags.map(tag => (
          <button
            key={tag.id}
            onClick={() => setFilter('tag_id', activeTagId === tag.id ? null : tag.id)}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border transition-opacity"
            style={{
              background: activeTagId === tag.id ? `${tag.color}25` : '#f8fafc',
              borderColor: activeTagId === tag.id ? tag.color : '#e2e8f0',
              color: activeTagId === tag.id ? tag.color : '#475569',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
      </div>

      {addingTag ? (
        <div className="mt-2 space-y-1">
          <input
            autoFocus
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
            placeholder="Tag name"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setAddingTag(false) }}
          />
          <div className="flex gap-1">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewTagColor(c)}
                className="h-4 w-4 rounded-full border-2"
                style={{ background: c, borderColor: newTagColor === c ? '#0f172a' : 'transparent' }}
              />
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingTag(true)}
          className="mt-1 w-full text-left px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
        >
          + New tag
        </button>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/contacts/ListsSidebar.tsx
git commit -m "feat: add ListsSidebar component"
```

---

## Task 8: ContactsTable + BulkActionBar

**Files:**
- Create: `components/contacts/ContactsTable.tsx`
- Create: `components/contacts/BulkActionBar.tsx`
- Create: `components/contacts/__tests__/ContactsTable.test.tsx`

- [ ] **Step 1: Write failing test**

Create `components/contacts/__tests__/ContactsTable.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContactsTable from '../ContactsTable'
import type { ContactWithRelations } from '@/lib/contacts/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/contacts',
}))

const contacts: ContactWithRelations[] = [
  {
    id: '1', organization_id: 'org', email: 'alice@test.com',
    first_name: 'Alice', last_name: 'Smith', phone: null, company: null,
    status: 'active', custom_fields: {}, created_at: '2026-05-01', updated_at: '2026-05-01',
    tags: [], lists: [],
  },
]

describe('ContactsTable', () => {
  it('renders contact email', () => {
    render(
      <ContactsTable
        contacts={contacts}
        total={1}
        page={1}
        onSelect={vi.fn()}
        selected={[]}
        onOpenDrawer={vi.fn()}
      />
    )
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
  })

  it('renders contact name', () => {
    render(
      <ContactsTable
        contacts={contacts}
        total={1}
        page={1}
        onSelect={vi.fn()}
        selected={[]}
        onOpenDrawer={vi.fn()}
      />
    )
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/contacts/__tests__/ContactsTable.test.tsx
```
Expected: FAIL — module not found

- [ ] **Step 3: Create BulkActionBar**

Create `components/contacts/BulkActionBar.tsx`:
```typescript
'use client'

import { useTransition } from 'react'
import { deleteContacts } from '@/lib/contacts/actions'
import type { List, Tag } from '@/lib/contacts/types'

type Props = {
  selectedIds: string[]
  lists: List[]
  tags: Tag[]
  onClear: () => void
}

export default function BulkActionBar({ selectedIds, lists, tags, onClear }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(`Delete ${selectedIds.length} contact(s)? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteContacts(selectedIds)
      onClear()
    })
  }

  if (selectedIds.length === 0) return null

  return (
    <div className="flex items-center gap-3 border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs">
      <span className="font-medium text-blue-700">{selectedIds.length} selected</span>
      <div className="h-3.5 w-px bg-blue-200" />
      <button className="text-blue-600 hover:underline">Add to list</button>
      <button className="text-blue-600 hover:underline">Add tag</button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-red-600 hover:underline disabled:opacity-50"
      >
        Delete
      </button>
      <button onClick={onClear} className="ml-auto text-slate-500 hover:text-slate-700">
        Clear selection
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Create ContactsTable**

Create `components/contacts/ContactsTable.tsx`:
```typescript
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { PER_PAGE } from '@/lib/contacts/queries'
import type { ContactWithRelations } from '@/lib/contacts/types'

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  unsubscribed: 'bg-amber-100 text-amber-700',
  bounced: 'bg-red-100 text-red-700',
}

type Props = {
  contacts: ContactWithRelations[]
  total: number
  page: number
  selected: string[]
  onSelect: (ids: string[]) => void
  onOpenDrawer: (contact: ContactWithRelations, mode: 'view' | 'edit') => void
}

export default function ContactsTable({ contacts, total, page, selected, onSelect, onOpenDrawer }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const allSelected = contacts.length > 0 && contacts.every(c => selected.includes(c.id))

  function toggleAll() {
    if (allSelected) onSelect([])
    else onSelect(contacts.map(c => c.id))
  }

  function toggleOne(id: string) {
    if (selected.includes(id)) onSelect(selected.filter(s => s !== id))
    else onSelect([...selected, id])
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/contacts?${params.toString()}`)
  }

  const totalPages = Math.ceil(total / PER_PAGE)
  const from = (page - 1) * PER_PAGE + 1
  const to = Math.min(page * PER_PAGE, total)

  const columns: ColumnDef<ContactWithRelations>[] = [
    {
      id: 'select',
      header: () => (
        <input type="checkbox" checked={allSelected} onChange={toggleAll}
          className="h-3.5 w-3.5 rounded" />
      ),
      cell: ({ row }) => (
        <input type="checkbox" checked={selected.includes(row.original.id)}
          onChange={() => toggleOne(row.original.id)}
          onClick={e => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded" />
      ),
      size: 36,
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const c = row.original
        const initials = `${c.first_name[0] ?? ''}${c.last_name[0] ?? ''}`.toUpperCase() || c.email[0].toUpperCase()
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
              {initials}
            </div>
            <span className="font-medium text-slate-900">{`${c.first_name} ${c.last_name}`.trim() || '—'}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => <span className="text-slate-600">{getValue() as string}</span>,
    },
    {
      id: 'tags',
      header: 'Tags',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tags.map(tag => (
            <span key={tag.id}
              className="rounded-full px-1.5 py-0.5 text-[10px]"
              style={{ background: `${tag.color}20`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as keyof typeof STATUS_STYLES
        return (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[s]}`}>
            {s}
          </span>
        )
      },
    },
    {
      id: 'created_at',
      header: 'Added',
      cell: ({ row }) => (
        <span className="text-slate-400">
          {new Date(row.original.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={e => { e.stopPropagation(); onOpenDrawer(row.original, 'edit') }}
          className="text-slate-400 hover:text-slate-700 px-1"
        >⋯</button>
      ),
      size: 36,
    },
  ]

  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b border-slate-200 bg-slate-50">
                {hg.headers.map(header => (
                  <th key={header.id} className="px-3 py-2 text-left font-medium text-slate-500">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr
                key={row.id}
                onClick={() => onOpenDrawer(row.original, 'view')}
                className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                  selected.includes(row.original.id) ? 'bg-blue-50' : ''
                }`}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center text-slate-400">
                  No contacts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2">
        <span className="text-xs text-slate-500">
          {total === 0 ? 'No contacts' : `Showing ${from}–${to} of ${total}`}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            ← Prev
          </button>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/contacts/__tests__/ContactsTable.test.tsx
```
Expected: PASS — 2 tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/contacts/ContactsTable.tsx components/contacts/BulkActionBar.tsx components/contacts/__tests__/ContactsTable.test.tsx
git commit -m "feat: add ContactsTable and BulkActionBar"
```

---

## Task 9: ContactsToolbar

**Files:**
- Create: `components/contacts/ContactsToolbar.tsx`

- [ ] **Step 1: Create ContactsToolbar**

Create `components/contacts/ContactsToolbar.tsx`:
```typescript
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

type Props = {
  onImport: () => void
  onAddContact: () => void
}

export default function ContactsToolbar({ onImport, onAddContact }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function handleSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('search', value)
    else params.delete('search')
    params.delete('page')
    startTransition(() => router.push(`/contacts?${params.toString()}`))
  }

  const currentSearch = searchParams.get('search') ?? ''

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
          placeholder="Search contacts..."
          defaultValue={currentSearch}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>
      <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
        Filter
      </button>
      <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
        Sort
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/contacts/ContactsToolbar.tsx
git commit -m "feat: add ContactsToolbar"
```

---

## Task 10: ContactForm

**Files:**
- Create: `components/contacts/ContactForm.tsx`
- Create: `components/contacts/__tests__/ContactForm.test.tsx`

- [ ] **Step 1: Write failing test**

Create `components/contacts/__tests__/ContactForm.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContactForm from '../ContactForm'
import type { Tag, List, CustomFieldDefinition } from '@/lib/contacts/types'

const tags: Tag[] = []
const lists: List[] = []
const customFields: CustomFieldDefinition[] = []

describe('ContactForm', () => {
  it('renders email field as required', () => {
    render(
      <ContactForm
        tags={tags} lists={lists} customFields={customFields}
        onSave={vi.fn()} onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/email/i)).toBeRequired()
  })

  it('renders save button', () => {
    render(
      <ContactForm
        tags={tags} lists={lists} customFields={customFields}
        onSave={vi.fn()} onCancel={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('pre-fills fields when contact provided', () => {
    render(
      <ContactForm
        tags={tags} lists={lists} customFields={customFields}
        onSave={vi.fn()} onCancel={vi.fn()}
        contact={{
          id: '1', organization_id: 'org', email: 'test@example.com',
          first_name: 'Alice', last_name: 'Smith', phone: null, company: null,
          status: 'active', custom_fields: {}, created_at: '', updated_at: '',
          tags: [], lists: [],
        }}
      />
    )
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/contacts/__tests__/ContactForm.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create ContactForm**

Create `components/contacts/ContactForm.tsx`:
```typescript
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import TagPicker from './TagPicker'
import { createContact, updateContact } from '@/lib/contacts/actions'
import type { ContactWithRelations, Tag, List, CustomFieldDefinition } from '@/lib/contacts/types'

type Props = {
  contact?: ContactWithRelations
  tags: Tag[]
  lists: List[]
  customFields: CustomFieldDefinition[]
  onSave: () => void
  onCancel: () => void
}

export default function ContactForm({ contact, tags, lists, customFields, onSave, onCancel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState(contact?.first_name ?? '')
  const [lastName, setLastName] = useState(contact?.last_name ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [company, setCompany] = useState(contact?.company ?? '')
  const [selectedTags, setSelectedTags] = useState<string[]>(contact?.tags.map(t => t.id) ?? [])
  const [selectedLists, setSelectedLists] = useState<string[]>(contact?.lists.map(l => l.id) ?? [])
  const [customValues, setCustomValues] = useState<Record<string, string>>(
    Object.fromEntries(
      customFields.map(f => [f.field_key, String(contact?.custom_fields[f.field_key] ?? '')])
    )
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const payload = {
          email,
          first_name: firstName,
          last_name: lastName,
          phone: phone || undefined,
          company: company || undefined,
          custom_fields: customValues,
          list_ids: selectedLists,
          tag_ids: selectedTags,
        }
        if (contact) {
          await updateContact(contact.id, payload)
        } else {
          await createContact(payload)
        }
        onSave()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4">
      {/* Contact Info */}
      <section>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Contact Info</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="firstName" className="text-xs">First name</Label>
            <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lastName" className="text-xs">Last name</Label>
            <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <Label htmlFor="email" className="text-xs">Email address *</Label>
          <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="phone" className="text-xs">Phone</Label>
            <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="company" className="text-xs">Company</Label>
            <Input id="company" value={company} onChange={e => setCompany(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
      </section>

      {/* Lists */}
      <section>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lists & Tags</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Lists</Label>
            <div className="flex flex-wrap gap-1 rounded-md border border-input bg-background p-2 min-h-9">
              {lists.map(list => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedLists(
                    selectedLists.includes(list.id)
                      ? selectedLists.filter(id => id !== list.id)
                      : [...selectedLists, list.id]
                  )}
                  className={`rounded-full px-2 py-0.5 text-xs border transition-colors ${
                    selectedLists.includes(list.id)
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {list.name}
                </button>
              ))}
              {lists.length === 0 && <span className="text-xs text-muted-foreground">No lists yet</span>}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tags</Label>
            <TagPicker tags={tags} selected={selectedTags} onChange={setSelectedTags} />
          </div>
        </div>
      </section>

      {/* Custom Fields */}
      {customFields.length > 0 && (
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Custom Fields</p>
          <div className="space-y-3">
            {customFields.map(field => (
              <div key={field.field_key} className="space-y-1">
                <Label htmlFor={field.field_key} className="text-xs">{field.label}</Label>
                {field.field_type === 'dropdown' ? (
                  <select
                    id={field.field_key}
                    value={customValues[field.field_key] ?? ''}
                    onChange={e => setCustomValues(v => ({ ...v, [field.field_key]: e.target.value }))}
                    className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select...</option>
                    {(field.options ?? []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={field.field_key}
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                    value={customValues[field.field_key] ?? ''}
                    onChange={e => setCustomValues(v => ({ ...v, [field.field_key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending} className="flex-1 h-8 text-sm">
          {isPending ? 'Saving...' : contact ? 'Save changes' : 'Save contact'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="h-8 text-sm">
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run components/contacts/__tests__/ContactForm.test.tsx
```
Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/contacts/ContactForm.tsx components/contacts/__tests__/ContactForm.test.tsx
git commit -m "feat: add ContactForm"
```

---

## Task 11: ContactDrawer

**Files:**
- Create: `components/contacts/ContactDrawer.tsx`

- [ ] **Step 1: Create ContactDrawer**

Create `components/contacts/ContactDrawer.tsx`:
```typescript
'use client'

import { useState } from 'react'
import ContactForm from './ContactForm'
import type { ContactWithRelations, Tag, List, CustomFieldDefinition } from '@/lib/contacts/types'

type DrawerMode = 'add' | 'edit' | 'view'

type Props = {
  open: boolean
  mode: DrawerMode
  contact?: ContactWithRelations
  tags: Tag[]
  lists: List[]
  customFields: CustomFieldDefinition[]
  onClose: () => void
  onSaved: () => void
}

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  unsubscribed: 'bg-amber-100 text-amber-700',
  bounced: 'bg-red-100 text-red-700',
}

export default function ContactDrawer({
  open, mode: initialMode, contact, tags, lists, customFields, onClose, onSaved,
}: Props) {
  const [mode, setMode] = useState<DrawerMode>(initialMode)

  if (!open) return null

  const initials = contact
    ? `${contact.first_name[0] ?? ''}${contact.last_name[0] ?? ''}`.toUpperCase() || contact.email[0].toUpperCase()
    : '+'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 z-50 h-full w-96 bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 p-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            {contact ? (
              <>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {`${contact.first_name} ${contact.last_name}`.trim() || contact.email}
                </p>
                <p className="truncate text-xs text-slate-500">{contact.email}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-900">Add Contact</p>
            )}
          </div>
          {contact && mode === 'view' && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[contact.status]}`}>
              {contact.status}
            </span>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {(mode === 'add' || mode === 'edit') && (
            <ContactForm
              contact={mode === 'edit' ? contact : undefined}
              tags={tags}
              lists={lists}
              customFields={customFields}
              onSave={() => { onSaved(); onClose() }}
              onCancel={mode === 'edit' ? () => setMode('view') : onClose}
            />
          )}

          {mode === 'view' && contact && (
            <div className="p-4 space-y-4">
              {/* Placeholder stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Emails received', value: '—' },
                  { label: 'Open rate', value: '—' },
                  { label: 'Click rate', value: '—' },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-base font-bold text-slate-400">{stat.value}</p>
                    <p className="text-[9px] text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Fields */}
              <div className="space-y-2">
                {[
                  ['Phone', contact.phone],
                  ['Company', contact.company],
                  ...customFields.map(f => [f.label, String(contact.custom_fields[f.field_key] ?? '')])
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-slate-100 py-1.5 text-xs">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-700">{value || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Lists */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lists</p>
                <div className="flex flex-wrap gap-1">
                  {contact.lists.map(list => (
                    <span key={list.id} className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                      {list.name}
                    </span>
                  ))}
                  {contact.lists.length === 0 && <span className="text-xs text-slate-400">None</span>}
                </div>
              </div>

              {/* Tags */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map(tag => (
                    <span key={tag.id}
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{ background: `${tag.color}20`, color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {contact.tags.length === 0 && <span className="text-xs text-slate-400">None</span>}
                </div>
              </div>

              <button
                onClick={() => setMode('edit')}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                Edit contact
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/contacts/ContactDrawer.tsx
git commit -m "feat: add ContactDrawer (view/add/edit)"
```

---

## Task 12: ImportColumnMapper + ImportModal

**Files:**
- Create: `components/contacts/ImportColumnMapper.tsx`
- Create: `components/contacts/ImportModal.tsx`

- [ ] **Step 1: Create ImportColumnMapper**

Create `components/contacts/ImportColumnMapper.tsx`:
```typescript
'use client'

import type { ColumnMapping } from '@/lib/contacts/csv'

const CONTACT_FIELDS = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
]

type Props = {
  mapping: ColumnMapping[]
  onChange: (mapping: ColumnMapping[]) => void
}

export default function ImportColumnMapper({ mapping, onChange }: Props) {
  function setField(csvColumn: string, contactField: string | null) {
    onChange(mapping.map(m =>
      m.csv_column === csvColumn ? { ...m, contact_field: contactField } : m
    ))
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
      <div className="grid grid-cols-3 gap-0 bg-slate-50 px-3 py-2 font-medium text-slate-500 border-b border-slate-200">
        <span>CSV Column</span>
        <span className="text-center">→</span>
        <span>Contact Field</span>
      </div>
      {mapping.map(({ csv_column, contact_field }) => (
        <div key={csv_column} className="grid grid-cols-3 items-center gap-0 px-3 py-2 border-b border-slate-100 last:border-0">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 inline-block">{csv_column}</span>
          <span className="text-center text-slate-400">→</span>
          <select
            value={contact_field ?? ''}
            onChange={e => setField(csv_column, e.target.value || null)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
          >
            <option value="">Skip</option>
            {CONTACT_FIELDS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create ImportModal**

Create `components/contacts/ImportModal.tsx`:
```typescript
'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import ImportColumnMapper from './ImportColumnMapper'
import { parseCSV, autoDetectColumns, applyMapping, generateSampleCSV } from '@/lib/contacts/csv'
import { importContacts } from '@/lib/contacts/actions'
import type { ColumnMapping, ParsedRow } from '@/lib/contacts/csv'
import type { List, ImportResult } from '@/lib/contacts/types'

type Step = 1 | 2 | 3

type Props = {
  open: boolean
  lists: List[]
  onClose: () => void
}

export default function ImportModal({ open, lists, onClose }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [dragging, setDragging] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping[]>([])
  const [selectedListId, setSelectedListId] = useState('')
  const [updateDups, setUpdateDups] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) return
    const { headers: h, rows: r } = await parseCSV(file)
    setHeaders(h)
    setRows(r)
    setMapping(autoDetectColumns(h))
    setStep(2)
  }

  function downloadSample() {
    const csv = generateSampleCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample-contacts.csv'
    a.click()
  }

  async function handleImport() {
    const { valid, invalidEmails } = applyMapping(rows, mapping)
    setLoading(true)
    try {
      const res = await importContacts(valid, {
        list_id: selectedListId || undefined,
        update_duplicates: updateDups,
      })
      setResult({ ...res, errors: [...res.errors, ...Array(invalidEmails).fill('Invalid email')] })
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setStep(1); setHeaders([]); setRows([]); setMapping([])
    setResult(null); setSelectedListId(''); setUpdateDups(true)
    onClose()
  }

  const { valid, invalidEmails } = step >= 2 ? applyMapping(rows, mapping) : { valid: [], invalidEmails: 0 }
  const dupCount = rows.length - valid.length - invalidEmails

  const StepIndicator = ({ n, label }: { n: number; label: string }) => (
    <div className="flex items-center gap-1.5">
      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
        step === n ? 'bg-blue-600 text-white' : step > n ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'
      }`}>{step > n ? '✓' : n}</div>
      <span className={`text-xs ${step === n ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>{label}</span>
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={handleClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Import Contacts</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
          <StepIndicator n={1} label="Upload" />
          <div className="flex-1 h-px bg-slate-200" />
          <StepIndicator n={2} label="Map" />
          <div className="flex-1 h-px bg-slate-200" />
          <StepIndicator n={3} label="Import" />
        </div>

        {/* Step content */}
        <div className="p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div
                className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                  dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onClick={() => fileRef.current?.click()}
              >
                <div className="mb-3 text-3xl">📄</div>
                <p className="text-sm font-medium text-slate-700">Drop CSV file here</p>
                <p className="mt-1 text-xs text-slate-400">or click to browse</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>
              <p className="text-center text-xs text-slate-400">Max 10MB · CSV format only</p>
              <button onClick={downloadSample} className="w-full text-center text-xs text-blue-600 hover:underline">
                Download sample CSV template
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Match your CSV columns to contact fields. Unmatched columns are skipped.</p>
              <ImportColumnMapper mapping={mapping} onChange={setMapping} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
                <Button size="sm" className="flex-1" onClick={() => setStep(3)}>
                  Review import →
                </Button>
              </div>
            </div>
          )}

          {step === 3 && !result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total rows', value: rows.length, color: 'text-slate-900' },
                  { label: 'Valid', value: valid.length, color: 'text-green-600' },
                  { label: 'Duplicates', value: dupCount, color: 'text-amber-600' },
                  { label: 'Invalid email', value: invalidEmails, color: 'text-red-600' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-slate-200 p-3 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Add to list (optional)</label>
                  <select
                    value={selectedListId}
                    onChange={e => setSelectedListId(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  >
                    <option value="">No list</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={updateDups} onChange={e => setUpdateDups(e.target.checked)} />
                  Update existing contacts (duplicates)
                </label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(2)}>← Back</Button>
                <Button size="sm" className="flex-1" disabled={loading || valid.length === 0} onClick={handleImport}>
                  {loading ? 'Importing...' : `Import ${valid.length} contacts →`}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-4 text-center">
              <div className="text-4xl">🎉</div>
              <p className="text-sm font-semibold text-slate-900">Import complete</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border p-3"><p className="font-bold text-green-600">{result.inserted}</p><p className="text-slate-400">Inserted</p></div>
                <div className="rounded-lg border p-3"><p className="font-bold text-blue-600">{result.updated}</p><p className="text-slate-400">Updated</p></div>
                <div className="rounded-lg border p-3"><p className="font-bold text-slate-400">{result.skipped}</p><p className="text-slate-400">Skipped</p></div>
              </div>
              {result.errors.length > 0 && (
                <p className="text-xs text-red-600">{result.errors.length} error(s) — some rows were not imported</p>
              )}
              <Button onClick={handleClose} className="w-full">Done</Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/contacts/ImportColumnMapper.tsx components/contacts/ImportModal.tsx
git commit -m "feat: add CSV import wizard"
```

---

## Task 13: Contacts Page

**Files:**
- Modify: `app/(dashboard)/contacts/page.tsx`
- Create: `app/(dashboard)/contacts/loading.tsx`
- Create: `app/(dashboard)/contacts/ContactsPageClient.tsx`

- [ ] **Step 1: Create skeleton loader**

Create `app/(dashboard)/contacts/loading.tsx`:
```typescript
export default function ContactsLoading() {
  return (
    <div className="flex h-full animate-pulse">
      <div className="w-44 flex-shrink-0 border-r border-slate-200 bg-slate-100" />
      <div className="flex flex-1 flex-col">
        <div className="h-10 border-b border-slate-200 bg-slate-100" />
        <div className="flex-1 bg-white p-4 space-y-2">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="h-10 rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ContactsPageClient**

Create `app/(dashboard)/contacts/ContactsPageClient.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ListsSidebar from '@/components/contacts/ListsSidebar'
import ContactsTable from '@/components/contacts/ContactsTable'
import ContactsToolbar from '@/components/contacts/ContactsToolbar'
import BulkActionBar from '@/components/contacts/BulkActionBar'
import ContactDrawer from '@/components/contacts/ContactDrawer'
import ImportModal from '@/components/contacts/ImportModal'
import type { ContactWithRelations, List, Tag, CustomFieldDefinition, ContactsPage } from '@/lib/contacts/types'

type DrawerState =
  | { open: false }
  | { open: true; mode: 'add' }
  | { open: true; mode: 'view' | 'edit'; contact: ContactWithRelations }

type Props = {
  contactsPage: ContactsPage
  lists: List[]
  tags: Tag[]
  customFields: CustomFieldDefinition[]
  totalCount: number
}

export default function ContactsPageClient({ contactsPage, lists, tags, customFields, totalCount }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [drawer, setDrawer] = useState<DrawerState>({ open: false })
  const [importOpen, setImportOpen] = useState(false)

  function openDrawer(contact: ContactWithRelations, mode: 'view' | 'edit') {
    setDrawer({ open: true, mode, contact })
  }

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      <ListsSidebar lists={lists} tags={tags} totalCount={totalCount} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Page header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">Contacts</h1>
            <p className="text-xs text-slate-500">{contactsPage.total} total</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              Import CSV
            </button>
            <button
              onClick={() => setDrawer({ open: true, mode: 'add' })}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              + Add Contact
            </button>
          </div>
        </div>

        <ContactsToolbar onImport={() => setImportOpen(true)} onAddContact={() => setDrawer({ open: true, mode: 'add' })} />

        {selected.length > 0 && (
          <BulkActionBar
            selectedIds={selected}
            lists={lists}
            tags={tags}
            onClear={() => setSelected([])}
          />
        )}

        <ContactsTable
          contacts={contactsPage.contacts}
          total={contactsPage.total}
          page={contactsPage.page}
          selected={selected}
          onSelect={setSelected}
          onOpenDrawer={openDrawer}
        />
      </div>

      <ContactDrawer
        open={drawer.open}
        mode={drawer.open ? drawer.mode : 'add'}
        contact={drawer.open && drawer.mode !== 'add' ? drawer.contact : undefined}
        tags={tags}
        lists={lists}
        customFields={customFields}
        onClose={() => setDrawer({ open: false })}
        onSaved={() => { setDrawer({ open: false }); router.refresh() }}
      />

      <ImportModal
        open={importOpen}
        lists={lists}
        onClose={() => { setImportOpen(false); router.refresh() }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Replace contacts page**

Replace `app/(dashboard)/contacts/page.tsx`:
```typescript
import { Suspense } from 'react'
import { getContacts, getLists, getTags, getCustomFieldDefinitions, getTotalContactCount } from '@/lib/contacts/queries'
import ContactsPageClient from './ContactsPageClient'
import ContactsLoading from './loading'

type Props = {
  searchParams: Promise<{
    page?: string
    search?: string
    list_id?: string
    tag_id?: string
    status?: string
  }>
}

export default async function ContactsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = Number(params.page ?? 1)

  const [contactsPage, lists, tags, customFields, totalCount] = await Promise.all([
    getContacts({
      page,
      search: params.search,
      list_id: params.list_id,
      tag_id: params.tag_id,
      status: params.status as any,
    }),
    getLists(),
    getTags(),
    getCustomFieldDefinitions(),
    getTotalContactCount(),
  ])

  return (
    <Suspense fallback={<ContactsLoading />}>
      <ContactsPageClient
        contactsPage={contactsPage}
        lists={lists}
        tags={tags}
        customFields={customFields}
        totalCount={totalCount}
      />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass (at minimum the 14 from Foundation + new contacts tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/(dashboard)/contacts/
git commit -m "feat: replace contacts placeholder with full page"
```

---

## Task 14: Lists Pages

**Files:**
- Create: `app/(dashboard)/lists/page.tsx`
- Create: `app/(dashboard)/lists/[id]/page.tsx`

- [ ] **Step 1: Create lists index page**

Create `app/(dashboard)/lists/page.tsx`:
```typescript
import { getLists } from '@/lib/contacts/queries'
import { deleteList, createList } from '@/lib/contacts/actions'
import ListsPageClient from './ListsPageClient'

export default async function ListsPage() {
  const lists = await getLists()
  return <ListsPageClient lists={lists} />
}
```

Create `app/(dashboard)/lists/ListsPageClient.tsx`:
```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createList, deleteList } from '@/lib/contacts/actions'
import type { List } from '@/lib/contacts/types'

export default function ListsPageClient({ lists }: { lists: List[] }) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      await createList(newName.trim())
      setNewName('')
      setAdding(false)
      router.refresh()
    })
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete list "${name}"? Contacts will not be deleted.`)) return
    startTransition(async () => { await deleteList(id); router.refresh() })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Lists</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          + New List
        </button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <input
            autoFocus
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
            placeholder="List name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAdding(false) }}
          />
          <button onClick={handleCreate} disabled={isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Create
          </button>
          <button onClick={() => setAdding(false)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {lists.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No lists yet. Create one to organize your contacts.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Contacts</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Created</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {lists.map(list => (
                <tr key={list.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a href={`/lists/${list.id}`} className="font-medium text-blue-600 hover:underline">
                      {list.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{list.contact_count}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(list.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(list.id, list.name)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create list detail page**

Create `app/(dashboard)/lists/[id]/page.tsx`:
```typescript
import { getContacts, getLists, getTags, getCustomFieldDefinitions } from '@/lib/contacts/queries'
import ContactsPageClient from '../../contacts/ContactsPageClient'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; search?: string }>
}

export default async function ListDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams

  const [contactsPage, lists, tags, customFields] = await Promise.all([
    getContacts({ list_id: id, page: Number(sp.page ?? 1), search: sp.search }),
    getLists(),
    getTags(),
    getCustomFieldDefinitions(),
  ])

  const list = lists.find(l => l.id === id)
  if (!list) notFound()

  return (
    <ContactsPageClient
      contactsPage={contactsPage}
      lists={lists}
      tags={tags}
      customFields={customFields}
      totalCount={list.contact_count}
    />
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 4: Final commit + tag**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/(dashboard)/lists/
git commit -m "feat: add lists management pages"
git tag v0.2.0-contacts
```

---

## Final Verification

- [ ] **Start dev server**

```bash
cd /Users/poledilip/email-marketing-saas
npm run dev
```

Test the following manually:

1. `/contacts` — shows data table with left sidebar (lists + tags)
2. "+ Add Contact" → drawer opens, fill form, save → contact appears in table
3. Click a contact row → view drawer opens with fields
4. Click "Edit contact" in view drawer → edit mode, change a field, save
5. Check 2+ rows → bulk action bar appears with delete button
6. "Import CSV" → upload sample CSV (download from Step 1 link) → map columns → confirm → success screen
7. `/lists` — shows lists table, "+ New List" creates inline, delete works
8. Click a list name → `/lists/[id]` shows filtered contacts
9. Left sidebar list click → filters contacts table
10. Left sidebar tag click → filters contacts table
