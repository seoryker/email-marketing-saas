import Link from 'next/link'
import { getLandingPages } from '@/lib/landing-pages/queries'
import LandingPagesList from '@/components/landing-pages/LandingPagesList'

export default async function LandingPagesPage() {
  const pages = await getLandingPages()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold text-slate-900">Landing Pages</h1><p className="text-sm text-slate-500">{pages.length} pages</p></div>
        <Link href="/landing-pages/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ New Page</Link>
      </div>
      <LandingPagesList pages={pages} />
    </div>
  )
}
