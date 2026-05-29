'use client'

import type { ColumnMapping } from '@/lib/contacts/csv'

const CONTACT_FIELDS = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
]

type Props = {
  mapping: ColumnMapping[]
  onChange: (mapping: ColumnMapping[]) => void
}

export default function ImportColumnMapper({ mapping, onChange }: Props) {
  function setField(csvColumn: string, contactField: string | null) {
    onChange(mapping.map(m =>
      m.csv_column === csvColumn ? { ...m, contact_field: contactField } : m
    ))
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
      <div className="grid grid-cols-3 gap-0 bg-slate-50 px-3 py-2 font-medium text-slate-500 border-b border-slate-200">
        <span>CSV Column</span>
        <span className="text-center">→</span>
        <span>Contact Field</span>
      </div>
      {mapping.map(({ csv_column, contact_field }) => (
        <div key={csv_column} className="grid grid-cols-3 items-center gap-0 px-3 py-2 border-b border-slate-100 last:border-0">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 inline-block">{csv_column}</span>
          <span className="text-center text-slate-400">→</span>
          <select
            value={contact_field ?? ''}
            onChange={e => setField(csv_column, e.target.value || null)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
          >
            <option value="">Skip</option>
            {CONTACT_FIELDS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
