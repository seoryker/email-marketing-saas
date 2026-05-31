'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteLandingPage } from '@/lib/landing-pages/actions'
import EmbedModal from './EmbedModal'
import type { LandingPage } from '@/lib/landing-pages/types'

export default function LandingPagesList({ pages }: { pages: LandingPage[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [embedPage, setEmbedPage] = useState<LandingPage | null>(null)

  if (pages.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-slate-200 bg-white p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">📄</div>
          <h3 className="text-sm font-semibold text-slate-900">No landing pages yet</h3>
          <p className="mt-1.5 text-xs text-slate-500">Build embeddable lead capture pages</p>
          <Link href="/landing-pages/new" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
            + Create your first page
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Page</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Submissions</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pages.map(page => (
              <tr key={page.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/landing-pages/${page.id}/edit`} className="font-medium text-slate-900 hover:text-blue-600">{page.name}</Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${page.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{page.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{page.submission_count}</td>
                <td className="px-4 py-3 text-slate-400">{new Date(page.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/landing-pages/${page.id}/edit`} className="text-blue-500 hover:underline">Edit</Link>
                    <button onClick={() => setEmbedPage(page)} className="text-slate-500 hover:text-slate-700">Embed</button>
                    <button onClick={() => { if (!confirm(`Delete "${page.name}"?`)) return; startTransition(async () => { await deleteLandingPage(page.id); router.refresh() }) }} disabled={isPending} className="text-red-400 hover:text-red-600 disabled:opacity-40">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {embedPage && <EmbedModal page={embedPage} onClose={() => setEmbedPage(null)} />}
    </>
  )
}
