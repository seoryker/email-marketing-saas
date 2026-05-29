# Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual flowchart automation builder (React Flow canvas) with full trigger/action support and a Vercel Cron execution engine that processes scheduled steps every minute.

**Architecture:** React Flow (`@xyflow/react`) handles the canvas with custom node types. Automations are stored as nodes+edges in Supabase. The engine runs via Vercel Cron every minute — it fetches pending `automation_step_states` and processes them (send email, evaluate conditions, apply tags, etc.). Triggers fire from existing code paths (contact actions, Brevo webhook handler) to enroll contacts.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, `@xyflow/react`, Tailwind CSS, shadcn/ui

---

## File Map

| File | Responsibility |
|---|---|
| `lib/automations/types.ts` | All TypeScript types for automations |
| `lib/automations/queries.ts` | getAutomations, getAutomation, getEnrollmentStats |
| `lib/automations/actions.ts` | createAutomation, updateAutomation, saveCanvas, toggleStatus, deleteAutomation |
| `lib/automations/engine.ts` | enrollContact, processScheduledSteps, executeStep |
| `supabase/migrations/005_automations.sql` | 5 tables, indexes, RLS |
| `components/automations/nodes/TriggerNode.tsx` | Blue trigger card node |
| `components/automations/nodes/ActionNode.tsx` | White action card node |
| `components/automations/nodes/ConditionNode.tsx` | Purple condition node with yes/no handles |
| `components/automations/nodes/EndNode.tsx` | Red end node |
| `components/automations/StepPalette.tsx` | Draggable step palette (left panel) |
| `components/automations/StepConfigPanel.tsx` | Config panel for selected node (right) |
| `components/automations/AutomationCanvas.tsx` | React Flow canvas with DnD |
| `components/automations/AutomationsList.tsx` | Table: name, status, stats |
| `app/(dashboard)/automations/[id]/edit/AutomationBuilderClient.tsx` | Full-screen builder orchestrator |
| `app/(dashboard)/automations/[id]/edit/page.tsx` | Builder Server Component shell |
| `app/(dashboard)/automations/[id]/page.tsx` | Redirect to /edit |
| `app/(dashboard)/automations/new/page.tsx` | Create + redirect to builder |
| `app/(dashboard)/automations/page.tsx` | Automations list page |
| `app/api/cron/process-automations/route.ts` | Cron: process pending step states |
| `app/api/webhooks/automation/route.ts` | Webhook trigger receiver |
| `vercel.json` (modify) | Add automations cron |

---

## Task 1: Install Dependencies + Shared Types

**Files:**
- Modify: `package.json`
- Create: `lib/automations/types.ts`

- [ ] **Step 1: Install @xyflow/react**

```bash
cd /Users/poledilip/email-marketing-saas
npm install @xyflow/react
```

- [ ] **Step 2: Create lib/automations/types.ts**

Create `lib/automations/types.ts`:
```typescript
export type AutomationStatus = 'draft' | 'active' | 'paused'

export type AutomationTriggerType =
  | 'contact_joins_list' | 'contact_tagged'
  | 'contact_opens_email' | 'contact_clicks_link'
  | 'contact_unsubscribes' | 'contact_birthday'
  | 'date_based' | 'webhook'

export type AutomationStepType =
  | 'send_email' | 'wait' | 'condition'
  | 'add_tag' | 'remove_tag' | 'add_to_list' | 'remove_from_list'
  | 'update_field' | 'send_webhook' | 'send_sms' | 'end'

export type Automation = {
  id: string
  organization_id: string
  name: string
  status: AutomationStatus
  trigger_type: AutomationTriggerType
  trigger_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type AutomationStep = {
  id: string
  automation_id: string
  type: AutomationStepType
  config: Record<string, unknown>
  position_x: number
  position_y: number
  created_at: string
}

export type AutomationEdge = {
  id: string
  automation_id: string
  source_step_id: string
  target_step_id: string
  label: string | null
}

export type AutomationEnrollment = {
  id: string
  automation_id: string
  contact_id: string
  status: 'active' | 'completed' | 'failed' | 'unsubscribed'
  enrolled_at: string
  completed_at: string | null
}

export type AutomationWithStats = Automation & {
  active_enrollments: number
  completed_enrollments: number
  steps_count: number
}

export type CanvasNodeData = {
  stepType: AutomationStepType | AutomationTriggerType
  config: Record<string, unknown>
  label: string
}

export type CanvasState = {
  nodes: Array<{
    id: string
    type: 'trigger' | 'action' | 'condition' | 'end'
    position: { x: number; y: number }
    data: CanvasNodeData
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    label?: string
    animated?: boolean
  }>
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add package.json package-lock.json lib/automations/types.ts
git commit -m "feat: add automations deps and shared types"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/005_automations.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/005_automations.sql`:
```sql
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
```

- [ ] **Step 2: Apply in Supabase dashboard**

Supabase → SQL Editor → paste `005_automations.sql` → Run.

Verify: all 5 tables exist in Table Editor.

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add supabase/migrations/005_automations.sql
git commit -m "feat: add automations schema"
```

---

## Task 3: Automation Queries + Actions

**Files:**
- Create: `lib/automations/queries.ts`
- Create: `lib/automations/actions.ts`

- [ ] **Step 1: Create queries.ts**

Create `lib/automations/queries.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import type { Automation, AutomationStep, AutomationEdge, AutomationWithStats, CanvasState } from './types'

export async function getAutomations(): Promise<AutomationWithStats[]> {
  const supabase = await createClient()
  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .order('created_at', { ascending: false })

  if (!automations?.length) return []

  const ids = automations.map((a: any) => a.id)

  const { data: enrollments } = await supabase
    .from('automation_enrollments')
    .select('automation_id, status')
    .in('automation_id', ids)

  const { data: steps } = await supabase
    .from('automation_steps')
    .select('automation_id')
    .in('automation_id', ids)

  return automations.map((a: any) => {
    const ae = (enrollments ?? []).filter((e: any) => e.automation_id === a.id)
    const sc = (steps ?? []).filter((s: any) => s.automation_id === a.id).length
    return {
      ...a,
      active_enrollments: ae.filter((e: any) => e.status === 'active').length,
      completed_enrollments: ae.filter((e: any) => e.status === 'completed').length,
      steps_count: sc,
    }
  }) as AutomationWithStats[]
}

