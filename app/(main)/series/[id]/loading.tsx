export default function SeriesLoading() {
  return (
    <div className="animate-pulse">
      {/* Cover skeleton */}
      <div className="h-64 bg-muted" />

      {/* Episode list skeleton */}
      <div className="p-4 space-y-3">
        <div className="h-6 w-24 bg-muted rounded" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
