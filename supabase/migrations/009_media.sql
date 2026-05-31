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

create table public.integration_settings (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid unique not null references public.organizations(id) on delete cascade,
  webhook_url         text,
  webhook_events      text[] not null default '{}',
  webhook_secret      text not null default gen_random_uuid()::text,
  ga_measurement_id   text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create trigger integration_settings_updated_at
  before update on public.integration_settings
  for each row execute function public.set_updated_at();
alter table public.integration_settings enable row level security;
create policy "org members can manage integration settings"
  on public.integration_settings for all
  using (organization_id = public.current_org_id());
