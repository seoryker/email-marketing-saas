import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContactForm from '../ContactForm'
import type { Tag, List, CustomFieldDefinition } from '@/lib/contacts/types'

const tags: Tag[] = []
const lists: List[] = []
const customFields: CustomFieldDefinition[] = []

describe('ContactForm', () => {
  it('renders email field as required', () => {
    render(
      <ContactForm
        tags={tags} lists={lists} customFields={customFields}
        onSave={vi.fn()} onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/email/i)).toBeRequired()
  })

  it('renders save button', () => {
    render(
      <ContactForm
        tags={tags} lists={lists} customFields={customFields}
        onSave={vi.fn()} onCancel={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('pre-fills fields when contact provided', () => {
    render(
      <ContactForm
        tags={tags} lists={lists} customFields={customFields}
        onSave={vi.fn()} onCancel={vi.fn()}
        contact={{
          id: '1', organization_id: 'org', email: 'test@example.com',
          first_name: 'Alice', last_name: 'Smith', phone: null, company: null,
          status: 'active', custom_fields: {}, created_at: '', updated_at: '',
          tags: [], lists: [],
        }}
      />
    )
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument()
  })
})
