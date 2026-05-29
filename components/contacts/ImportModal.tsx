'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import ImportColumnMapper from './ImportColumnMapper'
import { parseCSV, autoDetectColumns, applyMapping, generateSampleCSV } from '@/lib/contacts/csv'
import { importContacts } from '@/lib/contacts/actions'
import type { ColumnMapping, ParsedRow } from '@/lib/contacts/csv'
import type { List, ImportResult } from '@/lib/contacts/types'

type Step = 1 | 2 | 3

type Props = {
  open: boolean
  lists: List[]
  onClose: () => void
}

export default function ImportModal({ open, lists, onClose }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [dragging, setDragging] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping[]>([])
  const [selectedListId, setSelectedListId] = useState('')
  const [updateDups, setUpdateDups] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) return
    const { headers: h, rows: r } = await parseCSV(file)
    setHeaders(h)
    setRows(r)
    setMapping(autoDetectColumns(h))
    setStep(2)
  }

  function downloadSample() {
    const csv = generateSampleCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample-contacts.csv'
    a.click()
  }

  async function handleImport() {
    const { valid, invalidEmails } = applyMapping(rows, mapping)
    setLoading(true)
    try {
      const res = await importContacts(valid, {
        list_id: selectedListId || undefined,
        update_duplicates: updateDups,
      })
      setResult({ ...res, errors: [...res.errors, ...Array(invalidEmails).fill('Invalid email')] })
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setStep(1); setHeaders([]); setRows([]); setMapping([])
    setResult(null); setSelectedListId(''); setUpdateDups(true)
    onClose()
  }

  const { valid, invalidEmails } = step >= 2 ? applyMapping(rows, mapping) : { valid: [], invalidEmails: 0 }
  const dupCount = rows.length - valid.length - invalidEmails

  const StepIndicator = ({ n, label }: { n: number; label: string }) => (
    <div className="flex items-center gap-1.5">
      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
        step === n ? 'bg-blue-600 text-white' : step > n ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'
      }`}>{step > n ? '✓' : n}</div>
      <span className={`text-xs ${step === n ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>{label}</span>
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={handleClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Import Contacts</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
          <StepIndicator n={1} label="Upload" />
          <div className="flex-1 h-px bg-slate-200" />
          <StepIndicator n={2} label="Map" />
          <div className="flex-1 h-px bg-slate-200" />
          <StepIndicator n={3} label="Import" />
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div
                className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
                  dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onClick={() => fileRef.current?.click()}
              >
                <div className="mb-3 text-3xl">📄</div>
                <p className="text-sm font-medium text-slate-700">Drop CSV file here</p>
                <p className="mt-1 text-xs text-slate-400">or click to browse</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>
              <p className="text-center text-xs text-slate-400">Max 10MB · CSV format only</p>
              <button onClick={downloadSample} className="w-full text-center text-xs text-blue-600 hover:underline">
                Download sample CSV template
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Match your CSV columns to contact fields. Unmatched columns are skipped.</p>
              <ImportColumnMapper mapping={mapping} onChange={setMapping} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
                <Button size="sm" className="flex-1" onClick={() => setStep(3)}>
                  Review import →
                </Button>
              </div>
            </div>
          )}

          {step === 3 && !result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total rows', value: rows.length, color: 'text-slate-900' },
                  { label: 'Valid', value: valid.length, color: 'text-green-600' },
                  { label: 'Duplicates', value: dupCount, color: 'text-amber-600' },
                  { label: 'Invalid email', value: invalidEmails, color: 'text-red-600' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-slate-200 p-3 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Add to list (optional)</label>
                  <select
                    value={selectedListId}
                    onChange={e => setSelectedListId(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  >
                    <option value="">No list</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={updateDups} onChange={e => setUpdateDups(e.target.checked)} />
                  Update existing contacts (duplicates)
                </label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(2)}>← Back</Button>
                <Button size="sm" className="flex-1" disabled={loading || valid.length === 0} onClick={handleImport}>
                  {loading ? 'Importing...' : `Import ${valid.length} contacts →`}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-4 text-center">
              <div className="text-4xl">🎉</div>
              <p className="text-sm font-semibold text-slate-900">Import complete</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border p-3"><p className="font-bold text-green-600">{result.inserted}</p><p className="text-slate-400">Inserted</p></div>
                <div className="rounded-lg border p-3"><p className="font-bold text-blue-600">{result.updated}</p><p className="text-slate-400">Updated</p></div>
                <div className="rounded-lg border p-3"><p className="font-bold text-slate-400">{result.skipped}</p><p className="text-slate-400">Skipped</p></div>
              </div>
              {result.errors.length > 0 && (
                <p className="text-xs text-red-600">{result.errors.length} error(s) — some rows were not imported</p>
              )}
              <Button onClick={handleClose} className="w-full">Done</Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
