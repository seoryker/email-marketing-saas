# Automations (Sub-project 4) — Design Spec

**Date:** 2026-05-29
**Sub-project:** 4 of 9
**Scope:** Visual flowchart automation builder (React Flow canvas), full trigger + action set, Supabase + Vercel Cron execution engine, automations list page.

---

## Stack

| Addition | Purpose |
|---|---|
| `@xyflow/react` | React Flow — node-based canvas for automation builder |

---

## Database Schema

Migration: `supabase/migrations/005_automations.sql`

```sql
-- Automation definition
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

-- Steps (nodes on the canvas)
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

-- Edges (connections between nodes)
create table public.automation_edges (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references public.automations(id) on delete cascade,
  source_step_id uuid not null references public.automation_steps(id) on delete cascade,
  target_step_id uuid not null references public.automation_steps(id) on delete cascade,
  label          text
);

-- Per-contact enrollment
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

-- Step execution state per enrollment
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

-- Triggers
create trigger automations_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

-- Indexes
create index on public.automations(organization_id, status);
create index on public.automation_step_states(status, execute_at)
  where status = 'pending';
create index on public.automation_enrollments(automation_id, status);

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
```

---

## File Structure

```
app/(dashboard)/automations/
├── page.tsx                          # Automations list (Server Component)
├── new/page.tsx                      # Redirect to create and open builder
└── [id]/
    ├── page.tsx                      # Redirect → /[id]/edit
    └── edit/
        ├── page.tsx                  # Builder Server Component shell
        └── AutomationBuilderClient.tsx  # React Flow canvas + panels

components/automations/
├── AutomationsList.tsx               # Table: name, status, enrollments, actions
├── AutomationCanvas.tsx              # React Flow canvas with custom nodes
├── StepPalette.tsx                   # Draggable step types palette (left panel)
├── StepConfigPanel.tsx               # Right panel: config for selected node
├── nodes/
│   ├── TriggerNode.tsx               # Blue trigger card node
│   ├── ActionNode.tsx                # White action card node
│   ├── ConditionNode.tsx             # Purple diamond condition node
│   └── EndNode.tsx                   # Red end node

lib/automations/
├── types.ts                          # Automation, AutomationStep, AutomationEdge, Enrollment types
├── queries.ts                        # getAutomations, getAutomation, getEnrollmentStats
├── actions.ts                        # createAutomation, updateAutomation, saveCanvas, toggleStatus
└── engine.ts                         # executeStep, enrollContact, processScheduledSteps

app/api/
├── webhooks/automation/route.ts      # Webhook trigger receiver
└── cron/process-automations/route.ts # Cron: process pending step states

vercel.json (modify)                  # Add cron: */1 * * * * for automations
```

---

## Page Architecture

### Automations List (`/automations`)

Server Component. Shows table of all automations.

**Header:** "Automations" title + count + "+ New Automation" button.

**Table columns:** Name, Status badge (draft=grey, active=green, paused=amber), Active enrollments count, Total completed, Emails sent, Created date, ⋯ menu (Edit / Activate / Pause / Delete).

**Empty state:** Icon + "No automations yet" + "+ Create your first automation" CTA.

### Automation Builder (`/automations/[id]/edit`)

Full-screen layout (same `-m-6 h-screen` pattern as campaign builder).

**Top toolbar:**
- ← Automations (back link)
- Automation name (inline-editable, auto-saves on blur)
- Draft / Active toggle (pill switcher)
- Save button

**Left panel (StepPalette, 160px):**
- **Triggers section:** Joins list, Tagged, Opens email, Clicks link, Unsubscribes, Birthday, Date-based, Webhook
- **Actions section:** Send Email, Wait, Condition, Add Tag, Remove Tag, Add to List, Remove from List, Update Field, Send Webhook, Send SMS, End

Each item is draggable onto the canvas via React Flow's `onDrop`.

**Center canvas (AutomationCanvas):**
- React Flow with custom node types: `TriggerNode`, `ActionNode`, `ConditionNode`, `EndNode`
- Nodes connected by animated edges
- Condition nodes have two output handles: "yes" (green) and "no" (red)
- Click a node → opens StepConfigPanel on the right
- `onNodesChange` and `onEdgesChange` callbacks update local state; save persists to DB

