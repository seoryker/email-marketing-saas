'use client'
import { useRef, forwardRef, useImperativeHandle, useState } from 'react'
import dynamic from 'next/dynamic'
import UploadModal from '@/components/media/UploadModal'
import type { MediaFile } from '@/lib/media/queries'

const EmailEditor = dynamic(
  () => import('react-email-editor').then(m => m.default),
  { ssr: false, loading: () => (
    <div className="flex flex-1 items-center justify-center bg-slate-700">
      <div className="text-sm text-slate-400">Loading editor...</div>
    </div>
  )}
)

export type EmailBuilderRef = {
  exportHtml: () => Promise<{ design: Record<string, unknown>; html: string }>
  loadDesign: (design: Record<string, unknown>) => void
}

type Props = {
  initialDesign?: Record<string, unknown> | null
  onDesignChange?: () => void
  recentUploads?: MediaFile[]
}

const EmailBuilder = forwardRef<EmailBuilderRef, Props>(
  ({ initialDesign, onDesignChange, recentUploads = [] }, ref) => {
    const editorRef = useRef<any>(null)
    const [showUploadModal, setShowUploadModal] = useState(false)
    const selectImageDoneRef = useRef<((url: string) => void) | null>(null)

    useImperativeHandle(ref, () => ({
      exportHtml: () => new Promise((resolve) => {
        editorRef.current?.exportHtml((data: any) => {
          resolve({ design: data.design, html: data.html })
        })
      }),
      loadDesign: (design: Record<string, unknown>) => {
        editorRef.current?.loadDesign(design)
      },
    }))

    function handleLoad() {
      if (initialDesign) editorRef.current?.loadDesign(initialDesign)
      editorRef.current?.addEventListener('design:updated', () => { onDesignChange?.() })
      editorRef.current?.registerCallback('selectImage', (_data: any, done: (url: string) => void) => {
        selectImageDoneRef.current = done
        setShowUploadModal(true)
      })
    }

    function handleImageSelected(url: string) {
      setShowUploadModal(false)
      selectImageDoneRef.current?.(url)
      selectImageDoneRef.current = null
    }

    return (
      <>
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
        {showUploadModal && (
          <UploadModal
            onSelect={handleImageSelected}
            onClose={() => { setShowUploadModal(false); selectImageDoneRef.current = null }}
            recentUploads={recentUploads}
          />
        )}
      </>
    )
  }
)

EmailBuilder.displayName = 'EmailBuilder'
export default EmailBuilder
