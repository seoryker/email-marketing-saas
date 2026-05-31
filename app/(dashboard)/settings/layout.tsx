'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/integrations', label: 'Integrations' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
      <div className="flex border-b border-slate-200">
        {TABS.map(t => (
          <Link key={t.href} href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              pathname === t.href ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  )
}
