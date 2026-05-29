import type { LinkBreakdown } from '@/lib/analytics/queries'

export default function LinkBreakdownTab({ links }: { links: LinkBreakdown[] }) {
  if (links.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        No link clicks recorded yet
      </div>
    )
  }

  const maxClicks = links[0].click_count

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-slate-500">Link</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-500">Clicks</th>
            <th className="px-4 py-2.5 w-32"></th>
          </tr>
        </thead>
        <tbody>
          {links.map(link => (
            <tr key={link.link_url} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <a href={link.link_url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline max-w-xs block truncate">
                  {link.link_url}
                </a>
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-slate-900">{link.click_count}</td>
              <td className="px-4 py-2.5">
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500"
                    style={{ width: `${(link.click_count / maxClicks) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
