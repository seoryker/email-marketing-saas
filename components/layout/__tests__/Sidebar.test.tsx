import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sidebar from '../Sidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

const mockProfile = { full_name: 'Dilip', organizations: { name: 'HiringHood' } }

describe('Sidebar', () => {
  it('renders all 7 nav items', () => {
    render(<Sidebar profile={mockProfile} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Campaigns')).toBeInTheDocument()
    expect(screen.getByText('Automations')).toBeInTheDocument()
    expect(screen.getByText('Contacts')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Integrations')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows user name and org name', () => {
    render(<Sidebar profile={mockProfile} />)
    expect(screen.getByText('Dilip')).toBeInTheDocument()
    expect(screen.getByText('HiringHood')).toBeInTheDocument()
  })
})
