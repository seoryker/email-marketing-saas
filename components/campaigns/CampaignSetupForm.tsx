'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCampaign } from '@/lib/campaigns/actions'

export default function CampaignSetupForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const id = await createCampaign({
          name,
          subject,
          preview_text: previewText || undefined,
          from_name: fromName,
          from_email: fromEmail,
        })
        router.push(`/campaigns/${id}/edit`)
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Create Campaign</h1>
        <p className="mt-1 text-sm text-slate-500">Fill in the basics before designing your email</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-1.5">
          <Label htmlFor="name">Campaign name (internal) *</Label>
          <Input
            id="name"
            placeholder="e.g. Summer Sale 2026"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <p className="text-xs text-slate-400">Only visible to you — not shown to recipients</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject line *</Label>
          <Input
            id="subject"
            placeholder="e.g. Summer Sale is HERE 🔥"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="previewText">Preview text</Label>
          <Input
            id="previewText"
            placeholder="Short summary shown in inbox preview..."
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fromName">From name *</Label>
            <Input
              id="fromName"
              placeholder="Your name or brand"
              value={fromName}
              onChange={e => setFromName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fromEmail">From email *</Label>
            <Input
              id="fromEmail"
              type="email"
              placeholder="hello@yourdomain.com"
              value={fromEmail}
              onChange={e => setFromEmail(e.target.value)}
              required
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Creating...' : 'Continue to Builder →'}
        </Button>
      </form>
    </div>
  )
}
