-- automations
create table public.automations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  status          text not null default 'draft'
                  check (status in ('draft','active','paused')),
  trigger_type    text not null
                  check (trigger_type in (
                    'contact_joins_list','contact_tagged',
                    'contact_opens_email','contact_clicks_link',
                    'contact_unsubscribes','contact_birthday',
                    'date_based','webhook'
                  )),
  trigger_config  jsonb not null default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- automation_steps (canvas nodes)
create table public.automation_steps (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  type          text not null
                check (type in (
                  'send_email','wait','condition',
                  'add_tag','remove_tag','add_to_list','remove_from_list',
                  'update_field','send_webhook','send_sms','end'
                )),
  config        jsonb not null default '{}',
  position_x    float not null default 0,
  position_y    float not null default 0,
  created_at    timestamptz default now()
);

-- automation_edges (canvas connections)
create table public.automation_edges (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references public.automations(id) on delete cascade,
  source_step_id uuid not null references public.automation_steps(id) on delete cascade,
  target_step_id uuid not null references public.automation_steps(id) on delete cascade,
  label          text
);

-- automation_enrollments
create table public.automation_enrollments (
  id              uuid primary key default gen_random_uuid(),
  automation_id   uuid not null references public.automations(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  status          text not null default 'active'
                  check (status in ('active','completed','failed','unsubscribed')),
  enrolled_at     timestamptz default now(),
  completed_at    timestamptz,
  unique (automation_id, contact_id)
);

-- automation_step_states (execution queue)
create table public.automation_step_states (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.automation_enrollments(id) on delete cascade,
  step_id       uuid not null references public.automation_steps(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','processing','completed','failed')),
  execute_at    timestamptz not null default now(),
  executed_at   timestamptz,
  error         text
);

-- updated_at trigger
create trigger automations_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

-- Indexes
create index on public.automations(organization_id, status);
create index on public.automation_step_states(status, execute_at)
  where status = 'pending';
create index on public.automation_enrollments(automation_id, status);
create index on public.automation_steps(automation_id);
create index on public.automation_edges(automation_id);

-- RLS
alter table public.automations enable row level security;
alter table public.automation_steps enable row level security;
alter table public.automation_edges enable row level security;
alter table public.automation_enrollments enable row level security;
alter table public.automation_step_states enable row level security;

create policy "org members can manage automations"
  on public.automations for all
  using (organization_id = public.current_org_id());

create policy "org members can manage automation steps"
  on public.automation_steps for all
  using (
    exists (select 1 from public.automations
            where id = automation_id and organization_id = public.current_org_id())
  );

create policy "org members can manage automation edges"
  on public.automation_edges for all
  using (
    exists (select 1 from public.automations
            where id = automation_id and organization_id = public.current_org_id())
  );

create policy "org members can manage enrollments"
  on public.automation_enrollments for all
  using (
    exists (select 1 from public.automations
            where id = automation_id and organization_id = public.current_org_id())
  );

create policy "org members can manage step states"
  on public.automation_step_states for all
  using (
    exists (
      select 1 from public.automation_enrollments ae
      join public.automations a on a.id = ae.automation_id
      where ae.id = enrollment_id and a.organization_id = public.current_org_id()
    )
  );
