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
