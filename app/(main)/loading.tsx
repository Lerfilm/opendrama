export default function MainLoading() {
  return (
    <div className="space-y-6 p-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted rounded mt-2" />
        </div>
        <div className="h-10 w-24 bg-muted rounded-full" />
      </div>

      {/* Banner skeleton */}
      <div className="aspect-[16/9] bg-muted rounded-lg" />

      {/* Grid skeleton */}
      <div>
        <div className="h-6 w-24 bg-muted rounded mb-3" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[2/3] bg-muted rounded-lg" />
              <div className="h-4 w-full bg-muted rounded" />
              <div className="h-3 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
