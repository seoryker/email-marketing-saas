'use client'
import { useState, useTransition } from 'react'
import { saveWebhookSettings, saveGASettings, sendTestWebhook } from '@/lib/integrations/actions'

const WEBHOOK_EVENTS = [
  { value: 'contact.created', label: 'Contact created' },
  { value: 'contact.unsubscribed', label: 'Contact unsubscribed' },
  { value: 'campaign.sent', label: 'Campaign sent' },
  { value: 'form.submitted', label: 'Form submitted' },
  { value: 'automation.completed', label: 'Automation completed' },
]

type Props = {
  settings: {
    webhook_url: string | null; webhook_events: string[]
    webhook_secret: string; ga_measurement_id: string | null
  } | null
}

export default function IntegrationsClient({ settings }: Props) {
  const [isPending, startTransition] = useTransition()
  const [webhookUrl, setWebhookUrl] = useState(settings?.webhook_url ?? '')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(settings?.webhook_events ?? [])
  const [gaId, setGaId] = useState(settings?.ga_measurement_id ?? '')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function toggleEvent(event: string) {
    setSelectedEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event])
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Integrations</h1>
        <p className="text-sm text-slate-500 mt-0.5">Connect MailFlow to external tools</p>
      </div>

      {/* Webhooks */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Webhooks</h2>
          <p className="text-xs text-slate-500 mt-0.5">Send events to Zapier, Make, n8n, or any webhook-compatible tool</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Outbound webhook URL</label>
          <input type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700">Send events for</label>
          {WEBHOOK_EVENTS.map(e => (
            <label key={e.value} className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={selectedEvents.includes(e.value)} onChange={() => toggleEvent(e.value)} className="h-3.5 w-3.5 rounded" />
              <span className="text-xs text-slate-700">{e.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => startTransition(async () => { await saveWebhookSettings({ webhook_url: webhookUrl, webhook_events: selectedEvents }) })}
            disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Save webhook settings
          </button>
          <button onClick={() => startTransition(async () => {
            try { await sendTestWebhook(); setTestResult('✓ Test sent successfully') }
            catch (err: any) { setTestResult(`✗ ${err.message}`) }
            setTimeout(() => setTestResult(null), 5000)
          })} disabled={isPending || !webhookUrl} className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            Send test event
          </button>
        </div>
        {testResult && <p className={`text-xs ${testResult.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{testResult}</p>}
        {settings?.webhook_secret && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
            <p className="text-xs font-medium text-slate-700">Inbound webhook token</p>
            <p className="text-[11px] text-slate-500">Use this token to send data INTO MailFlow:</p>
            <p className="text-[10px] text-slate-400 font-mono">POST /api/webhooks/inbound</p>
            <div className="flex gap-2">
              <code className="flex-1 rounded bg-slate-900 px-2 py-1.5 text-[11px] text-green-400 font-mono truncate">{settings.webhook_secret}</code>
              <button onClick={() => { navigator.clipboard.writeText(settings.webhook_secret); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-white">{copied ? '✓' : 'Copy'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Google Analytics */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Google Analytics 4</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track activity across your dashboard and landing pages</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Measurement ID</label>
          <input type="text" value={gaId} onChange={e => setGaId(e.target.value)} placeholder="G-XXXXXXXXXX"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500" />
          <p className="text-xs text-slate-400">Find this in GA4 → Admin → Data Streams → your stream</p>
        </div>
        <button onClick={() => startTransition(async () => { await saveGASettings(gaId) })}
          disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Save GA settings
        </button>
        {gaId && <p className="text-xs text-green-600">✓ Tracking active on dashboard and landing pages</p>}
      </div>
    </div>
  )
}
