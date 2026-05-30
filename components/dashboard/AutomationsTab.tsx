import type { AutomationFunnel } from '@/lib/dashboard/queries'

export default function AutomationsTab({ funnels }: { funnels: AutomationFunnel[] }) {
  if (funnels.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
        <p className="text-sm text-slate-400">No active automations yet.</p>
        <a href="/automations/new" className="mt-3 inline-block text-xs text-blue-600 hover:underline">+ Create your first automation</a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {funnels.map(auto => {
        const maxVal = Math.max(...auto.steps.map(s => s.completed), auto.enrolled, 1)
        return (
          <div key={auto.automation_id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">⚡ {auto.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{auto.enrolled.toLocaleString()} enrolled · {auto.completion_rate}% completion</p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col items-center gap-1.5">
                <div className="w-full rounded-t bg-blue-500" style={{ height: `${Math.round((auto.enrolled / maxVal) * 80)}px` }} />
                <p className="text-[9px] text-slate-400 text-center">Enrolled</p>
                <p className="text-[10px] font-semibold text-slate-700">{auto.enrolled}</p>
              </div>
              {auto.steps.map((step, i) => (
                <div key={step.step_id} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`w-full rounded-t ${i === auto.steps.length - 1 ? 'bg-green-500' : 'bg-blue-200'}`}
                    style={{ height: `${Math.round((step.completed / maxVal) * 80)}px` }}
                  />
                  <p className="text-[9px] text-slate-400 text-center truncate w-full">{step.label}</p>
                  <p className="text-[10px] font-semibold text-slate-700">{step.completed}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
