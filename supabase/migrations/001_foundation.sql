-- organizations: multi-tenant root
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  slug       text unique not null default gen_random_uuid()::text,
  logo_url   text,
  created_at timestamptz default now()
);

-- profiles: extends auth.users
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  full_name       text not null default '',
  avatar_url      text,
  role            text not null default 'owner'
                  check (role in ('owner', 'admin', 'member')),
  created_at      timestamptz default now()
);

-- invitations: team member onboarding (schema only, UI in sub-project 9)
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  email           text not null,
  role            text not null default 'member',
  token           text unique not null default gen_random_uuid()::text,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz default now()
);

-- Enable RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;

-- Helper function: get current user's organization_id
create or replace function public.current_org_id()
returns uuid language sql stable security definer as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

-- organizations RLS
create policy "members can read own org"
  on public.organizations for select
  using (id = public.current_org_id());

create policy "owner can update own org"
  on public.organizations for update
  using (
    id = public.current_org_id() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner'
    )
  );

-- profiles RLS
create policy "users can read own org profiles"
  on public.profiles for select
  using (organization_id = public.current_org_id());

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- invitations RLS
create policy "admins can insert invitations"
  on public.invitations for insert
  with check (
    organization_id = public.current_org_id() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "anyone can read invitation by token"
  on public.invitations for select
  using (true);

-- Trigger: create stub org + profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (id, name, slug)
  values (gen_random_uuid(), '', gen_random_uuid()::text)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (new.id, new_org_id, '', 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
