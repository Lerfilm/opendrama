"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { t } from "@/lib/i18n"
import type { VideoSegment, Scene } from "../lib/editing-helpers"
import { STATUS_MAP, formatDuration, getFilename, getTitleAbbrev } from "../lib/editing-helpers"

interface TimelinePanelProps {
  title: string
  segments: VideoSegment[] // all ep segments
  scenes: Scene[]
  orderedIds: string[] // timeline order (subset of segments)
  currentPlayId: string | null
  playheadTime: number // current time within playing segment
  trimData: Record<string, { trimIn: number; trimOut: number }>
  audioName: string | null
  onSelectSegment: (seg: VideoSegment) => void
  onReorder: (newOrder: string[]) => void
  onTrimChange: (segId: string, trimIn: number, trimOut: number) => void
  onInsert: (afterIndex: number) => void
  onContextMenu: (e: React.MouseEvent, seg: VideoSegment) => void
  onExportEDL: () => void
  onExportCSV: () => void
  onDownloadAll: () => void
  onSeekToTime?: (time: number) => void
}

export function TimelinePanel({
  title,
  segments,
  scenes,
  orderedIds,
  currentPlayId,
  playheadTime,
  trimData,
  audioName,
  onSelectSegment,
  onReorder,
  onTrimChange,
  onInsert,
  onContextMenu,
  onExportEDL,
  onExportCSV,
  onDownloadAll,
  onSeekToTime,
}: TimelinePanelProps) {
  const [pxPerSec, setPxPerSec] = useState(20)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [trimming, setTrimming] = useState<{ segId: string; side: "left" | "right"; startX: number; startVal: number } | null>(null)

  const segMap = new Map(segments.map(s => [s.id, s]))
  const orderedSegs = orderedIds.map(id => segMap.get(id)).filter((s): s is VideoSegment => !!s)

  // Change doneCount to count only timeline done segments
  const timelineDoneCount = orderedIds.filter(id => {
    const s = segMap.get(id)
    return s && s.status === "done"
  }).length

  // Calculate total duration and clip positions
  const clips: { seg: VideoSegment; left: number; width: number; effectiveDur: number }[] = []
  let cumTime = 0
  for (const seg of orderedSegs) {
    const trim = trimData[seg.id]
    const trimIn = trim?.trimIn ?? 0
    const trimOut = trim?.trimOut ?? 0
    const effectiveDur = Math.max(0.5, seg.durationSec - trimIn - trimOut)
    clips.push({
      seg,
      left: cumTime * pxPerSec,
      width: effectiveDur * pxPerSec,
      effectiveDur,
    })
    cumTime += effectiveDur
  }
  const totalDuration = cumTime
  const totalWidth = totalDuration * pxPerSec

  // Playhead position
  let playheadPx = 0
  if (currentPlayId) {
    let elapsed = 0
    for (const clip of clips) {
      if (clip.seg.id === currentPlayId) {
        playheadPx = (elapsed + Math.min(playheadTime, clip.effectiveDur)) * pxPerSec
        break
      }
      elapsed += clip.effectiveDur
    }
  }

  // Zoom — save previous zoom for backslash toggle
  const prevZoomRef = useRef<{ pxPerSec: number; scrollLeft: number } | null>(null)

  const zoomIn = () => setPxPerSec(p => Math.min(300, p * 1.3))
  const zoomOut = () => setPxPerSec(p => Math.max(2, p / 1.3))
  const fitAll = useCallback(() => {
    if (scrollRef.current && totalDuration > 0) {
      // Save current zoom state for toggle
      prevZoomRef.current = { pxPerSec, scrollLeft: scrollRef.current.scrollLeft }
      setPxPerSec(Math.max(2, Math.min(300, (scrollRef.current.clientWidth - 40) / totalDuration)))
      scrollRef.current.scrollLeft = 0
    }
  }, [totalDuration, pxPerSec])

  const fitToggle = useCallback(() => {
    if (!scrollRef.current) return
    if (prevZoomRef.current) {
      // Restore previous zoom
      const prev = prevZoomRef.current
      prevZoomRef.current = null
      setPxPerSec(prev.pxPerSec)
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = prev.scrollLeft
      })
    } else {
      fitAll()
    }
  }, [fitAll])

  // Auto-fit all segments on mount and when total duration changes
  useEffect(() => {
    if (scrollRef.current && totalDuration > 0) {
      const ideal = (scrollRef.current.clientWidth - 40) / totalDuration
      setPxPerSec(Math.max(2, Math.min(300, ideal)))
      if (scrollRef.current) scrollRef.current.scrollLeft = 0
    }
  }, [totalDuration])

  // Alt+scroll zoom (anchored at cursor like Premiere), Shift+scroll horizontal scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) {
        // Zoom anchored at cursor position
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const mouseX = e.clientX - rect.left // cursor offset from left edge
        const cursorTime = (el.scrollLeft + mouseX - 32) / pxPerSec // time at cursor

        const factor = e.deltaY > 0 ? 0.85 : 1.18
        const newPxPerSec = Math.max(2, Math.min(300, pxPerSec * factor))
        setPxPerSec(newPxPerSec)

        // Adjust scroll so cursor stays at the same time position
        requestAnimationFrame(() => {
          if (el) el.scrollLeft = cursorTime * newPxPerSec - mouseX + 32
        })
      } else if (e.shiftKey) {
        // Horizontal scroll
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [pxPerSec])

  // Keyboard shortcuts: \ for fit toggle, +/- for zoom
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.code === "Backslash") {
        e.preventDefault()
        fitToggle()
      } else if (e.code === "Equal" || e.code === "NumpadAdd") {
        e.preventDefault()
        zoomIn()
      } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault()
        zoomOut()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [fitToggle])

  // Page scroll during playback — keep playhead visible
  useEffect(() => {
    if (!currentPlayId || !scrollRef.current) return
    const el = scrollRef.current
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    const headPx = playheadPx + 32

    // If playhead is near the right edge (within 60px) or past it, page-scroll
    if (headPx > viewRight - 60) {
      el.scrollLeft = headPx - 60
    } else if (headPx < viewLeft + 32) {
      el.scrollLeft = headPx - 60
    }
  }, [playheadPx, currentPlayId])

  // Adaptive ruler ticks (Premiere-style: never overlap labels)
  // Target: labels ~60px apart minimum
  const minLabelGapPx = 60
  const candidateIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  let tickInterval = 10
  for (const iv of candidateIntervals) {
    if (iv * pxPerSec >= minLabelGapPx) { tickInterval = iv; break }
  }
  const ticks: number[] = []
  for (let time = 0; time <= totalDuration + tickInterval; time += tickInterval) ticks.push(time)

  // Scene markers
  const sceneMarkers: { time: number; sceneNum: number }[] = []
  let markerCum = 0
  for (let i = 0; i < orderedSegs.length; i++) {
    const seg = orderedSegs[i]
    if (i === 0 || seg.sceneNum !== orderedSegs[i - 1].sceneNum) {
      sceneMarkers.push({ time: markerCum, sceneNum: seg.sceneNum })
    }
    const trim = trimData[seg.id]
    markerCum += Math.max(0.5, seg.durationSec - (trim?.trimIn ?? 0) - (trim?.trimOut ?? 0))
  }

  // DnD handlers
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIdx(idx)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, insertIdx: number) => {
    e.preventDefault()
    setDragOverIdx(null)
    const segId = e.dataTransfer.getData("text/plain")
    if (!segId) return

    // Remove from current position, insert at new
    const newOrder = orderedIds.filter(id => id !== segId)
    // Adjust insert index if the removed item was before it
    const oldIdx = orderedIds.indexOf(segId)
    const adjustedIdx = oldIdx < insertIdx ? insertIdx - 1 : insertIdx
    newOrder.splice(adjustedIdx, 0, segId)
    onReorder(newOrder)
  }, [orderedIds, onReorder])

  const handleDragLeave = useCallback(() => {
    setDragOverIdx(null)
  }, [])

  // Trim pointer handlers
  const handleTrimStart = useCallback((e: React.PointerEvent, segId: string, side: "left" | "right") => {
    e.stopPropagation()
    e.preventDefault()
    const trim = trimData[segId]
    setTrimming({
      segId,
      side,
      startX: e.clientX,
      startVal: side === "left" ? (trim?.trimIn ?? 0) : (trim?.trimOut ?? 0),
    })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [trimData])

  const handleTrimMove = useCallback((e: React.PointerEvent) => {
    if (!trimming) return
    const seg = segMap.get(trimming.segId)
    if (!seg) return
    const dx = e.clientX - trimming.startX
    const dSec = dx / pxPerSec
    const maxTrim = seg.durationSec - 0.5 // leave at least 0.5s

    if (trimming.side === "left") {
      const newVal = Math.max(0, Math.min(maxTrim, trimming.startVal + dSec))
      onTrimChange(trimming.segId, newVal, trimData[trimming.segId]?.trimOut ?? 0)
    } else {
      const newVal = Math.max(0, Math.min(maxTrim, trimming.startVal - dSec))
      onTrimChange(trimming.segId, trimData[trimming.segId]?.trimIn ?? 0, newVal)
    }
  }, [trimming, pxPerSec, segMap, trimData, onTrimChange])

  const handleTrimEnd = useCallback(() => {
    setTrimming(null)
  }, [])


  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#F5F5F5", borderTop: "1px solid #D0D0D0" }}
      onPointerMove={trimming ? handleTrimMove : undefined}
      onPointerUp={trimming ? handleTrimEnd : undefined}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ background: "#EBEBEB", borderBottom: "1px solid #D0D0D0" }}>
        <button onClick={zoomOut} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#E0E0E0", color: "#555" }} title={t("dev.editing.zoomOut")}>−</button>
        <span className="text-[9px] font-mono w-8 text-center" style={{ color: "#888" }}>{pxPerSec >= 100 ? `${Math.round(pxPerSec)}` : Math.round(pxPerSec)}</span>
        <button onClick={zoomIn} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#E0E0E0", color: "#555" }} title={t("dev.editing.zoomIn")}>+</button>
        <button onClick={fitAll} className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#E0E0E0", color: "#555" }}>{t("dev.editing.fitToScreen")}</button>

        <div className="w-px h-4" style={{ background: "#D0D0D0" }} />

        {/* Export buttons */}
        <button
          onClick={onDownloadAll}
          disabled={timelineDoneCount === 0}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium disabled:opacity-40"
          style={{ background: "#065F46", color: "#D1FAE5" }}
        >
          ↓ {t("dev.editing.downloadAll")} ({timelineDoneCount})
        </button>
        <button onClick={onExportEDL} disabled={timelineDoneCount === 0} className="text-[10px] px-2 py-0.5 rounded font-medium disabled:opacity-40" style={{ background: "#1E3A5F", color: "#93C5FD" }}>
          {t("dev.editing.exportEDL")}
        </button>
        <button onClick={onExportCSV} className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: "#3A2E1E", color: "#FCD34D" }}>
          {t("dev.editing.exportCSV")}
        </button>

        <div className="w-px h-4" style={{ background: "#D0D0D0" }} />
        <button
          onClick={() => onInsert(orderedSegs.length > 0 ? orderedSegs.length - 1 : 0)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
          style={{ background: "#4F46E5", color: "#E0E7FF" }}
        >
          + {t("dev.editing.insertShot")}
        </button>

        <div className="flex-1" />

        <span className="text-[10px] font-mono" style={{ color: "#888" }}>
          {formatDuration(totalDuration)} · {orderedSegs.length} clips
        </span>
      </div>

      {/* Timeline area */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden dev-scrollbar" style={{ position: "relative" }}>
        <div style={{ width: Math.max(totalWidth + 100, scrollRef.current?.clientWidth || 800), minHeight: "100%", position: "relative" }}>
          {/* Ruler */}
          <div
            className="h-5 relative cursor-pointer"
            style={{ background: "#EBEBEB", borderBottom: "1px solid #D0D0D0" }}
            onClick={(e) => {
              if (!onSeekToTime || !scrollRef.current) return
              const rect = scrollRef.current.getBoundingClientRect()
              const scrollLeft = scrollRef.current.scrollLeft
              const x = e.clientX - rect.left + scrollLeft - 32
              const time = Math.max(0, x / pxPerSec)
              onSeekToTime(time)
            }}
          >
            {ticks.map(sec => {
              // Format: show fractional seconds at high zoom, MM:SS at low zoom
              let label: string
              if (tickInterval < 1) {
                label = sec.toFixed(1) + "s"
              } else if (sec < 60) {
                label = `0:${String(Math.floor(sec)).padStart(2, "0")}`
              } else if (sec < 3600) {
                label = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`
              } else {
                const h = Math.floor(sec / 3600)
                const m = Math.floor((sec % 3600) / 60)
                const s = Math.floor(sec % 60)
                label = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
              }
              return (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 flex flex-col items-center"
                  style={{ left: sec * pxPerSec }}
                >
                  <div className="w-px h-2" style={{ background: "#BBB" }} />
                  <span className="text-[7px] font-mono" style={{ color: "#999" }}>
                    {label}
                  </span>
                </div>
              )
            })}
            {/* Scene markers */}
            {sceneMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute top-0"
                style={{ left: m.time * pxPerSec - 4 }}
              >
                <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid #F59E0B" }} />
              </div>
            ))}
          </div>

          {/* Video track */}
          <div className="h-14 relative" style={{ background: "#F0F0F0" }}>
            <div className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center" style={{ background: "#E0E0E0", borderRight: "1px solid #D0D0D0", zIndex: 5 }}>
              <span className="text-[8px] font-bold" style={{ color: "#888" }}>V</span>
            </div>

            {/* Clips */}
            {clips.map((clip, idx) => {
              const st = STATUS_MAP[clip.seg.status] || STATUS_MAP.pending
              const isCurrent = clip.seg.id === currentPlayId
              const abbrev = getTitleAbbrev(title)
              const trim = trimData[clip.seg.id]
              const hasTrim = (trim?.trimIn ?? 0) > 0 || (trim?.trimOut ?? 0) > 0

              return (
                <div key={clip.seg.id} style={{ position: "absolute", left: clip.left + 32, top: 2, width: clip.width, height: 40 }}>
                  {/* DnD drop zone before this clip */}
                  <div
                    className="absolute -left-1 top-0 bottom-0 w-2 z-10"
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, idx)}
                  />

                  {/* Drop indicator */}
                  {dragOverIdx === idx && (
                    <div className="absolute -left-1 top-0 bottom-0 w-0.5 z-20" style={{ background: "#F59E0B" }} />
                  )}

                  {/* Clip block */}
                  <div
                    className={`absolute inset-0 rounded overflow-hidden cursor-pointer transition-all ${isCurrent ? "ring-2 ring-indigo-500" : ""}`}
                    style={{ background: st.bg, border: `1px solid ${isCurrent ? "#4F46E5" : "#D0D0D0"}` }}
                    onClick={() => onSelectSegment(clip.seg)}
                    onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, clip.seg) }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", clip.seg.id)
                      e.dataTransfer.effectAllowed = "move"
                    }}
                  >
                    {/* Thumbnail background */}
                    {clip.seg.thumbnailUrl && (
                      <img src={clip.seg.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover opacity-30" alt="" />
                    )}
                    {/* Content */}
                    <div className="relative z-10 flex items-center h-full px-1.5 gap-1">
                      <span className="text-[8px] font-mono font-bold" style={{ color: st.color }}>
                        {clip.seg.segmentIndex + 1}
                      </span>
                      {clip.width > 60 && (
                        <span className="text-[7px] truncate" style={{ color: "#666" }}>
                          {getFilename(abbrev, clip.seg.episodeNum, clip.seg.sceneNum, clip.seg.segmentIndex).replace(".mp4", "").slice(-12)}
                        </span>
                      )}
                      {clip.width > 40 && (
                        <span className="text-[7px] ml-auto" style={{ color: "#999" }}>
                          {clip.effectiveDur.toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {/* Trim handles */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-amber-400/30"
                      onPointerDown={(e) => handleTrimStart(e, clip.seg.id, "left")}
                    />
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-amber-400/30"
                      onPointerDown={(e) => handleTrimStart(e, clip.seg.id, "right")}
                    />

                    {/* Trim overlay */}
                    {hasTrim && (
                      <>
                        {(trim?.trimIn ?? 0) > 0 && (
                          <div className="absolute left-0 top-0 bottom-0 bg-black/20 pointer-events-none"
                            style={{ width: (trim!.trimIn / clip.seg.durationSec) * clip.width }} />
                        )}
                        {(trim?.trimOut ?? 0) > 0 && (
                          <div className="absolute right-0 top-0 bottom-0 bg-black/20 pointer-events-none"
                            style={{ width: (trim!.trimOut / clip.seg.durationSec) * clip.width }} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Insert "+" button between clips */}
                  {idx < clips.length - 1 && clip.width > 30 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onInsert(idx) }}
                      className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center z-30 opacity-0 hover:opacity-100 transition-opacity"
                      style={{ background: "#5B8DEF", color: "#fff", fontSize: 10 }}
                      title="Insert shot"
                    >
                      +
                    </button>
                  )}
                </div>
              )
            })}

            {/* Drop zone at end */}
            <div
              className="absolute top-2 bottom-2 w-8 z-10"
              style={{ left: (clips.length > 0 ? clips[clips.length - 1].left + clips[clips.length - 1].width + 32 : 32) }}
              onDragOver={(e) => handleDragOver(e, orderedSegs.length)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, orderedSegs.length)}
            >
              {dragOverIdx === orderedSegs.length && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: "#F59E0B" }} />
              )}
            </div>
          </div>

          {/* Audio track */}
          <div className="h-8 relative" style={{ background: "#EBEBEB", borderTop: "1px solid #D0D0D0" }}>
            <div className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center" style={{ background: "#E0E0E0", borderRight: "1px solid #D0D0D0", zIndex: 5 }}>
              <span className="text-[8px] font-bold" style={{ color: "#888" }}>A</span>
            </div>
            {audioName && totalWidth > 0 && (
              <div className="absolute top-1 bottom-1 rounded" style={{ left: 32, width: totalWidth, background: "#C7D2FE" }}>
                <span className="text-[8px] px-2 leading-6 truncate block" style={{ color: "#3730A3" }}>
                  {audioName}
                </span>
              </div>
            )}
          </div>

          {/* Playhead */}
          {currentPlayId && (
            <div
              className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-40"
              style={{
                left: playheadPx + 32,
                background: "#EF4444",
                boxShadow: "0 0 4px rgba(239,68,68,0.6)",
              }}
            >
              <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid #EF4444", marginLeft: -3.5 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
