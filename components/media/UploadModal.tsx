'use client'
import { useState, useRef, useCallback } from 'react'

type Props = {
  onSelect: (url: string) => void
  onClose: () => void
  recentUploads?: Array<{ public_url: string; filename: string }>
}

export default function UploadModal({ onSelect, onClose, recentUploads = [] }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setError(null)
    setUploading(true)
    setProgress(10)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Upload failed') }
      const { uploadUrl, publicUrl } = await res.json()
      setProgress(40)
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
      if (!uploadRes.ok) throw new Error('Failed to upload to storage')
      setProgress(100)
      setTimeout(() => { setUploading(false); onSelect(publicUrl) }, 300)
    } catch (err: any) {
      setError(err.message)
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Upload Image</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300'}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
          >
            {uploading ? (
              <div className="space-y-2">
                <div className="text-2xl">⏫</div>
                <p className="text-xs font-medium text-slate-700">Uploading...</p>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-3xl">🖼️</div>
                <p className="text-sm font-medium text-slate-700">Drop image here</p>
                <p className="text-xs text-slate-400">PNG, JPG, GIF, WebP · Max 5MB</p>
                <button className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Browse files</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">Or paste image URL</p>
            <div className="flex gap-2">
              <input type="url" value={pasteUrl} onChange={e => setPasteUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
              <button onClick={() => pasteUrl && onSelect(pasteUrl)} disabled={!pasteUrl}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-40 hover:bg-slate-700">Use</button>
            </div>
          </div>
          {recentUploads.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-700">Recent uploads</p>
              <div className="grid grid-cols-4 gap-2">
                {recentUploads.slice(0, 12).map(f => (
                  <button key={f.public_url} onClick={() => onSelect(f.public_url)}
                    className="aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-blue-400 hover:ring-2 hover:ring-blue-200 transition-all">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.public_url} alt={f.filename} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
