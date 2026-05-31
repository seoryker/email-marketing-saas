'use client'

import { useRef, useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import BuilderToolbar from '@/components/campaigns/BuilderToolbar'
import SendModal from '@/components/campaigns/SendModal'
import { updateCampaign } from '@/lib/campaigns/actions'
import type { Campaign } from '@/lib/campaigns/types'
import type { List } from '@/lib/contacts/types'
import type { EmailBuilderRef } from '@/components/campaigns/EmailBuilder'
import type { MediaFile } from '@/lib/media/queries'

const EmailBuilder = dynamic(
  () => import('@/components/campaigns/EmailBuilder'),
  { ssr: false }
)

type Props = {
  campaign: Campaign
  lists: List[]
  recentUploads: MediaFile[]
}

export default function BuilderClient({ campaign, lists, recentUploads }: Props) {
  const router = useRouter()
  const builderRef = useRef<EmailBuilderRef>(null)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  const handleDesignChange = useCallback(() => {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(handleSave, 30_000)
  }, [])

  async function handleSave() {
    if (!builderRef.current) return
    const { design, html } = await builderRef.current.exportHtml()
    startTransition(async () => {
      await updateCampaign(campaign.id, {
        content_json: design,
        content_html: html,
      })
      setLastSaved(new Date())
    })
  }

  function handleSent(result: { sent: number; queued: number }) {
    setSendModalOpen(false)
    const msg = result.queued > 0
      ? `Sent to ${result.sent} contacts. ${result.queued} queued (daily limit).`
      : `Successfully sent to ${result.sent} contacts!`
    alert(msg)
    router.push('/campaigns')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden -m-6">
      <BuilderToolbar
        campaign={campaign}
        lastSaved={lastSaved}
        isSaving={isPending}
        onSave={handleSave}
        onNext={() => setSendModalOpen(true)}
      />

      <div className="flex flex-1 min-h-0">
        <EmailBuilder
          ref={builderRef}
          initialDesign={campaign.content_json ?? null}
          onDesignChange={handleDesignChange}
          recentUploads={recentUploads}
        />
      </div>

      <div className="flex h-7 flex-shrink-0 items-center gap-6 border-t border-slate-800 bg-slate-900 px-4">
        <span className="text-[10px] text-slate-500">
          Subject: <span className="text-slate-400">{campaign.subject}</span>
        </span>
        <span className="text-[10px] text-slate-500">
          From: <span className="text-slate-400">{campaign.from_name} &lt;{campaign.from_email}&gt;</span>
        </span>
      </div>

      <SendModal
        open={sendModalOpen}
        campaign={campaign}
        lists={lists}
        onClose={() => setSendModalOpen(false)}
        onSent={handleSent}
      />
    </div>
  )
}