**Right panel (StepConfigPanel, 200px):**
- Shown when a node is selected
- Fields vary by step type:
  - `send_email`: select campaign dropdown (lists draft campaigns)
  - `wait`: number input + unit (minutes/hours/days)
  - `condition`: condition type (opened_email, clicked_link, has_tag) + value
  - `add_tag` / `remove_tag`: tag picker
  - `add_to_list` / `remove_from_list`: list picker
  - `update_field`: field key + new value
  - `send_webhook`: URL input + HTTP method
  - `send_sms`: message text (via Brevo SMS API)
- Delete step button (red)

**Bottom stats bar (28px):**
- Active enrollments count
- Total completed
- Emails sent by this automation

---

## Execution Engine

### Trigger → Enroll

Triggers fire from different places:

| Trigger | Where it fires |
|---|---|
| `contact_joins_list` | `lib/contacts/actions.ts` — after `contact_lists` insert |
| `contact_tagged` | `lib/contacts/actions.ts` — after `contact_tags` insert |
| `contact_opens_email` | `app/api/webhooks/brevo/route.ts` — on `opened` event |
| `contact_clicks_link` | `app/api/webhooks/brevo/route.ts` — on `clicked` event |
| `contact_unsubscribes` | `app/api/webhooks/brevo/route.ts` — on `unsubscribed` event |
| `webhook` | `app/api/webhooks/automation/route.ts` — external POST |
| `contact_birthday` / `date_based` | Cron checks daily |

`lib/automations/engine.ts` exports `enrollContact(automationId, contactId)`:
1. Check no existing active enrollment (`unique` constraint)
2. Insert `automation_enrollments` row
3. Find the trigger step (first node with no incoming edges)
4. Insert `automation_step_states` row with `execute_at = now()`

### Cron Execution (`/api/cron/process-automations`)

Runs every minute (added to `vercel.json`). Process logic:

1. Fetch up to 100 `automation_step_states` rows where `status = 'pending'` AND `execute_at <= now()`
2. For each state: mark `status = 'processing'`
3. Execute the step based on `automation_steps.type`:
   - `send_email`: call `sendTransactionalEmail` (from brevo.ts), personalize with contact data
   - `wait`: mark current step `completed`, create next step state with `execute_at = now() + duration`
   - `condition`: evaluate condition against contact data, follow YES or NO edge
   - `add_tag` / `remove_tag`: upsert/delete `contact_tags`
   - `add_to_list` / `remove_from_list`: upsert/delete `contact_lists`
   - `update_field`: update `contacts.custom_fields`
   - `send_webhook`: `fetch(url, { method, body: contactData })`
   - `send_sms`: call Brevo SMS API
   - `end`: mark enrollment `completed`
4. After executing: mark state `completed`, create next step state (or complete enrollment if no next step)
5. On error: mark state `failed`, set `error` message, mark enrollment `failed`

### `lib/automations/engine.ts` key exports

```typescript
export async function enrollContact(automationId: string, contactId: string): Promise<void>
export async function processScheduledSteps(): Promise<{ processed: number; errors: number }>
export async function checkAndEnrollBirthdayTriggers(): Promise<void>  // called daily
```

---

## Webhook Trigger (`/api/webhooks/automation/route.ts`)

External POST to enroll a contact by email:
```json
{ "email": "contact@example.com", "automation_id": "uuid" }
```

Handler: look up contact by email + org, call `enrollContact`.

---

## Canvas Persistence

Saving the canvas stores:
- `automation_steps` rows (upsert by ID, delete removed nodes)
- `automation_edges` rows (delete all for automation, reinsert current edges)
- `automations.trigger_type` + `automations.trigger_config` from the trigger node config

---

## What Is Explicitly Out of Scope

- A/B split testing within automations
- Analytics dashboard for automations (open/click rates per automation — future)
- Goal tracking (exit automation when contact converts)
- Frequency capping (prevent over-sending)
- Contact activity timeline updates from automation sends
