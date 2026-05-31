'use client'
import { useRef, useState, useCallback, useTransition } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { updateLandingPage } from '@/lib/landing-pages/actions'
import EmbedModal from '@/components/landing-pages/EmbedModal'
import type { LandingPage } from '@/lib/landing-pages/types'
import type { EmailBuilderRef } from '@/components/campaigns/EmailBuilder'
import type { MediaFile } from '@/lib/media/queries'

const EmailBuilder = dynamic(() => import('@/components/campaigns/EmailBuilder'), { ssr: false })

type Props = { page: LandingPage; recentUploads?: MediaFile[] }
export default function PageBuilderClient({ page, recentUploads = [] }: Props) {
  const builderRef = useRef<EmailBuilderRef>(null)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(page.name)
  const [currentStatus, setCurrentStatus] = useState(page.status)
  const [showEmbed, setShowEmbed] = useState(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  const handleDesignChange = useCallback(() => {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(handleSave, 30_000)
  }, [])

  async function handleSave() {
    if (!builderRef.current) return
    const { design, html } = await builderRef.current.exportHtml()
    startTransition(async () => { await updateLandingPage(page.id, { content_json: design, content_html: html }) })
  }

  async function handleTogglePublish() {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published'
    startTransition(async () => { await updateLandingPage(page.id, { status: newStatus }); setCurrentStatus(newStatus) })
  }

  function handleNameBlur() {
    if (name !== page.name && name.trim()) {
      startTransition(async () => { await updateLandingPage(page.id, { name: name.trim() }) })
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden -m-6">
      <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4">
        <Link href="/landing-pages" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 pr-4 border-r border-slate-700">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Landing Pages
        </Link>
        <input className="flex-1 bg-transparent text-sm font-medium text-slate-100 outline-none max-w-xs" value={name} onChange={e => setName(e.target.value)} onBlur={handleNameBlur} />
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={handleSave} disabled={isPending} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50">Save</button>
          <button onClick={handleTogglePublish} disabled={isPending} className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${currentStatus === 'published' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-green-500 text-white hover:bg-green-600'}`}>
            {currentStatus === 'published' ? 'Unpublish' : 'Publish'}
          </button>
          <button onClick={() => setShowEmbed(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Get Embed →</button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <EmailBuilder ref={builderRef} initialDesign={page.content_json ?? null} onDesignChange={handleDesignChange} recentUploads={recentUploads} />
      </div>
      <div className="flex h-7 flex-shrink-0 items-center gap-6 border-t border-slate-800 bg-slate-900 px-4">
        <span className="text-[10px] text-slate-500">Submissions: <span className="text-slate-400">{page.submission_count}</span></span>
        <span className="text-[10px] text-slate-500">Status: <span className={currentStatus === 'published' ? 'text-green-400' : 'text-slate-400'}>{currentStatus}</span></span>
      </div>
      {showEmbed && <EmbedModal page={{ ...page, status: currentStatus }} onClose={() => setShowEmbed(false)} />}
    </div>
  )
}