export async function getAutomation(id: string): Promise<{
  automation: Automation
  canvas: CanvasState
} | null> {
  const supabase = await createClient()

  const { data: automation } = await supabase
    .from('automations').select('*').eq('id', id).single()
  if (!automation) return null

  const [{ data: steps }, { data: edges }] = await Promise.all([
    supabase.from('automation_steps').select('*').eq('automation_id', id),
    supabase.from('automation_edges').select('*').eq('automation_id', id),
  ])

  // Convert DB rows to React Flow canvas state
  const STEP_TO_NODE_TYPE: Record<string, string> = {
    send_email: 'action', wait: 'action', add_tag: 'action',
    remove_tag: 'action', add_to_list: 'action', remove_from_list: 'action',
    update_field: 'action', send_webhook: 'action', send_sms: 'action',
    condition: 'condition', end: 'end',
  }

  const STEP_LABELS: Record<string, string> = {
    send_email: 'Send Email', wait: 'Wait', condition: 'Condition',
    add_tag: 'Add Tag', remove_tag: 'Remove Tag',
    add_to_list: 'Add to List', remove_from_list: 'Remove from List',
    update_field: 'Update Field', send_webhook: 'Send Webhook',
    send_sms: 'Send SMS', end: 'End',
  }

  const canvas: CanvasState = {
    nodes: (steps ?? []).map((s: any) => ({
      id: s.id,
      type: STEP_TO_NODE_TYPE[s.type] ?? 'action',
      position: { x: s.position_x, y: s.position_y },
      data: { stepType: s.type, config: s.config, label: STEP_LABELS[s.type] ?? s.type },
    })),
    edges: (edges ?? []).map((e: any) => ({
      id: e.id,
      source: e.source_step_id,
      target: e.target_step_id,
      label: e.label ?? undefined,
      animated: true,
    })),
  }

  // Add trigger as first node if automation has trigger_type set
  if (automation.trigger_type) {
    const TRIGGER_LABELS: Record<string, string> = {
      contact_joins_list: 'Joins List', contact_tagged: 'Tagged',
      contact_opens_email: 'Opens Email', contact_clicks_link: 'Clicks Link',
      contact_unsubscribes: 'Unsubscribes', contact_birthday: 'Birthday',
      date_based: 'Date-based', webhook: 'Webhook',
    }
    // Check if trigger node already in steps
    const hasTrigger = canvas.nodes.some(n => n.type === 'trigger')
    if (!hasTrigger) {
      canvas.nodes.unshift({
        id: `trigger-${automation.id}`,
        type: 'trigger',
        position: { x: 200, y: 50 },
        data: {
          stepType: automation.trigger_type,
          config: automation.trigger_config,
          label: TRIGGER_LABELS[automation.trigger_type] ?? automation.trigger_type,
        },
      })
    }
  }

  return { automation: automation as Automation, canvas }
}

export async function getEnrollmentStats(automationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('automation_enrollments')
    .select('status')
    .eq('automation_id', automationId)

  const rows = data ?? []
  return {
    active: rows.filter((r: any) => r.status === 'active').length,
    completed: rows.filter((r: any) => r.status === 'completed').length,
    failed: rows.filter((r: any) => r.status === 'failed').length,
  }
}
```

- [ ] **Step 2: Create actions.ts**

Create `lib/automations/actions.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { AutomationStatus, AutomationTriggerType, CanvasState } from './types'

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles').select('organization_id').eq('id', user.id).single()
  if (!profile) throw new Error('Profile not found')
  return profile.organization_id
}

export async function createAutomation(name: string): Promise<string> {
  const supabase = await createClient()
  const org_id = await getOrgId()
  const { data, error } = await supabase
    .from('automations')
    .insert({ organization_id: org_id, name, trigger_type: 'contact_joins_list' })
    .select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath('/automations')
  return data.id
}

