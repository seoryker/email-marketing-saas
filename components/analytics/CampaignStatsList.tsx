import type { CampaignWithStats } from '@/lib/analytics/queries'

type Props = {
  campaigns: CampaignWithStats[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function CampaignStatsList({ campaigns, selectedId, onSelect }: Props) {
  if (campaigns.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-400">No sent campaigns yet</div>
  }

  return (
    <div className="space-y-1 p-2">
      {campaigns.map(campaign => (
        <button
          key={campaign.id}
          onClick={() => onSelect(campaign.id)}
          className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
            selectedId === campaign.id
              ? 'bg-blue-50 border border-blue-200'
              : 'border border-transparent hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium truncate max-w-[140px] ${
              selectedId === campaign.id ? 'text-blue-700' : 'text-slate-800'
            }`}>{campaign.name}</span>
            <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1">
              {campaign.sent_at
                ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—'}
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-[11px] text-slate-500">
              📬 <span className="font-medium text-slate-700">{campaign.stats.open_rate}%</span> open
            </span>
            <span className="text-[11px] text-slate-500">
              🔗 <span className="font-medium text-slate-700">{campaign.stats.click_rate}%</span> click
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
