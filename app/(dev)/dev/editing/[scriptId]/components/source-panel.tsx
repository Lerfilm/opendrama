"use client"

import { useState } from "react"
import { t } from "@/lib/i18n"
import type { VideoSegment, Scene } from "../lib/editing-helpers"
import { STATUS_MAP } from "../lib/editing-helpers"

interface SourcePanelProps {
  episodes: number[]
  selectedEp: number
  onSelectEp: (ep: number) => void
  scenes: Scene[]
  segments: VideoSegment[]
  timelineIds: string[] // IDs currently on the timeline
  onPreview: (seg: VideoSegment) => void
  onDragStart: (segId: string) => void
  onContextMenu: (e: React.MouseEvent, seg: VideoSegment) => void
}

export function SourcePanel({
  episodes,
  selectedEp,
  onSelectEp,
  scenes,
  segments,
  timelineIds,
  onPreview,
  onDragStart,
  onContextMenu,
}: SourcePanelProps) {
  const epScenes = scenes.filter(s => s.episodeNum === selectedEp)
  const epSegments = segments.filter(s => s.episodeNum === selectedEp)
  const [collapsedScenes, setCollapsedScenes] = useState<Set<number>>(new Set())
  const timelineSet = new Set(timelineIds)

  // Group segments by scene
  const segsByScene = new Map<number, VideoSegment[]>()
  for (const seg of epSegments) {
    const list = segsByScene.get(seg.sceneNum) || []
    list.push(seg)
    segsByScene.set(seg.sceneNum, list)
  }

  // Get all scene numbers that have segments
  const sceneNums = [...new Set(epSegments.map(s => s.sceneNum))].sort((a, b) => a - b)

  const toggleScene = (sceneNum: number) => {
    setCollapsedScenes(prev => {
      const next = new Set(prev)
      if (next.has(sceneNum)) next.delete(sceneNum)
      else next.add(sceneNum)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#1A1A1D", color: "#CCC", borderRight: "1px solid #0D0D0F" }}>
      {/* EP selector */}
      <div className="flex items-center gap-1 px-2 py-2 flex-shrink-0" style={{ borderBottom: "1px solid #2C2C30" }}>
        <span className="text-[9px] font-semibold uppercase tracking-wider mr-1" style={{ color: "#666" }}>EP</span>
        {episodes.map(ep => (
          <button
            key={ep}
            onClick={() => onSelectEp(ep)}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={{
              background: ep === selectedEp ? "#5B8DEF" : "#2C2C30",
              color: ep === selectedEp ? "#fff" : "#777",
            }}
          >
            {ep}
          </button>
        ))}
      </div>

      {/* Scene / Shot list */}
      <div className="flex-1 overflow-y-auto dev-scrollbar">
        {sceneNums.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <p className="text-[11px]" style={{ color: "#555" }}>{t("dev.editing.noClips")}</p>
          </div>
        ) : (
          sceneNums.map(sceneNum => {
            const scene = epScenes.find(s => s.sceneNum === sceneNum)
            const sceneSegs = (segsByScene.get(sceneNum) || []).sort((a, b) => a.segmentIndex - b.segmentIndex)
            const isCollapsed = collapsedScenes.has(sceneNum)
            const doneCount = sceneSegs.filter(s => s.status === "done").length

            return (
              <div key={sceneNum}>
                {/* Scene header */}
                <button
                  onClick={() => toggleScene(sceneNum)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 transition-colors"
                  style={{ borderBottom: "1px solid #2C2C30" }}
                >
                  <span className="text-[9px]" style={{ color: "#666" }}>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: "#AAA" }}>
                    SC {String(sceneNum).padStart(2, "0")}
                  </span>
                  {scene?.heading && (
                    <span className="text-[9px] truncate flex-1" style={{ color: "#555" }}>
                      {scene.heading.slice(0, 25)}
                    </span>
                  )}
                  <span className="text-[9px] font-mono" style={{ color: doneCount === sceneSegs.length ? "#10B981" : "#666" }}>
                    {doneCount}/{sceneSegs.length}
                  </span>
                </button>

                {/* Shot list */}
                {!isCollapsed && (
                  <div className="py-0.5">
                    {sceneSegs.map(seg => {
                      const st = STATUS_MAP[seg.status] || STATUS_MAP.pending
                      const onTimeline = timelineSet.has(seg.id)

                      return (
                        <div
                          key={seg.id}
                          draggable={seg.status === "done"}
                          onDragStart={(e) => {
                            if (seg.status !== "done") return
                            e.dataTransfer.setData("text/plain", seg.id)
                            e.dataTransfer.effectAllowed = "copy"
                            onDragStart(seg.id)
                          }}
                          onClick={() => seg.status === "done" && onPreview(seg)}
                          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, seg) }}
                          className={`flex items-center gap-2 px-3 py-1.5 mx-1 rounded transition-colors ${
                            seg.status === "done" ? "cursor-pointer hover:bg-white/5" : "opacity-60"
                          }`}
                        >
                          {/* Drag handle */}
                          {seg.status === "done" && (
                            <span className="text-[9px] cursor-grab" style={{ color: "#444" }}>⋮⋮</span>
                          )}

                          {/* Thumbnail */}
                          <div className="w-12 h-7 rounded overflow-hidden flex-shrink-0" style={{ background: "#2C2C30" }}>
                            {seg.thumbnailUrl ? (
                              <img src={seg.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-[8px]" style={{ color: "#555" }}>{st.icon}</span>
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-mono" style={{ color: "#999" }}>
                                #{seg.segmentIndex + 1}
                              </span>
                              {/* Status dot */}
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                              <span className="text-[9px]" style={{ color: "#666" }}>
                                {seg.durationSec}s
                              </span>
                              {seg.shotType && (
                                <span className="text-[8px]" style={{ color: "#555" }}>
                                  {seg.shotType}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* On timeline indicator */}
                          {onTimeline && (
                            <span className="text-[8px]" style={{ color: "#10B981" }}>✓</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
