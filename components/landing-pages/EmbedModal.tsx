'use client'
import { useState } from 'react'
import type { LandingPage } from '@/lib/landing-pages/types'

export default function EmbedModal({ page, onClose }: { page: LandingPage; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const host = typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'
  const embedCode = `<iframe\n  src="${host}/p/${page.slug}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border:none;max-width:640px"\n></iframe>`

  function copy() {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Embed: {page.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs font-medium text-slate-700">iframe embed code</p>
          <pre className="rounded-lg bg-slate-900 p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap font-mono">{embedCode}</pre>
          <button onClick={copy}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
            {copied ? '✓ Copied!' : 'Copy embed code'}
          </button>
          {page.status !== 'published' && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              ⚠️ Publish this page first for the embed to work.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
