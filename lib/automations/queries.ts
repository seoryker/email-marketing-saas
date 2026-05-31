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
      type: (STEP_TO_NODE_TYPE[s.type] ?? 'action') as 'trigger' | 'action' | 'condition' | 'end',
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

  if (automation.trigger_type) {
    const TRIGGER_LABELS: Record<string, string> = {
      contact_joins_list: 'Joins List', contact_tagged: 'Tagged',
      contact_opens_email: 'Opens Email', contact_clicks_link: 'Clicks Link',
      contact_unsubscribes: 'Unsubscribes', contact_birthday: 'Birthday',
      date_based: 'Date-based', webhook: 'Webhook',
    }
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
