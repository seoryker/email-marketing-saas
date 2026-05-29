import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContactsTable from '../ContactsTable'
import type { ContactWithRelations } from '@/lib/contacts/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/contacts',
}))

const contacts: ContactWithRelations[] = [
  {
    id: '1', organization_id: 'org', email: 'alice@test.com',
    first_name: 'Alice', last_name: 'Smith', phone: null, company: null,
    status: 'active', custom_fields: {}, created_at: '2026-05-01', updated_at: '2026-05-01',
    tags: [], lists: [],
  },
]

describe('ContactsTable', () => {
  it('renders contact email', () => {
    render(
      <ContactsTable
        contacts={contacts}
        total={1}
        page={1}
        onSelect={vi.fn()}
        selected={[]}
        onOpenDrawer={vi.fn()}
      />
    )
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
  })

  it('renders contact name', () => {
    render(
      <ContactsTable
        contacts={contacts}
        total={1}
        page={1}
        onSelect={vi.fn()}
        selected={[]}
        onOpenDrawer={vi.fn()}
      />
    )
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })
})