export async function updateAutomation(id: string, input: {
  name?: string
  status?: AutomationStatus
  trigger_type?: AutomationTriggerType
  trigger_config?: Record<string, unknown>
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('automations').update(input).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/automations')
  revalidatePath(`/automations/${id}/edit`)
}

export async function saveCanvas(automationId: string, canvas: CanvasState) {
  const supabase = await createClient()

  // Delete all existing steps and edges (edges cascade from steps)
  await supabase.from('automation_steps').delete().eq('automation_id', automationId)

  // Filter out the virtual trigger node (it's stored on the automation row, not as a step)
  const stepNodes = canvas.nodes.filter(n => n.type !== 'trigger')

  if (stepNodes.length) {
    const { error } = await supabase.from('automation_steps').insert(
      stepNodes.map(n => ({
        id: n.id.startsWith('temp-') ? undefined : n.id,
        automation_id: automationId,
        type: n.data.stepType,
        config: n.data.config,
        position_x: n.position.x,
        position_y: n.position.y,
      }))
    )
    if (error) throw new Error(error.message)
  }

  // Re-fetch step IDs to map temp IDs to real IDs
  const { data: savedSteps } = await supabase
    .from('automation_steps').select('id').eq('automation_id', automationId)

  // Insert edges (skip edges involving the trigger node)
  const validEdges = canvas.edges.filter(
    e => !e.source.startsWith('trigger-') && !e.target.startsWith('trigger-')
  )

  if (validEdges.length && savedSteps?.length) {
    await supabase.from('automation_edges').insert(
      validEdges.map(e => ({
        automation_id: automationId,
        source_step_id: e.source,
        target_step_id: e.target,
        label: e.label ?? null,
      }))
    )
  }

  // Update trigger config from trigger node
  const triggerNode = canvas.nodes.find(n => n.type === 'trigger')
  if (triggerNode) {
    await supabase.from('automations').update({
      trigger_type: triggerNode.data.stepType,
      trigger_config: triggerNode.data.config,
    }).eq('id', automationId)
  }

  revalidatePath('/automations')
  revalidatePath(`/automations/${automationId}/edit`)
}

export async function deleteAutomation(id: string) {
  const supabase = await createClient()
  await supabase.from('automations').delete().eq('id', id)
  revalidatePath('/automations')
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/automations/queries.ts lib/automations/actions.ts
git commit -m "feat: add automation queries and actions"
```

---

## Task 4: Automation Engine (TDD)

**Files:**
- Create: `lib/automations/engine.ts`
- Create: `lib/automations/__tests__/engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/automations/__tests__/engine.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { getWaitDuration } from '../engine'

describe('getWaitDuration', () => {
  it('converts minutes to milliseconds', () => {
    expect(getWaitDuration({ unit: 'minutes', value: 30 }))
      .toBe(30 * 60 * 1000)
  })

  it('converts hours to milliseconds', () => {
    expect(getWaitDuration({ unit: 'hours', value: 2 }))
      .toBe(2 * 60 * 60 * 1000)
  })

  it('converts days to milliseconds', () => {
    expect(getWaitDuration({ unit: 'days', value: 1 }))
      .toBe(24 * 60 * 60 * 1000)
  })

  it('defaults to 1 hour for unknown unit', () => {
    expect(getWaitDuration({ unit: 'unknown', value: 5 }))
      .toBe(60 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/automations/__tests__/engine.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create engine.ts**

Create `lib/automations/engine.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { sendTransactionalEmail, replaceMergeTags } from '@/lib/campaigns/brevo'

export function getWaitDuration(config: { unit: string; value: number }): number {
  const { unit, value } = config
  const ms = {
    minutes: value * 60 * 1000,
    hours: value * 60 * 60 * 1000,
    days: value * 24 * 60 * 60 * 1000,
  }
  return ms[unit as keyof typeof ms] ?? 60 * 60 * 1000
}

export async function enrollContact(
  automationId: string,
  contactId: string
): Promise<void> {
  const supabase = await createClient()

  // Check for existing enrollment (unique constraint handles duplicates)
  const { data: existing } = await supabase
    .from('automation_enrollments')
    .select('id, status')
    .eq('automation_id', automationId)
    .eq('contact_id', contactId)
    .single()

  if (existing?.status === 'active') return // already enrolled

  // Create enrollment
  const { data: enrollment, error } = await supabase
    .from('automation_enrollments')
    .upsert({ automation_id: automationId, contact_id: contactId, status: 'active' },
             { onConflict: 'automation_id,contact_id' })
    .select('id').single()

  if (error || !enrollment) return

  // Find first step (step with no incoming edges)
  const { data: steps } = await supabase
    .from('automation_steps')
    .select('id')
    .eq('automation_id', automationId)

  const { data: edges } = await supabase
    .from('automation_edges')
    .select('target_step_id')
    .eq('automation_id', automationId)

  const targetIds = new Set((edges ?? []).map((e: any) => e.target_step_id))
  const firstStep = (steps ?? []).find((s: any) => !targetIds.has(s.id))

  if (!firstStep) return

  // Queue first step
  await supabase.from('automation_step_states').insert({
    enrollment_id: enrollment.id,
    step_id: firstStep.id,
    status: 'pending',
    execute_at: new Date().toISOString(),
  })
}

export async function processScheduledSteps(): Promise<{ processed: number; errors: number }> {
  const supabase = await createClient()
  let processed = 0
  let errors = 0

  // Fetch up to 100 pending steps due for execution
  const { data: pendingStates } = await supabase
    .from('automation_step_states')
    .select(`
      id, enrollment_id, step_id,
      enrollment:automation_enrollments(id, automation_id, contact_id, status),
      step:automation_steps(id, type, config, automation_id)
    `)
    .eq('status', 'pending')
    .lte('execute_at', new Date().toISOString())
    .limit(100)

  for (const state of pendingStates ?? []) {
    const enrollment = state.enrollment as any
    const step = state.step as any

    if (!enrollment || !step) continue
    if (enrollment.status !== 'active') continue

    // Mark as processing
    await supabase.from('automation_step_states')
      .update({ status: 'processing' }).eq('id', state.id)

    try {
      await executeStep(state.id, enrollment, step)
      processed++
    } catch (err: any) {
      await supabase.from('automation_step_states')
        .update({ status: 'failed', error: err.message, executed_at: new Date().toISOString() })
        .eq('id', state.id)
      await supabase.from('automation_enrollments')
        .update({ status: 'failed' }).eq('id', enrollment.id)
      errors++
    }
  }

  return { processed, errors }
}

async function executeStep(
  stateId: string,
  enrollment: { id: string; automation_id: string; contact_id: string },
  step: { id: string; type: string; config: Record<string, unknown>; automation_id: string }
): Promise<void> {
  const supabase = await createClient()

  // Fetch contact data
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company, status, custom_fields')
    .eq('id', enrollment.contact_id)
    .single()

  if (!contact) throw new Error('Contact not found')

  switch (step.type) {
    case 'send_email': {
      const { campaign_id } = step.config as { campaign_id: string }
      const { data: campaign } = await supabase
        .from('campaigns').select('*').eq('id', campaign_id).single()
      if (!campaign || !campaign.content_html) throw new Error('Campaign not found or has no content')

      const html = replaceMergeTags(campaign.content_html, {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        company: contact.company,
      })

      const messageId = await sendTransactionalEmail({
        to: { email: contact.email, name: `${contact.first_name} ${contact.last_name}`.trim() || contact.email },
        subject: campaign.subject,
        htmlContent: html,
        fromName: campaign.from_name,
        fromEmail: campaign.from_email,
      })

      // Record the send
      await supabase.from('campaign_sends').upsert({
        campaign_id,
        contact_id: contact.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        brevo_message_id: messageId,
      }, { onConflict: 'campaign_id,contact_id' })
      break
    }

    case 'wait': {
      const duration = getWaitDuration(step.config as { unit: string; value: number })
      const executeAt = new Date(Date.now() + duration).toISOString()
      await advanceToNextStep(supabase, stateId, enrollment, step, executeAt)
      return
    }

    case 'condition': {
      const { condition_type, value } = step.config as { condition_type: string; value: string }
      let result = false

      if (condition_type === 'has_tag') {
        const { data: tag } = await supabase
          .from('tags').select('id').eq('name', value)
          .eq('organization_id', (await supabase.from('contacts').select('organization_id').eq('id', contact.id).single()).data?.organization_id)
          .single()
        if (tag) {
          const { data: ct } = await supabase
            .from('contact_tags').select('contact_id')
            .eq('contact_id', contact.id).eq('tag_id', tag.id).single()
          result = !!ct
        }
      } else if (condition_type === 'field_equals') {
        const { field, val } = step.config as any
        result = String(contact.custom_fields?.[field] ?? '') === String(val)
      }

      // Find yes/no edge
      const { data: edges } = await supabase
        .from('automation_edges')
        .select('id, target_step_id, label')
        .eq('source_step_id', step.id)

      const branch = result ? 'yes' : 'no'
      const nextEdge = (edges ?? []).find((e: any) => e.label === branch)

      if (nextEdge) {
        await supabase.from('automation_step_states').update({
          status: 'completed', executed_at: new Date().toISOString(),
        }).eq('id', stateId)
        await supabase.from('automation_step_states').insert({
          enrollment_id: enrollment.id,
          step_id: nextEdge.target_step_id,
          status: 'pending',
          execute_at: new Date().toISOString(),
        })
      } else {
        // No matching branch — complete enrollment
        await completeEnrollment(supabase, stateId, enrollment.id)
      }
      return
    }

    case 'add_tag': {
      const { tag_name } = step.config as { tag_name: string }
      const { data: contact_row } = await supabase
        .from('contacts').select('organization_id').eq('id', contact.id).single()
      const { data: tag } = await supabase
        .from('tags').select('id').eq('name', tag_name)
        .eq('organization_id', contact_row?.organization_id).single()
      if (tag) {
        await supabase.from('contact_tags')
          .upsert({ contact_id: contact.id, tag_id: tag.id }, { onConflict: 'contact_id,tag_id' })
      }
      break
    }

    case 'remove_tag': {
      const { tag_name } = step.config as { tag_name: string }
      const { data: contact_row } = await supabase
        .from('contacts').select('organization_id').eq('id', contact.id).single()
      const { data: tag } = await supabase
        .from('tags').select('id').eq('name', tag_name)
        .eq('organization_id', contact_row?.organization_id).single()
      if (tag) {
        await supabase.from('contact_tags')
          .delete().eq('contact_id', contact.id).eq('tag_id', tag.id)
      }
      break
    }

    case 'add_to_list': {
      const { list_id } = step.config as { list_id: string }
      await supabase.from('contact_lists')
        .upsert({ contact_id: contact.id, list_id }, { onConflict: 'contact_id,list_id' })
      break
    }

    case 'remove_from_list': {
      const { list_id } = step.config as { list_id: string }
      await supabase.from('contact_lists')
        .delete().eq('contact_id', contact.id).eq('list_id', list_id)
      break
    }

    case 'update_field': {
      const { field_key, value: newValue } = step.config as { field_key: string; value: string }
      const currentFields = (contact.custom_fields as Record<string, unknown>) ?? {}
      await supabase.from('contacts')
        .update({ custom_fields: { ...currentFields, [field_key]: newValue } })
        .eq('id', contact.id)
      break
    }

    case 'send_webhook': {
      const { url, method = 'POST' } = step.config as { url: string; method?: string }
      await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contact: { id: contact.id, email: contact.email, first_name: contact.first_name, last_name: contact.last_name },
          automation_id: enrollment.automation_id,
        }),
      })
      break
    }

    case 'end':
      await completeEnrollment(supabase, stateId, enrollment.id)
      return
  }

  // Advance to next step (default: find the single outgoing edge)
  await advanceToNextStep(supabase, stateId, enrollment, step, new Date().toISOString())
}

async function advanceToNextStep(
  supabase: any,
  stateId: string,
  enrollment: { id: string },
  step: { id: string },
  executeAt: string
) {
  await supabase.from('automation_step_states').update({
    status: 'completed', executed_at: new Date().toISOString(),
  }).eq('id', stateId)

  const { data: edges } = await supabase
    .from('automation_edges').select('target_step_id').eq('source_step_id', step.id)

  const nextEdge = (edges ?? [])[0]
  if (nextEdge) {
    await supabase.from('automation_step_states').insert({
      enrollment_id: enrollment.id,
      step_id: nextEdge.target_step_id,
      status: 'pending',
      execute_at: executeAt,
    })
  } else {
    // No next step — complete enrollment
    await supabase.from('automation_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollment.id)
  }
}

async function completeEnrollment(supabase: any, stateId: string, enrollmentId: string) {
  await supabase.from('automation_step_states').update({
    status: 'completed', executed_at: new Date().toISOString(),
  }).eq('id', stateId)
  await supabase.from('automation_enrollments').update({
    status: 'completed', completed_at: new Date().toISOString(),
  }).eq('id', enrollmentId)
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run lib/automations/__tests__/engine.test.ts
```
Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/automations/engine.ts lib/automations/__tests__/engine.test.ts
git commit -m "feat: add automation engine"
```

---

## Task 5: Custom React Flow Nodes

**Files:**
- Create: `components/automations/nodes/TriggerNode.tsx`
- Create: `components/automations/nodes/ActionNode.tsx`
- Create: `components/automations/nodes/ConditionNode.tsx`
- Create: `components/automations/nodes/EndNode.tsx`

- [ ] **Step 1: Create TriggerNode**

Create `components/automations/nodes/TriggerNode.tsx`:
```typescript
'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '@/lib/automations/types'

const TRIGGER_ICONS: Record<string, string> = {
  contact_joins_list: '⚡',
  contact_tagged: '🏷️',
  contact_opens_email: '📬',
  contact_clicks_link: '🔗',
  contact_unsubscribes: '🚫',
  contact_birthday: '🎂',
  date_based: '📅',
  webhook: '🔌',
}

const TRIGGER_LABELS: Record<string, string> = {
  contact_joins_list: 'Joins List',
  contact_tagged: 'Gets Tagged',
  contact_opens_email: 'Opens Email',
  contact_clicks_link: 'Clicks Link',
  contact_unsubscribes: 'Unsubscribes',
  contact_birthday: 'Birthday',
  date_based: 'Date-based',
  webhook: 'Webhook',
}

export default function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  const icon = TRIGGER_ICONS[nodeData.stepType] ?? '⚡'
  const label = TRIGGER_LABELS[nodeData.stepType] ?? nodeData.label

  return (
    <div className={`flex min-w-48 items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 shadow-sm ${
      selected ? 'border-blue-500 shadow-blue-100' : 'border-blue-300'
    }`}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg">
        {icon}
      </div>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-500">Trigger</p>
        <p className="text-xs font-medium text-slate-800">{label}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-2 !h-2" />
    </div>
  )
}
```

- [ ] **Step 2: Create ActionNode**

Create `components/automations/nodes/ActionNode.tsx`:
```typescript
'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '@/lib/automations/types'

const ACTION_ICONS: Record<string, string> = {
  send_email: '✉️', wait: '⏱', add_tag: '🏷️', remove_tag: '🗑️',
  add_to_list: '📋', remove_from_list: '📤', update_field: '✏️',
  send_webhook: '🔗', send_sms: '💬',
}

export default function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  const icon = ACTION_ICONS[nodeData.stepType] ?? '⚙️'

  return (
    <div className={`flex min-w-48 items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 shadow-sm ${
      selected ? 'border-blue-500 shadow-blue-100' : 'border-slate-200'
    }`}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50 text-lg">
        {icon}
      </div>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{nodeData.label}</p>
        <p className="text-xs text-slate-600 truncate max-w-32">
          {String(nodeData.config.campaign_id || nodeData.config.tag_name || nodeData.config.list_id || nodeData.config.url || '')}
        </p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2 !h-2" />
    </div>
  )
}
```

- [ ] **Step 3: Create ConditionNode**

Create `components/automations/nodes/ConditionNode.tsx`:
```typescript
'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '@/lib/automations/types'

export default function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData

  return (
    <div className={`relative flex min-w-48 items-center gap-3 rounded-xl border-2 bg-purple-50 px-4 py-3 shadow-sm ${
      selected ? 'border-purple-500 shadow-purple-100' : 'border-purple-300'
    }`}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 text-lg">
        ◆
      </div>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-purple-500">Condition</p>
        <p className="text-xs font-medium text-slate-800">
          {String(nodeData.config.condition_type || 'Set condition...')}
        </p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-2 !h-2" />
      {/* YES handle (left) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '30%' }}
        className="!bg-green-500 !w-2 !h-2"
      />
      {/* NO handle (right) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '70%' }}
        className="!bg-red-400 !w-2 !h-2"
      />
      <div className="absolute -bottom-4 left-[28%] text-[8px] font-semibold text-green-600">YES</div>
      <div className="absolute -bottom-4 left-[67%] text-[8px] font-semibold text-red-500">NO</div>
    </div>
  )
}
```

- [ ] **Step 4: Create EndNode**

Create `components/automations/nodes/EndNode.tsx`:
```typescript
'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

export default function EndNode({ selected }: NodeProps) {
  return (
    <div className={`flex min-w-36 items-center justify-center gap-2 rounded-xl border-2 bg-red-50 px-4 py-3 shadow-sm ${
      selected ? 'border-red-500 shadow-red-100' : 'border-red-200'
    }`}>
      <span className="text-lg">🚫</span>
      <p className="text-xs font-semibold text-red-600">End</p>
      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-2 !h-2" />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/automations/nodes/
git commit -m "feat: add React Flow custom nodes"
```

---

## Task 6: StepPalette + StepConfigPanel

**Files:**
- Create: `components/automations/StepPalette.tsx`
- Create: `components/automations/StepConfigPanel.tsx`

- [ ] **Step 1: Create StepPalette**

Create `components/automations/StepPalette.tsx`:
```typescript
'use client'

type Props = {
  onDragStart: (event: React.DragEvent, stepType: string, nodeType: string) => void
}

const TRIGGERS = [
  { type: 'contact_joins_list', label: 'Joins List', icon: '⚡', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_tagged', label: 'Gets Tagged', icon: '🏷️', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_opens_email', label: 'Opens Email', icon: '📬', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_clicks_link', label: 'Clicks Link', icon: '🔗', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'contact_unsubscribes', label: 'Unsubscribes', icon: '🚫', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { type: 'webhook', label: 'Webhook', icon: '🔌', color: 'bg-amber-50 border-amber-200 text-amber-700' },
]

const ACTIONS = [
  { type: 'send_email', label: 'Send Email', icon: '✉️', nodeType: 'action' },
  { type: 'wait', label: 'Wait', icon: '⏱', nodeType: 'action' },
  { type: 'condition', label: 'Condition', icon: '◆', nodeType: 'condition' },
  { type: 'add_tag', label: 'Add Tag', icon: '🏷️', nodeType: 'action' },
  { type: 'remove_tag', label: 'Remove Tag', icon: '🗑️', nodeType: 'action' },
  { type: 'add_to_list', label: 'Add to List', icon: '📋', nodeType: 'action' },
  { type: 'remove_from_list', label: 'Remove from List', icon: '📤', nodeType: 'action' },
  { type: 'update_field', label: 'Update Field', icon: '✏️', nodeType: 'action' },
  { type: 'send_webhook', label: 'Send Webhook', icon: '🔗', nodeType: 'action' },
  { type: 'end', label: 'End', icon: '🚫', nodeType: 'end' },
]

export default function StepPalette({ onDragStart }: Props) {
  return (
    <div className="flex flex-col gap-0 overflow-y-auto bg-white border-r border-slate-200 p-3 w-40 flex-shrink-0">
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Triggers</p>
      {TRIGGERS.map(t => (
        <div
          key={t.type}
          draggable
          onDragStart={e => onDragStart(e, t.type, 'trigger')}
          className={`mb-1.5 flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-xs active:cursor-grabbing ${t.color}`}
        >
          <span>{t.icon}</span>
          <span className="truncate">{t.label}</span>
        </div>
      ))}

      <p className="mb-2 mt-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Actions</p>
      {ACTIONS.map(a => (
        <div
          key={a.type}
          draggable
          onDragStart={e => onDragStart(e, a.type, a.nodeType)}
          className="mb-1.5 flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:cursor-grabbing"
        >
          <span>{a.icon}</span>
          <span className="truncate">{a.label}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create StepConfigPanel**

Create `components/automations/StepConfigPanel.tsx`:
```typescript
'use client'

import type { CanvasNodeData } from '@/lib/automations/types'
import type { List, Tag } from '@/lib/contacts/types'
import type { Campaign } from '@/lib/campaigns/types'

type Props = {
  nodeId: string
  data: CanvasNodeData
  lists: List[]
  tags: Tag[]
  campaigns: Campaign[]
  onChange: (nodeId: string, config: Record<string, unknown>) => void
  onDelete: (nodeId: string) => void
}

export default function StepConfigPanel({ nodeId, data, lists, tags, campaigns, onChange, onDelete }: Props) {
  function update(key: string, value: unknown) {
    onChange(nodeId, { ...data.config, [key]: value })
  }

  return (
    <div className="w-52 flex-shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
      <p className="mb-4 text-xs font-semibold text-slate-900">
        {data.label || data.stepType}
      </p>

      {data.stepType === 'send_email' && (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Campaign</label>
            <select
              value={String(data.config.campaign_id ?? '')}
              onChange={e => update('campaign_id', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              <option value="">Select campaign...</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {data.stepType === 'wait' && (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Duration</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={Number(data.config.value ?? 1)}
                onChange={e => update('value', Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              />
              <select
                value={String(data.config.unit ?? 'hours')}
                onChange={e => update('unit', e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {data.stepType === 'condition' && (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Condition type</label>
            <select
              value={String(data.config.condition_type ?? '')}
              onChange={e => update('condition_type', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              <option value="">Select...</option>
              <option value="has_tag">Has tag</option>
              <option value="field_equals">Field equals</option>
            </select>
          </div>
          {data.config.condition_type === 'has_tag' && (
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Tag</label>
              <select
                value={String(data.config.value ?? '')}
                onChange={e => update('value', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              >
                <option value="">Select tag...</option>
                {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {(data.stepType === 'add_tag' || data.stepType === 'remove_tag') && (
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">Tag</label>
          <select
            value={String(data.config.tag_name ?? '')}
            onChange={e => update('tag_name', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
          >
            <option value="">Select tag...</option>
            {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
      )}

      {(data.stepType === 'add_to_list' || data.stepType === 'remove_from_list') && (
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">List</label>
          <select
            value={String(data.config.list_id ?? '')}
            onChange={e => update('list_id', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
          >
            <option value="">Select list...</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {data.stepType === 'send_webhook' && (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Webhook URL</label>
            <input
              type="url"
              value={String(data.config.url ?? '')}
              onChange={e => update('url', e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {data.stepType === 'contact_joins_list' && (
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">List</label>
          <select
            value={String(data.config.list_id ?? '')}
            onChange={e => update('list_id', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
          >
            <option value="">Any list</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <button
          onClick={() => onDelete(nodeId)}
          className="w-full rounded-lg bg-red-50 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
        >
          Delete step
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/automations/StepPalette.tsx components/automations/StepConfigPanel.tsx
git commit -m "feat: add StepPalette and StepConfigPanel"
```

---

## Task 7: AutomationCanvas + AutomationBuilderClient

**Files:**
- Create: `components/automations/AutomationCanvas.tsx`
- Create: `app/(dashboard)/automations/[id]/edit/AutomationBuilderClient.tsx`
- Create: `app/(dashboard)/automations/[id]/edit/page.tsx`
- Create: `app/(dashboard)/automations/[id]/page.tsx`

- [ ] **Step 1: Create AutomationCanvas**

Create `components/automations/AutomationCanvas.tsx`:
```typescript
'use client'

import { useCallback, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import TriggerNode from './nodes/TriggerNode'
import ActionNode from './nodes/ActionNode'
import ConditionNode from './nodes/ConditionNode'
import EndNode from './nodes/EndNode'
import type { CanvasState, CanvasNodeData } from '@/lib/automations/types'

const NODE_TYPES = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  end: EndNode,
}

type Props = {
  initialCanvas: CanvasState
  onNodesChange: (nodes: Node[]) => void
  onEdgesChange: (edges: Edge[]) => void
  onNodeSelect: (nodeId: string | null, data: CanvasNodeData | null) => void
}

let nodeCounter = 0

export default function AutomationCanvas({
  initialCanvas, onNodesChange, onEdgesChange, onNodeSelect,
}: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes, handleNodesChange] = useNodesState(initialCanvas.nodes as Node[])
  const [edges, setEdges, handleEdgesChange] = useEdgesState(initialCanvas.edges as Edge[])

  const handleConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, animated: true }, eds))
  }, [])

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const stepType = event.dataTransfer.getData('stepType')
    const nodeType = event.dataTransfer.getData('nodeType')
    if (!stepType) return

    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    if (!bounds) return

    const position = {
      x: event.clientX - bounds.left - 96,
      y: event.clientY - bounds.top - 20,
    }

    const STEP_LABELS: Record<string, string> = {
      send_email: 'Send Email', wait: 'Wait', condition: 'Condition',
      add_tag: 'Add Tag', remove_tag: 'Remove Tag', add_to_list: 'Add to List',
      remove_from_list: 'Remove from List', update_field: 'Update Field',
      send_webhook: 'Send Webhook', send_sms: 'Send SMS', end: 'End',
      contact_joins_list: 'Joins List', contact_tagged: 'Gets Tagged',
      contact_opens_email: 'Opens Email', contact_clicks_link: 'Clicks Link',
      contact_unsubscribes: 'Unsubscribes', webhook: 'Webhook',
    }

    const newNode: Node = {
      id: `temp-${++nodeCounter}-${Date.now()}`,
      type: nodeType,
      position,
      data: {
        stepType,
        config: {},
        label: STEP_LABELS[stepType] ?? stepType,
      } as unknown as Record<string, unknown>,
    }

    setNodes(nds => {
      const updated = [...nds, newNode]
      onNodesChange(updated)
      return updated
    })
  }

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    onNodeSelect(node.id, node.data as unknown as CanvasNodeData)
  }

  function handlePaneClick() {
    onNodeSelect(null, null)
  }

  return (
    <div ref={reactFlowWrapper} className="flex-1 min-h-0"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={changes => {
          handleNodesChange(changes)
          setNodes(nds => { onNodesChange(nds); return nds })
        }}
        onEdgesChange={changes => {
          handleEdgesChange(changes)
          setEdges(eds => { onEdgesChange(eds); return eds })
        }}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        className="bg-slate-50"
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Create AutomationBuilderClient**

Create `app/(dashboard)/automations/[id]/edit/AutomationBuilderClient.tsx`:
```typescript
'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import StepPalette from '@/components/automations/StepPalette'
import StepConfigPanel from '@/components/automations/StepConfigPanel'
import { saveCanvas, updateAutomation } from '@/lib/automations/actions'
import type { Automation, CanvasState, CanvasNodeData } from '@/lib/automations/types'
import type { List, Tag } from '@/lib/contacts/types'
import type { Campaign } from '@/lib/campaigns/types'
import type { Node, Edge } from '@xyflow/react'

const AutomationCanvas = dynamic(
  () => import('@/components/automations/AutomationCanvas'),
  { ssr: false, loading: () => <div className="flex-1 bg-slate-50 flex items-center justify-center text-sm text-slate-400">Loading canvas...</div> }
)

type Props = {
  automation: Automation
  canvas: CanvasState
  lists: List[]
  tags: Tag[]
  campaigns: Campaign[]
  stats: { active: number; completed: number; failed: number }
}

export default function AutomationBuilderClient({
  automation, canvas, lists, tags, campaigns, stats
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(automation.name)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeData, setSelectedNodeData] = useState<CanvasNodeData | null>(null)
  const nodesRef = useRef<Node[]>(canvas.nodes as Node[])
  const edgesRef = useRef<Edge[]>(canvas.edges as Edge[])

  const handleNodesChange = useCallback((nodes: Node[]) => {
    nodesRef.current = nodes
  }, [])

  const handleEdgesChange = useCallback((edges: Edge[]) => {
    edgesRef.current = edges
  }, [])

  function handleNodeSelect(nodeId: string | null, data: CanvasNodeData | null) {
    setSelectedNodeId(nodeId)
    setSelectedNodeData(data)
  }

  function handleNodeConfigChange(nodeId: string, config: Record<string, unknown>) {
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, data: { ...(n.data as any), config } } : n
    )
    setSelectedNodeData(prev => prev ? { ...prev, config } : prev)
  }

  function handleNodeDelete(nodeId: string) {
    nodesRef.current = nodesRef.current.filter(n => n.id !== nodeId)
    edgesRef.current = edgesRef.current.filter(
      e => e.source !== nodeId && e.target !== nodeId
    )
    setSelectedNodeId(null)
    setSelectedNodeData(null)
  }

  function handleDragStart(event: React.DragEvent, stepType: string, nodeType: string) {
    event.dataTransfer.setData('stepType', stepType)
    event.dataTransfer.setData('nodeType', nodeType)
  }

  async function handleSave() {
    const canvasState: CanvasState = {
      nodes: nodesRef.current.map(n => ({
        id: n.id,
        type: n.type as any,
        position: n.position,
        data: n.data as unknown as CanvasNodeData,
      })),
      edges: edgesRef.current.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label as string | undefined,
        animated: true,
      })),
    }
    startTransition(async () => {
      await saveCanvas(automation.id, canvasState)
    })
  }

  function handleNameBlur() {
    if (name !== automation.name && name.trim()) {
      startTransition(async () => {
        await updateAutomation(automation.id, { name: name.trim() })
      })
    }
  }

  async function handleToggleStatus() {
    const newStatus = automation.status === 'active' ? 'paused' : 'active'
    startTransition(async () => {
      await updateAutomation(automation.id, { status: newStatus })
      router.refresh()
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden -m-6">
      {/* Toolbar */}
      <div className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/automations" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 pr-3 border-r border-slate-200">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Automations
        </Link>

        <input
          className="flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none max-w-xs"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Automation name..."
        />

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center bg-slate-100 rounded-full p-0.5">
            <button
              onClick={() => automation.status !== 'draft' && handleToggleStatus()}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                automation.status === 'draft' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
              }`}
            >Draft</button>
            <button
              onClick={() => automation.status !== 'active' && handleToggleStatus()}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                automation.status === 'active' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500'
              }`}
            >Active</button>
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <StepPalette onDragStart={handleDragStart} />

        <AutomationCanvas
          initialCanvas={canvas}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeSelect={handleNodeSelect}
        />

        {selectedNodeId && selectedNodeData && (
          <StepConfigPanel
            nodeId={selectedNodeId}
            data={selectedNodeData}
            lists={lists}
            tags={tags}
            campaigns={campaigns}
            onChange={handleNodeConfigChange}
            onDelete={handleNodeDelete}
          />
        )}
      </div>

      {/* Stats bar */}
      <div className="flex h-7 flex-shrink-0 items-center gap-6 border-t border-slate-200 bg-white px-4">
        <span className="text-[10px] text-slate-500">
          Active enrollments: <span className="font-medium text-slate-700">{stats.active}</span>
        </span>
        <span className="text-[10px] text-slate-500">
          Completed: <span className="font-medium text-slate-700">{stats.completed}</span>
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create builder page**

Create `app/(dashboard)/automations/[id]/edit/page.tsx`:
```typescript
import { notFound } from 'next/navigation'
import { getAutomation, getEnrollmentStats } from '@/lib/automations/queries'
import { getLists, getTags } from '@/lib/contacts/queries'
import { getCampaigns } from '@/lib/campaigns/queries'
import AutomationBuilderClient from './AutomationBuilderClient'

type Props = { params: Promise<{ id: string }> }

export default async function AutomationBuilderPage({ params }: Props) {
  const { id } = await params
  const [result, lists, tags, campaigns, stats] = await Promise.all([
    getAutomation(id),
    getLists(),
    getTags(),
    getCampaigns(),
    getEnrollmentStats(id),
  ])
  if (!result) notFound()

  return (
    <AutomationBuilderClient
      automation={result.automation}
      canvas={result.canvas}
      lists={lists}
      tags={tags}
      campaigns={campaigns}
      stats={stats}
    />
  )
}
```

- [ ] **Step 4: Create [id] redirect**

Create `app/(dashboard)/automations/[id]/page.tsx`:
```typescript
import { redirect } from 'next/navigation'
type Props = { params: Promise<{ id: string }> }
export default async function AutomationPage({ params }: Props) {
  const { id } = await params
  redirect(`/automations/${id}/edit`)
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/automations/AutomationCanvas.tsx \
  app/(dashboard)/automations/[id]/
git commit -m "feat: add automation canvas and builder pages"
```

---

## Task 8: AutomationsList + List/New Pages

**Files:**
- Create: `components/automations/AutomationsList.tsx`
- Modify: `app/(dashboard)/automations/page.tsx`
- Create: `app/(dashboard)/automations/new/page.tsx`

- [ ] **Step 1: Create AutomationsList**

Create `components/automations/AutomationsList.tsx`:
```typescript
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteAutomation, updateAutomation } from '@/lib/automations/actions'
import type { AutomationWithStats, AutomationStatus } from '@/lib/automations/types'

const STATUS_STYLES: Record<AutomationStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
}

export default function AutomationsList({ automations }: { automations: AutomationWithStats[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    startTransition(async () => { await deleteAutomation(id); router.refresh() })
  }

  function handleToggle(id: string, status: AutomationStatus) {
    const newStatus = status === 'active' ? 'paused' : 'active'
    startTransition(async () => { await updateAutomation(id, { status: newStatus }); router.refresh() })
  }

  if (automations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
          <span className="text-2xl">⚡</span>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">No automations yet</h3>
        <p className="mt-1.5 text-xs text-slate-500">Automate your email sequences and contact management</p>
        <Link href="/automations/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
          + Create your first automation
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Automation</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Active</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Completed</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Steps</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {automations.map(a => (
            <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/automations/${a.id}/edit`} className="font-medium text-slate-900 hover:text-blue-600">
                  {a.name}
                </Link>
                <p className="mt-0.5 text-slate-400">{a.trigger_type.replace(/_/g, ' ')}</p>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[a.status]}`}>
                  {a.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">{a.active_enrollments}</td>
              <td className="px-4 py-3 text-slate-600">{a.completed_enrollments}</td>
              <td className="px-4 py-3 text-slate-400">{a.steps_count}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => handleToggle(a.id, a.status)}
                    disabled={isPending || a.status === 'draft'}
                    className="text-xs text-blue-500 hover:underline disabled:opacity-40"
                  >
                    {a.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(a.id, a.name)}
                    disabled={isPending}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Replace automations page**

Replace `app/(dashboard)/automations/page.tsx`:
```typescript
import Link from 'next/link'
import { getAutomations } from '@/lib/automations/queries'
import AutomationsList from '@/components/automations/AutomationsList'

export default async function AutomationsPage() {
  const automations = await getAutomations()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Automations</h1>
          <p className="text-sm text-slate-500">{automations.length} automations</p>
        </div>
        <Link href="/automations/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New Automation
        </Link>
      </div>
      <AutomationsList automations={automations} />
    </div>
  )
}
```

- [ ] **Step 3: Create new automation page**

Create `app/(dashboard)/automations/new/page.tsx`:
```typescript
import { redirect } from 'next/navigation'
import { createAutomation } from '@/lib/automations/actions'

export default async function NewAutomationPage() {
  const id = await createAutomation('Untitled Automation')
  redirect(`/automations/${id}/edit`)
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/poledilip/email-marketing-saas
git add components/automations/AutomationsList.tsx \
  app/(dashboard)/automations/page.tsx \
  app/(dashboard)/automations/new/page.tsx
git commit -m "feat: add automations list page"
```

---

## Task 9: Cron Route + Webhook Trigger + vercel.json

**Files:**
- Create: `app/api/cron/process-automations/route.ts`
- Create: `app/api/webhooks/automation/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create process-automations cron route**

Create `app/api/cron/process-automations/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { processScheduledSteps } from '@/lib/automations/engine'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processScheduledSteps()
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Create webhook automation trigger route**

Create `app/api/webhooks/automation/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrollContact } from '@/lib/automations/engine'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.email || !body?.automation_id) {
    return NextResponse.json({ error: 'Missing email or automation_id' }, { status: 400 })
  }

  const supabase = await createClient()

  // Look up automation to get org_id
  const { data: automation } = await supabase
    .from('automations')
    .select('id, organization_id, status')
    .eq('id', body.automation_id)
    .single()

  if (!automation || automation.status !== 'active') {
    return NextResponse.json({ error: 'Automation not found or not active' }, { status: 404 })
  }

  // Find contact by email in that org
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', body.email)
    .eq('organization_id', automation.organization_id)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  await enrollContact(automation.id, contact.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Update vercel.json**

Update `vercel.json` to add the automations cron:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-scheduled",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/process-automations",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

- [ ] **Step 4: Run all tests + final tag**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 5: Commit + tag**

```bash
cd /Users/poledilip/email-marketing-saas
git add app/api/cron/process-automations/ \
  app/api/webhooks/automation/ \
  vercel.json
git commit -m "feat: add automation cron + webhook trigger"
git tag v0.4.0-automations
```

---

## Task 10: Trigger Integration

**Files:**
- Modify: `lib/contacts/actions.ts`
- Modify: `app/api/webhooks/brevo/route.ts`

- [ ] **Step 1: Add enrollment trigger to createContact and list/tag actions**

In `lib/contacts/actions.ts`, after the `createContact` function's list/tag inserts, add automation enrollment checks. Add this helper at the top of the file (after existing imports):

```typescript
import { enrollContact } from '@/lib/automations/engine'

async function triggerAutomations(
  supabase: any,
  orgId: string,
  contactId: string,
  triggerType: string,
  triggerConfig: Record<string, unknown>
) {
  const { data: automations } = await supabase
    .from('automations')
    .select('id, trigger_type, trigger_config')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .eq('trigger_type', triggerType)

  for (const automation of automations ?? []) {
    // Check trigger config matches (e.g. specific list_id)
    const configListId = automation.trigger_config?.list_id
    if (configListId && configListId !== triggerConfig.list_id) continue
    const configTagName = automation.trigger_config?.tag_name
    if (configTagName && configTagName !== triggerConfig.tag_name) continue

    await enrollContact(automation.id, contactId).catch(() => {})
  }
}
```

Then in the `createContact` function, after list inserts:
```typescript
// After: if (input.list_ids?.length) { ... }
if (input.list_ids?.length) {
  for (const list_id of input.list_ids) {
    await triggerAutomations(supabase, org_id, contact.id, 'contact_joins_list', { list_id })
  }
}
// After: if (input.tag_ids?.length) { ... }
if (input.tag_ids?.length) {
  const { data: tagRows } = await supabase.from('tags').select('name').in('id', input.tag_ids)
  for (const tag of tagRows ?? []) {
    await triggerAutomations(supabase, org_id, contact.id, 'contact_tagged', { tag_name: tag.name })
  }
}
```

- [ ] **Step 2: Add triggers to Brevo webhook handler**

In `app/api/webhooks/brevo/route.ts`, after handling `opened` and `clicked` events, add automation enrollment. After the `switch` statement update block:

```typescript
// After the switch statement that builds `update`:
if (Object.keys(update).length) {
  await supabase.from('campaign_sends').update(update).eq('id', send.id)
}

// Trigger automations based on event
if (body.event === 'opened' || body.event === 'clicked' || body.event === 'unsubscribed') {
  const { data: cs } = await supabase
    .from('campaign_sends')
    .select('contact_id, campaign_id')
    .eq('id', send.id)
    .single()

  if (cs) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('organization_id')
      .eq('id', cs.contact_id)
      .single()

    if (contact) {
      const triggerMap: Record<string, string> = {
        opened: 'contact_opens_email',
        clicked: 'contact_clicks_link',
        unsubscribed: 'contact_unsubscribes',
      }
      const triggerType = triggerMap[body.event]
      if (triggerType) {
        const { data: automations } = await supabase
          .from('automations')
          .select('id')
          .eq('organization_id', contact.organization_id)
          .eq('status', 'active')
          .eq('trigger_type', triggerType)

        for (const automation of automations ?? []) {
          await enrollContact(automation.id, cs.contact_id).catch(() => {})
        }
      }
    }
  }
}
```

Add `enrollContact` import at top of `app/api/webhooks/brevo/route.ts`:
```typescript
import { enrollContact } from '@/lib/automations/engine'
```

- [ ] **Step 3: Run all tests**

```bash
cd /Users/poledilip/email-marketing-saas
npm run test:run
```
Expected: all tests pass

- [ ] **Step 4: Commit + push**

```bash
cd /Users/poledilip/email-marketing-saas
git add lib/contacts/actions.ts app/api/webhooks/brevo/route.ts
git commit -m "feat: wire automation enrollment triggers"
git push origin main --tags
```
