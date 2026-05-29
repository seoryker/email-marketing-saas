export default function AnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
      <p className="mt-1.5 text-sm text-slate-500">Coming in the next sub-project</p>
    </div>
  )
}
