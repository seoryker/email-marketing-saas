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
