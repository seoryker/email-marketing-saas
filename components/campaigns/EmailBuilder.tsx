'use client'

import { useRef, forwardRef, useImperativeHandle } from 'react'
import dynamic from 'next/dynamic'

const EmailEditor = dynamic(
  () => import('react-email-editor').then(m => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-slate-700">
        <div className="text-sm text-slate-400">Loading editor...</div>
      </div>
    )
  }
)

export type EmailBuilderRef = {
  exportHtml: () => Promise<{ design: Record<string, unknown>; html: string }>
  loadDesign: (design: Record<string, unknown>) => void
}

type Props = {
  initialDesign?: Record<string, unknown> | null
  onDesignChange?: () => void
}

const EmailBuilder = forwardRef<EmailBuilderRef, Props>(
  ({ initialDesign, onDesignChange }, ref) => {
    const editorRef = useRef<any>(null)

    useImperativeHandle(ref, () => ({
      exportHtml: () =>
        new Promise((resolve) => {
          editorRef.current?.exportHtml((data: any) => {
            resolve({ design: data.design, html: data.html })
          })
        }),
      loadDesign: (design: Record<string, unknown>) => {
        editorRef.current?.loadDesign(design)
      },
    }))

    function handleLoad() {
      if (initialDesign) {
        editorRef.current?.loadDesign(initialDesign)
      }
      editorRef.current?.addEventListener('design:updated', () => {
        onDesignChange?.()
      })
    }

    return (
      <EmailEditor
        ref={editorRef}
        onLoad={handleLoad}
        options={{
          locale: 'en-US',
          mergeTags: {
            first_name: { name: 'First Name', value: '{{first_name}}' },
            last_name: { name: 'Last Name', value: '{{last_name}}' },
            email: { name: 'Email', value: '{{email}}' },
            company: { name: 'Company', value: '{{company}}' },
          },
        }}
        style={{ flex: 1, minHeight: 0 }}
      />
    )
  }
)

EmailBuilder.displayName = 'EmailBuilder'
export default EmailBuilder
