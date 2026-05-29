import { createClient } from '@/lib/supabase/server'
import { sendTransactionalEmail, replaceMergeTags } from '@/lib/campaigns/brevo'

export function getWaitDuration(config: { unit: string; value: number }): number {
  const { unit, value } = config
  const ms: Record<string, number> = {
    minutes: value * 60 * 1000,
    hours: value * 60 * 60 * 1000,
    days: value * 24 * 60 * 60 * 1000,
  }
  return ms[unit] ?? 60 * 60 * 1000
}

export async function enrollContact(automationId: string, contactId: string): Promise<void> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('automation_enrollments')
    .select('id, status')
    .eq('automation_id', automationId)
    .eq('contact_id', contactId)
    .single()

  if (existing?.status === 'active') return

  const { data: enrollment, error } = await supabase
    .from('automation_enrollments')
    .upsert({ automation_id: automationId, contact_id: contactId, status: 'active' },
             { onConflict: 'automation_id,contact_id' })
    .select('id').single()

  if (error || !enrollment) return

  const { data: steps } = await supabase
    .from('automation_steps').select('id').eq('automation_id', automationId)

  const { data: edges } = await supabase
    .from('automation_edges').select('target_step_id').eq('automation_id', automationId)

  const targetIds = new Set((edges ?? []).map((e: any) => e.target_step_id))
  const firstStep = (steps ?? []).find((s: any) => !targetIds.has(s.id))

  if (!firstStep) return

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

    if (!enrollment || !step || enrollment.status !== 'active') continue

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

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company, status, custom_fields, organization_id')
    .eq('id', enrollment.contact_id)
    .single()

  if (!contact) throw new Error('Contact not found')

  switch (step.type) {
    case 'send_email': {
      const { campaign_id } = step.config as { campaign_id: string }
      const { data: campaign } = await supabase
        .from('campaigns').select('*').eq('id', campaign_id).single()
      if (!campaign?.content_html) throw new Error('Campaign not found or has no content')

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
          .from('tags').select('id').eq('name', value).eq('organization_id', contact.organization_id).single()
        if (tag) {
          const { data: ct } = await supabase
            .from('contact_tags').select('contact_id').eq('contact_id', contact.id).eq('tag_id', tag.id).single()
          result = !!ct
        }
      } else if (condition_type === 'field_equals') {
        const { field, val } = step.config as any
        result = String(contact.custom_fields?.[field] ?? '') === String(val)
      }

      const { data: edges } = await supabase
        .from('automation_edges').select('id, target_step_id, label').eq('source_step_id', step.id)

      const branch = result ? 'yes' : 'no'
      const nextEdge = (edges ?? []).find((e: any) => e.label === branch)

      if (nextEdge) {
        await supabase.from('automation_step_states').update({
          status: 'completed', executed_at: new Date().toISOString(),
        }).eq('id', stateId)
        await supabase.from('automation_step_states').insert({
          enrollment_id: enrollment.id, step_id: nextEdge.target_step_id,
          status: 'pending', execute_at: new Date().toISOString(),
        })
      } else {
        await completeEnrollment(supabase, stateId, enrollment.id)
      }
      return
    }

    case 'add_tag': {
      const { tag_name } = step.config as { tag_name: string }
      const { data: tag } = await supabase
        .from('tags').select('id').eq('name', tag_name).eq('organization_id', contact.organization_id).single()
      if (tag) await supabase.from('contact_tags')
        .upsert({ contact_id: contact.id, tag_id: tag.id }, { onConflict: 'contact_id,tag_id' })
      break
    }

    case 'remove_tag': {
      const { tag_name } = step.config as { tag_name: string }
      const { data: tag } = await supabase
        .from('tags').select('id').eq('name', tag_name).eq('organization_id', contact.organization_id).single()
      if (tag) await supabase.from('contact_tags')
        .delete().eq('contact_id', contact.id).eq('tag_id', tag.id)
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
      await supabase.from('contact_lists').delete().eq('contact_id', contact.id).eq('list_id', list_id)
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
      enrollment_id: enrollment.id, step_id: nextEdge.target_step_id,
      status: 'pending', execute_at: executeAt,
    })
  } else {
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
