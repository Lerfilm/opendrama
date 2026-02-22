"use client"

interface VideoSegment {
  id: string
  segmentIndex: number
  sceneNum: number
  durationSec: number
  prompt: string
  shotType?: string | null
  cameraMove?: string | null
  model?: string | null
  resolution?: string | null
  status: string
}

interface SegmentCardProps {
  segment: VideoSegment
  isSelected: boolean
  onSelect: () => void
}

const statusStyleMap: Record<string, { background: string; color: string }> = {
  pending: { background: "#F3F4F6", color: "#6B7280" },
  reserved: { background: "#FEF3C7", color: "#92400E" },
  submitted: { background: "#DBEAFE", color: "#1D4ED8" },
  generating: { background: "#DBEAFE", color: "#1D4ED8" },
  done: { background: "#D1FAE5", color: "#065F46" },
  failed: { background: "#FEE2E2", color: "#991B1B" },
}

export function SegmentCard({ segment, isSelected, onSelect }: SegmentCardProps) {
  const statusStyle = statusStyleMap[segment.status] || statusStyleMap.pending
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-3 py-2 rounded-md transition-all"
      style={{
        background: isSelected ? "#DCE0F5" : "#EDEDEE",
        outline: isSelected ? "1px solid #A5B4FC" : "1px solid #D8D8D8",
      }}
    >
      <div className="flex items-center gap-2">
        {/* Index */}
        <span className="text-[10px] font-mono w-6 flex-shrink-0" style={{ color: "#AAA" }}>
          #{segment.segmentIndex + 1}
        </span>

        {/* Prompt preview */}
        <p className="text-[11px] truncate flex-1 min-w-0" style={{ color: "#555" }}>
          {segment.prompt.slice(0, 80)}
        </p>

        {/* Duration */}
        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "#AAA" }}>
          {segment.durationSec}s
        </span>

        {/* Shot type */}
        {segment.shotType && (
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ background: "#E0E0E0", color: "#777" }}>
            {segment.shotType}
          </span>
        )}

        {/* Camera */}
        {segment.cameraMove && segment.cameraMove !== "static" && (
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ background: "#E0E0E0", color: "#777" }}>
            {segment.cameraMove}
          </span>
        )}

        {/* Status */}
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={statusStyle}>
          {segment.status}
        </span>
      </div>

      {/* Scene link */}
      <div className="flex items-center gap-2 mt-1 ml-8">
        <span className="text-[9px]" style={{ color: "#CCC" }}>Scene {segment.sceneNum}</span>
        {segment.model && (
          <span className="text-[9px]" style={{ color: "#CCC" }}>{segment.model.replace(/_/g, " ")}</span>
        )}
      </div>
    </button>
  )
}
