"use client"

interface BottomToolsBarProps {
  onAutoSegment: () => void
  isSplitting: boolean
  hasSegments: boolean
}

export function BottomToolsBar({ onAutoSegment, isSplitting, hasSegments }: BottomToolsBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2" style={{ borderTop: "1px solid #C8C8C8", background: "#E4E4E4" }}>
      <button
        onClick={onAutoSegment}
        disabled={isSplitting}
        className="text-[10px] px-2.5 py-1 rounded transition-colors disabled:opacity-50"
        style={{ background: "#E0E4F8", color: "#4F46E5" }}
      >
        {isSplitting ? "Splitting..." : hasSegments ? "Re-segment" : "Auto-segment"}
      </button>
      <button
        disabled
        className="text-[10px] px-2.5 py-1 rounded cursor-not-allowed"
        style={{ background: "#E8E8E8", color: "#CCC" }}
      >
        Manual Split
      </button>
      <button
        disabled
        className="text-[10px] px-2.5 py-1 rounded cursor-not-allowed"
        style={{ background: "#E8E8E8", color: "#CCC" }}
      >
        Continuity Check
      </button>
    </div>
  )
}
