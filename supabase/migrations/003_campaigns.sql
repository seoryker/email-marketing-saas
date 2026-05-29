-- campaigns
create table public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  subject             text not null default '',
  preview_text        text,
  from_name           text not null default '',
  from_email          text not null default '',
  status              text not null default 'draft'
                      check (status in ('draft','scheduled','sending','sent','failed')),
  content_json        jsonb,
  content_html        text,
  recipient_list_ids  uuid[] not null default '{}',
  recipient_count     integer not null default 0,
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  brevo_campaign_ref  text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- campaign_sends
create table public.campaign_sends (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  status            text not null default 'queued'
                    check (status in ('queued','sent','delivered','opened','clicked','bounced','unsubscribed')),
  sent_at           timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  brevo_message_id  text,
  unique (campaign_id, contact_id)
);

-- email_templates
create table public.email_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  thumbnail_url   text,
  content_json    jsonb,
  content_html    text,
  created_at      timestamptz default now()
);

-- updated_at trigger (set_updated_at already defined in 002_contacts.sql)
create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- indexes
create index on public.campaigns(organization_id, status);
create index on public.campaigns(organization_id, created_at desc);
create index on public.campaign_sends(campaign_id, status);

-- RLS
alter table public.campaigns enable row level security;
alter table public.campaign_sends enable row level security;
alter table public.email_templates enable row level security;

create policy "org members can manage campaigns"
  on public.campaigns for all
  using (organization_id = public.current_org_id());

create policy "org members can manage campaign_sends"
  on public.campaign_sends for all
  using (
    exists (select 1 from public.campaigns
            where id = campaign_id and organization_id = public.current_org_id())
  );

create policy "org members can manage email_templates"
  on public.email_templates for all
  using (organization_id = public.current_org_id());
