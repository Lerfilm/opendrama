"use client"

import { SegmentCard } from "./segment-card"
import Link from "next/link"

interface VideoSegment {
  id: string
  episodeNum: number
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

interface Role {
  id: string
  name: string
  role: string
  referenceImages?: string[]
}

interface SegmentTimelineProps {
  segments: VideoSegment[]
  selectedSegmentId: string | null
  onSelectSegment: (id: string | null) => void
  scriptId: string
  selectedEpisode: number
  roles: Role[]
  onRefreshScript: () => void
}

export function SegmentTimeline({
  segments, selectedSegmentId, onSelectSegment,
  scriptId, selectedEpisode, roles,
}: SegmentTimelineProps) {
  const totalDuration = segments.reduce((acc, s) => acc + s.durationSec, 0)

  return (
    <div className="p-4 space-y-4">
      {/* Info bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#EEF0F8", border: "1px solid #D8DBF0" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#4F46E5", flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span className="text-[11px]" style={{ color: "#4F46E5" }}>
          AI Split is now in Theater module.{" "}
          <Link href={`/dev/theater/${scriptId}`} className="underline font-medium">Open Theater →</Link>
        </span>
        {segments.length > 0 && (
          <span className="text-[10px] ml-auto font-medium" style={{ color: "#6366F1" }}>
            {segments.length} segs · {totalDuration}s
          </span>
        )}
      </div>

      {/* Segment List */}
      {segments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12" style={{ color: "#CCC" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-40">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <line x1="9" x2="9" y1="3" y2="21" />
          </svg>
          <p className="text-xs">No segments yet</p>
          <Link href={`/dev/theater/${scriptId}`}
            className="mt-2 text-[11px] px-3 py-1 rounded"
            style={{ background: "#4F46E5", color: "#fff" }}>
            Go to Theater to split →
          </Link>
        </div>
      ) : (
        <div className="space-y-1">
          {segments.map(segment => (
            <SegmentCard
              key={segment.id}
              segment={segment}
              isSelected={segment.id === selectedSegmentId}
              onSelect={() => onSelectSegment(segment.id === selectedSegmentId ? null : segment.id)}
            />
          ))}
        </div>
      )}

      {/* Characters reference */}
      {roles.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#AAA" }}>Characters</span>
          <div className="flex gap-2 flex-wrap">
            {roles.map(role => (
              <div key={role.id} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: "#E8E8E8" }}>
                {role.referenceImages?.[0] ? (
                  <img src={role.referenceImages[0]} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px]" style={{ background: "#D0D0D0", color: "#888" }}>
                    {role.name[0]}
                  </div>
                )}
                <span className="text-[10px]" style={{ color: "#666" }}>{role.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
