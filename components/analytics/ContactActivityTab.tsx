import type { ContactActivity } from '@/lib/analytics/queries'

type Props = {
  rows: ContactActivity[]
  total: number
  page: number
  onPageChange: (p: number) => void
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const STATUS_DOT: Record<string, string> = {
  clicked: '#10b981',
  opened: '#3b82f6',
  delivered: '#94a3b8',
  bounced: '#ef4444',
  unsubscribed: '#f59e0b',
  queued: '#e2e8f0',
  sent: '#94a3b8',
}

export default function ContactActivityTab({ rows, total, page, onPageChange }: Props) {
  const PER_PAGE = 50
  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Contact</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Opened</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Clicked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.contact_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-900">
                    {`${row.first_name} ${row.last_name}`.trim() || '—'}
                  </div>
                  <div className="text-slate-400">{row.email}</div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_DOT[row.status] ?? '#94a3b8' }}
                    />
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{fmt(row.opened_at)}</td>
                <td className="px-4 py-2.5 text-slate-500">{fmt(row.clicked_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No send data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}</span>
          <div className="flex gap-1">
            <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50">← Prev</button>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
