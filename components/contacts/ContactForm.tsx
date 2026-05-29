'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import TagPicker from './TagPicker'
import { createContact, updateContact } from '@/lib/contacts/actions'
import type { ContactWithRelations, Tag, List, CustomFieldDefinition } from '@/lib/contacts/types'

type Props = {
  contact?: ContactWithRelations
  tags: Tag[]
  lists: List[]
  customFields: CustomFieldDefinition[]
  onSave: () => void
  onCancel: () => void
}

export default function ContactForm({ contact, tags, lists, customFields, onSave, onCancel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState(contact?.first_name ?? '')
  const [lastName, setLastName] = useState(contact?.last_name ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [company, setCompany] = useState(contact?.company ?? '')
  const [selectedTags, setSelectedTags] = useState<string[]>(contact?.tags.map(t => t.id) ?? [])
  const [selectedLists, setSelectedLists] = useState<string[]>(contact?.lists.map(l => l.id) ?? [])
  const [customValues, setCustomValues] = useState<Record<string, string>>(
    Object.fromEntries(
      customFields.map(f => [f.field_key, String(contact?.custom_fields[f.field_key] ?? '')])
    )
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const payload = {
          email,
          first_name: firstName,
          last_name: lastName,
          phone: phone || undefined,
          company: company || undefined,
          custom_fields: customValues,
          list_ids: selectedLists,
          tag_ids: selectedTags,
        }
        if (contact) {
          await updateContact(contact.id, payload)
        } else {
          await createContact(payload)
        }
        onSave()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4">
      <section>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Contact Info</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="firstName" className="text-xs">First name</Label>
            <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lastName" className="text-xs">Last name</Label>
            <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <Label htmlFor="email" className="text-xs">Email address *</Label>
          <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="phone" className="text-xs">Phone</Label>
            <Input id="phone" type="tel" value={phone ?? ''} onChange={e => setPhone(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="company" className="text-xs">Company</Label>
            <Input id="company" value={company ?? ''} onChange={e => setCompany(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
      </section>

      <section>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lists & Tags</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Lists</Label>
            <div className="flex flex-wrap gap-1 rounded-md border border-input bg-background p-2 min-h-9">
              {lists.map(list => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedLists(
                    selectedLists.includes(list.id)
                      ? selectedLists.filter(id => id !== list.id)
                      : [...selectedLists, list.id]
                  )}
                  className={`rounded-full px-2 py-0.5 text-xs border transition-colors ${
                    selectedLists.includes(list.id)
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {list.name}
                </button>
              ))}
              {lists.length === 0 && <span className="text-xs text-muted-foreground">No lists yet</span>}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tags</Label>
            <TagPicker tags={tags} selected={selectedTags} onChange={setSelectedTags} />
          </div>
        </div>
      </section>

      {customFields.length > 0 && (
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Custom Fields</p>
          <div className="space-y-3">
            {customFields.map(field => (
              <div key={field.field_key} className="space-y-1">
                <Label htmlFor={field.field_key} className="text-xs">{field.label}</Label>
                {field.field_type === 'dropdown' ? (
                  <select
                    id={field.field_key}
                    value={customValues[field.field_key] ?? ''}
                    onChange={e => setCustomValues(v => ({ ...v, [field.field_key]: e.target.value }))}
                    className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select...</option>
                    {(field.options ?? []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={field.field_key}
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                    value={customValues[field.field_key] ?? ''}
                    onChange={e => setCustomValues(v => ({ ...v, [field.field_key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending} className="flex-1 h-8 text-sm">
          {isPending ? 'Saving...' : contact ? 'Save changes' : 'Save contact'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="h-8 text-sm">
          Cancel
        </Button>
      </div>
    </form>
  )
}
