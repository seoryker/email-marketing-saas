'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Mail, Zap, Users, BarChart2,
  Plug, Settings
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Campaigns', href: '/campaigns', icon: Mail },
  { label: 'Automations', href: '/automations', icon: Zap },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Analytics', href: '/analytics', icon: BarChart2 },
]

const BOTTOM_NAV_ITEMS = [
  { label: 'Integrations', href: '/integrations', icon: Plug },
  { label: 'Settings', href: '/settings', icon: Settings },
]

type Profile = {
  full_name: string
  organizations: { name: string }
}

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()

  const NavItem = ({ item }: { item: typeof NAV_ITEMS[number] }) => {
    const isActive = pathname === item.href
    return (
      <Link
        href={item.href}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 mx-1.5 transition-colors',
          isActive
            ? 'bg-blue-700 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        )}
        title={item.label}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" />
        <span className="whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity sidebar-label">
          {item.label}
        </span>
      </Link>
    )
  }

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside
      className="group/sidebar flex flex-col bg-slate-900 transition-all duration-200 ease-in-out w-14 hover:w-56 flex-shrink-0 h-screen sticky top-0"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-slate-800 px-3 overflow-hidden">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600">
          <Mail className="h-4 w-4 text-white" />
        </div>
        <span className="whitespace-nowrap text-sm font-bold text-slate-100 opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          MailFlow
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-2 space-y-0.5 overflow-hidden">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-slate-800 py-2 space-y-0.5 overflow-hidden">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
      </div>

      {/* User profile */}
      <div className="flex items-center gap-3 border-t border-slate-800 p-3 overflow-hidden">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 overflow-hidden opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          <p className="truncate text-xs font-medium text-slate-100">{profile.full_name}</p>
          <p className="truncate text-xs text-slate-500">{profile.organizations.name}</p>
        </div>
      </div>
    </aside>
  )
}
