/**
 * Loading state for the dev workspace layout.
 * Shown while any page within /dev is loading (Next.js Suspense boundary).
 */
export default function DevLoading() {
  return (
    <div className="flex items-center justify-center w-full h-full" style={{ background: "#E8E8E8" }}>
      <div className="flex flex-col items-center gap-3">
        {/* Spinner */}
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{
            borderColor: "rgba(99,102,241,0.2)",
            borderTopColor: "#6366F1",
          }}
        />
        <span className="text-[11px] font-medium" style={{ color: "#888" }}>Loading...</span>
      </div>
    </div>
  )
}
