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
