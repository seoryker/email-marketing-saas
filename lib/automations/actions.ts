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

  await supabase.from('automation_steps').delete().eq('automation_id', automationId)

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

  const validEdges = canvas.edges.filter(
    e => !e.source.startsWith('trigger-') && !e.target.startsWith('trigger-')
  )

  if (validEdges.length) {
    await supabase.from('automation_edges').insert(
      validEdges.map(e => ({
        automation_id: automationId,
        source_step_id: e.source,
        target_step_id: e.target,
        label: e.label ?? null,
      }))
    )
  }

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
