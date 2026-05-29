export default function ContactsLoading() {
  return (
    <div className="flex h-full animate-pulse -m-6">
      <div className="w-44 flex-shrink-0 border-r border-slate-200 bg-slate-100" />
      <div className="flex flex-1 flex-col">
        <div className="h-12 border-b border-slate-200 bg-slate-100" />
        <div className="h-10 border-b border-slate-200 bg-white" />
        <div className="flex-1 bg-white p-4 space-y-2">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="h-10 rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
