import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagPicker from '../TagPicker'
import type { Tag } from '@/lib/contacts/types'

const tags: Tag[] = [
  { id: '1', organization_id: 'org', name: 'vip', color: '#f59e0b', created_at: '' },
  { id: '2', organization_id: 'org', name: 'india', color: '#10b981', created_at: '' },
]

describe('TagPicker', () => {
  it('shows placeholder when nothing selected', () => {
    render(<TagPicker tags={tags} selected={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/select tags/i)).toBeInTheDocument()
  })

  it('shows selected tag chips', () => {
    render(<TagPicker tags={tags} selected={['1']} onChange={vi.fn()} />)
    expect(screen.getByText('vip')).toBeInTheDocument()
  })

  it('opens dropdown on click', async () => {
    const user = userEvent.setup()
    render(<TagPicker tags={tags} selected={[]} onChange={vi.fn()} />)
    await user.click(screen.getByText(/select tags/i))
    expect(screen.getByPlaceholderText(/search tags/i)).toBeInTheDocument()
  })
})
