"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { t } from "@/lib/i18n"
import { usePreloadVideos } from "./hooks/use-preload-videos"
import type { Script, VideoSegment } from "./lib/editing-helpers"
import { getTitleAbbrev, getFilename, formatDuration, downloadTextFile, buildEDL, buildCSV } from "./lib/editing-helpers"
import { useAudioTrack } from "./hooks/use-audio-track"
import { SeamlessPlayer } from "./components/seamless-player"
import { AudioMixer } from "./components/audio-mixer"
import { SourcePanel } from "./components/source-panel"
import { TimelinePanel } from "./components/timeline-panel"
import { ContextMenu } from "./components/context-menu"
import { PromptComposer } from "./components/prompt-composer"

type ComposerState = {
  mode: "replace" | "insert" | "append"
  segment?: VideoSegment | null
  afterIndex: number
  sceneNum: number
} | null

export function EditingWorkspace({ script }: { script: Script }) {
  const episodes = [...new Set(script.scenes.map(s => s.episodeNum))].sort((a, b) => a - b)
  if (episodes.length === 0) for (let i = 1; i <= script.targetEpisodes; i++) episodes.push(i)

  const abbrev = getTitleAbbrev(script.title)
  const [selectedEp, setSelectedEp] = useState(episodes[0] ?? 1)
  const [playingSegId, setPlayingSegId] = useState<string | null>(null)
  const [isSequentialPlay, setIsSequentialPlay] = useState(false)
  const [currentSegTime, setCurrentSegTime] = useState(0)
  const [videoVolume, setVideoVolume] = useState(0.8)
  const [isPaused, setIsPaused] = useState(true) // Start paused like Premiere

  // Audio
  const audio = useAudioTrack(script.id, selectedEp)

  // Timeline order: initially all done segments in segmentIndex order
  const [timelineOrder, setTimelineOrder] = useState<Record<number, string[]>>({})
  // Trim data per segment
  const [trimData, setTrimData] = useState<Record<string, { trimIn: number; trimOut: number }>>({})
  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; seg: VideoSegment } | null>(null)
  // Prompt Composer
  const [composer, setComposer] = useState<ComposerState>(null)
  // Dirty flags
  const [orderDirty, setOrderDirty] = useState(false)
  const [trimDirty, setTrimDirty] = useState(false)

  // Episode segments
  const epSegments = useMemo(
    () => script.videoSegments.filter(s => s.episodeNum === selectedEp).sort((a, b) => a.segmentIndex - b.segmentIndex),
    [script.videoSegments, selectedEp]
  )

  const doneSegs = useMemo(
    () => epSegments.filter(s => s.status === "done" && s.videoUrl),
    [epSegments]
  )

  // Timeline ordered IDs (default to done segments in order)
  const orderedIds = useMemo(() => {
    if (timelineOrder[selectedEp]) return timelineOrder[selectedEp]
    return doneSegs.map(s => s.id)
  }, [timelineOrder, selectedEp, doneSegs])

  // Current playing index within orderedIds (for seamless player)
  const orderedSegs = useMemo(() => {
    const segMap = new Map(doneSegs.map(s => [s.id, s]))
    return orderedIds.map(id => segMap.get(id)).filter((s): s is VideoSegment => !!s)
  }, [orderedIds, doneSegs])

  const currentPlayIdx = useMemo(
    () => orderedSegs.findIndex(s => s.id === playingSegId),
    [orderedSegs, playingSegId]
  )

  const playingSeg = epSegments.find(s => s.id === playingSegId) ?? null
  const totalDuration = doneSegs.reduce((a, s) => a + s.durationSec, 0)
  const epStr = String(selectedEp).padStart(2, "0")
  const projectCode = `${abbrev}-S${epStr}`

  // Handlers
  const handleSequenceEnded = useCallback(() => {
    setIsSequentialPlay(false)
    setIsPaused(true)
    audio.pause()
  }, [audio])

  const handleSegmentChange = useCallback((newIdx: number) => {
    if (newIdx >= 0 && newIdx < orderedSegs.length) {
      setPlayingSegId(orderedSegs[newIdx].id)
    }
  }, [orderedSegs])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentSegTime(time)
  }, [])

  const handlePreview = useCallback((seg: VideoSegment) => {
    setPlayingSegId(seg.id)
    setIsSequentialPlay(false)
    setIsPaused(false) // clicking a clip starts playing it
    setCurrentSegTime(0)
    // Sync audio position
    if (audio.audioUrl) {
      const idx = orderedSegs.findIndex(s => s.id === seg.id)
      if (idx >= 0) {
        let elapsed = 0
        for (let i = 0; i < idx; i++) elapsed += orderedSegs[i].durationSec
        audio.seekTo(elapsed)
      }
    }
  }, [orderedSegs, audio])

  const handlePlayAll = useCallback(() => {
    if (orderedSegs.length === 0) return
    setPlayingSegId(orderedSegs[0].id)
    setIsSequentialPlay(true)
    setIsPaused(false)
    setCurrentSegTime(0)
    if (audio.audioUrl) {
      audio.seekTo(0)
      audio.play()
    }
  }, [orderedSegs, audio])

  const handleStopSequence = useCallback(() => {
    setIsSequentialPlay(false)
    setIsPaused(true)
    audio.pause()
  }, [audio])

  const handleReorder = useCallback((newOrder: string[]) => {
    setTimelineOrder(prev => ({ ...prev, [selectedEp]: newOrder }))
    setOrderDirty(true)
  }, [selectedEp])

  const handleTrimChange = useCallback((segId: string, trimIn: number, trimOut: number) => {
    setTrimData(prev => ({ ...prev, [segId]: { trimIn, trimOut } }))
    setTrimDirty(true)
  }, [])

  const handleSaveOrder = useCallback(async () => {
    const order = orderedIds.map((id, i) => ({ segmentId: id, newIndex: i }))
    try {
      await fetch("/api/editing/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, episodeNum: selectedEp, order }),
      })
      setOrderDirty(false)
    } catch (err) {
      console.error("Save order failed:", err)
    }
  }, [orderedIds, script.id, selectedEp])

  const handleSaveTrim = useCallback(async () => {
    try {
      await fetch("/api/editing/trim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, trimData }),
      })
      setTrimDirty(false)
    } catch (err) {
      console.error("Save trim failed:", err)
    }
  }, [script.id, trimData])

  const handleInsert = useCallback((afterIndex: number) => {
    // Find the scene of the segment at afterIndex
    const seg = orderedSegs[afterIndex]
    setComposer({
      mode: "insert",
      afterIndex,
      sceneNum: seg?.sceneNum ?? 1,
    })
  }, [orderedSegs])

  const handleContextMenu = useCallback((e: React.MouseEvent, seg: VideoSegment) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, seg })
  }, [])

  const handleEditRegenerate = useCallback((seg: VideoSegment) => {
    setComposer({
      mode: "replace",
      segment: seg,
      afterIndex: seg.segmentIndex,
      sceneNum: seg.sceneNum,
    })
  }, [])

  const handleQuickRegenerate = useCallback(async (seg: VideoSegment) => {
    try {
      await fetch("/api/video/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: seg.id }),
      })
      await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          segmentIds: [seg.id],
          model: seg.model || "seedance_2_0",
          resolution: seg.resolution || "720p",
        }),
      })
    } catch (err) {
      console.error("Quick regenerate failed:", err)
    }
  }, [script.id])

  const handleDownloadClip = useCallback((seg: VideoSegment) => {
    if (!seg.videoUrl) return
    const fn = getFilename(abbrev, selectedEp, seg.sceneNum, seg.segmentIndex)
    const a = document.createElement("a")
    a.href = seg.videoUrl
    a.download = fn
    a.target = "_blank"
    a.click()
  }, [abbrev, selectedEp])

  const handleDownloadAll = useCallback(() => {
    // Only download segments on the timeline (orderedIds), not all done segments
    const segMap = new Map(doneSegs.map(s => [s.id, s]))
    for (const id of orderedIds) {
      const seg = segMap.get(id)
      if (seg) handleDownloadClip(seg)
    }
  }, [doneSegs, orderedIds, handleDownloadClip])

  const handleExportEDL = useCallback(() => {
    downloadTextFile(`${projectCode}.edl`, buildEDL(script.title, selectedEp, abbrev, epSegments, orderedIds, trimData))
  }, [projectCode, script.title, selectedEp, abbrev, epSegments, orderedIds, trimData])

  const handleExportCSV = useCallback(() => {
    downloadTextFile(`${projectCode}-manifest.csv`, buildCSV(script.title, selectedEp, abbrev, epSegments, orderedIds, trimData))
  }, [projectCode, script.title, selectedEp, abbrev, epSegments, orderedIds, trimData])

  const handleComposerReplace = useCallback(async (segId: string, prompt: string, durationSec: number, shotType: string, cameraMove: string) => {
    try {
      // Reset + update prompt, then submit
      await fetch("/api/video/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: segId }),
      })
      // TODO: update prompt in DB if needed, then submit
      await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          segmentIds: [segId],
          model: "seedance_2_0",
          resolution: "720p",
        }),
      })
    } catch (err) {
      console.error("Replace failed:", err)
    }
  }, [script.id])

  const handleComposerInsert = useCallback(async (afterIndex: number, prompt: string, durationSec: number, shotType: string, cameraMove: string, sceneNum: number) => {
    try {
      await fetch("/api/editing/insert-broll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum: selectedEp,
          afterIndex,
          prompt,
          durationSec,
          shotType: shotType || undefined,
          cameraMove: cameraMove || undefined,
          sceneNum,
        }),
      })
    } catch (err) {
      console.error("Insert failed:", err)
    }
  }, [script.id, selectedEp])

  // Seek to specific time (from ruler click)
  const handleSeekToTime = useCallback((time: number) => {
    if (orderedSegs.length === 0) return
    // Find which segment this time falls into
    let cumTime = 0
    for (const seg of orderedSegs) {
      const trim = trimData[seg.id]
      const effectiveDur = Math.max(0.5, seg.durationSec - (trim?.trimIn ?? 0) - (trim?.trimOut ?? 0))
      if (time < cumTime + effectiveDur) {
        setPlayingSegId(seg.id)
        setIsSequentialPlay(false)
        setCurrentSegTime(time - cumTime)
        // Sync audio
        if (audio.audioUrl) {
          audio.seekTo(time)
        }
        return
      }
      cumTime += effectiveDur
    }
    // If beyond end, select last segment
    const lastSeg = orderedSegs[orderedSegs.length - 1]
    setPlayingSegId(lastSeg.id)
    setIsSequentialPlay(false)
  }, [orderedSegs, trimData, audio])

  // Preload videos
  const preload = usePreloadVideos(epSegments)

  // Spacebar play/stop toggle (Premiere-style)
  const handleTogglePlayback = useCallback(() => {
    if (orderedSegs.length === 0) return

    if (isPaused) {
      // Resume or start from beginning
      if (!playingSegId) {
        // Nothing selected → play from start
        setPlayingSegId(orderedSegs[0].id)
        setIsSequentialPlay(true)
        setCurrentSegTime(0)
        if (audio.audioUrl) {
          audio.seekTo(0)
          audio.play()
        }
      } else {
        // Resume current position, sequential mode
        setIsSequentialPlay(true)
        if (audio.audioUrl) audio.play()
      }
      setIsPaused(false)
    } else {
      // Pause
      setIsPaused(true)
      setIsSequentialPlay(false)
      if (audio.audioUrl) audio.pause()
    }
  }, [orderedSegs, isPaused, playingSegId, audio])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.code === "Space") {
        e.preventDefault()
        handleTogglePlayback()
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        // Previous segment
        if (currentPlayIdx > 0) handleSegmentChange(currentPlayIdx - 1)
      } else if (e.code === "ArrowRight") {
        e.preventDefault()
        // Next segment
        if (currentPlayIdx < orderedSegs.length - 1) handleSegmentChange(currentPlayIdx + 1)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleTogglePlayback, currentPlayIdx, orderedSegs.length, handleSegmentChange])

  const handleSelectEp = useCallback((ep: number) => {
    setSelectedEp(ep)
    setPlayingSegId(null)
    setIsSequentialPlay(false)
  }, [])

  return (
    <div className="h-full grid grid-cols-[240px_1fr] grid-rows-[1fr]" style={{ background: "#F5F5F5" }}>

      {/* Left: Source Panel */}
      <SourcePanel
        episodes={episodes}
        selectedEp={selectedEp}
        onSelectEp={handleSelectEp}
        scenes={script.scenes}
        segments={script.videoSegments}
        timelineIds={orderedIds}
        onPreview={handlePreview}
        onDragStart={() => {}}
        onContextMenu={handleContextMenu}
      />

      {/* Right: Monitor + Timeline */}
      <div className="flex flex-col min-h-0">

        {/* Monitor area */}
        <div className="flex flex-shrink-0" style={{ height: "55%", minHeight: 200 }}>
          {/* Video preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header bar */}
            <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0" style={{ background: "#1A1A2E", borderBottom: "1px solid #0F0F1E" }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: doneSegs.length === epSegments.length && epSegments.length > 0 ? "#10B981" : "#F59E0B" }} />
              <div>
                <h1 className="text-[12px] font-bold" style={{ color: "#fff" }}>{script.title}</h1>
                <p className="text-[9px] font-mono" style={{ color: "#6366F1" }}>{projectCode}</p>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-3">
                {preload.isLoading && (
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <div
                        className="h-full transition-all duration-300"
                        style={{ width: `${preload.percent}%`, background: "#6366F1" }}
                      />
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: "#888" }}>
                      {t("dev.editing.preloading")} {preload.percent}%
                    </span>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-[9px]" style={{ color: "#666" }}>Clips</p>
                  <p className="text-[11px] font-bold font-mono" style={{ color: doneSegs.length === epSegments.length ? "#10B981" : "#F59E0B" }}>
                    {doneSegs.length}/{epSegments.length}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px]" style={{ color: "#666" }}>Duration</p>
                  <p className="text-[11px] font-bold font-mono" style={{ color: "#A5B4FC" }}>{formatDuration(totalDuration)}</p>
                </div>
              </div>
            </div>

            {/* Player */}
            <div className="flex-1 relative" style={{ background: "#000" }}>
              {currentPlayIdx >= 0 && orderedSegs.length > 0 ? (
                <SeamlessPlayer
                  segments={orderedSegs}
                  currentIdx={currentPlayIdx}
                  isPlaying={!isPaused}
                  videoVolume={videoVolume}
                  onSegmentChange={handleSegmentChange}
                  onEnded={handleSequenceEnded}
                  onTimeUpdate={handleTimeUpdate}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center" style={{ color: "#444" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-40">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <p className="text-[10px]">{doneSegs.length > 0 ? t("dev.editing.clickToPreview") : t("dev.editing.noClips")}</p>
                </div>
              )}
              {playingSeg && (
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none" style={{ zIndex: 10 }}>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)", color: "#A5B4FC" }}>
                    #{playingSeg.segmentIndex + 1} · SC{String(playingSeg.sceneNum).padStart(2, "0")} · {playingSeg.durationSec}s
                  </span>
                  {isSequentialPlay && (
                    <span className="text-[8px] px-2 py-0.5 rounded animate-pulse" style={{ background: "rgba(79,70,229,0.8)", color: "#fff" }}>
                      Sequential
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Audio Mixer */}
            <AudioMixer videoVolume={videoVolume} setVideoVolume={setVideoVolume} audio={audio} />

            {/* Playback controls */}
            <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ background: "#EBEBEB", borderTop: "1px solid #D0D0D0" }}>
              {/* Play/Pause toggle (Spacebar) */}
              <button
                onClick={handleTogglePlayback}
                disabled={orderedSegs.length === 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium disabled:opacity-40"
                style={{ background: isPaused ? "#4F46E5" : "#DC2626", color: "#fff" }}
                title="Space"
              >
                {isPaused ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                ) : (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                )}
                {isPaused ? t("dev.editing.playAll") : t("dev.editing.stopSequence")}
              </button>
              {/* Prev / Next */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSegmentChange(currentPlayIdx - 1)}
                  disabled={currentPlayIdx <= 0}
                  className="text-[10px] px-1 py-0.5 rounded disabled:opacity-30"
                  style={{ background: "#E0E0E0", color: "#555" }}
                  title="←"
                >◀</button>
                <span className="text-[9px] font-mono" style={{ color: "#888" }}>
                  {currentPlayIdx >= 0 ? `${currentPlayIdx + 1}/${orderedSegs.length}` : `–/${orderedSegs.length}`}
                </span>
                <button
                  onClick={() => handleSegmentChange(currentPlayIdx + 1)}
                  disabled={currentPlayIdx >= orderedSegs.length - 1}
                  className="text-[10px] px-1 py-0.5 rounded disabled:opacity-30"
                  style={{ background: "#E0E0E0", color: "#555" }}
                  title="→"
                >▶</button>
              </div>
              <div className="flex-1" />
              {playingSeg && (
                <span className="text-[9px] font-mono" style={{ color: "#888" }}>
                  {getFilename(abbrev, selectedEp, playingSeg.sceneNum, playingSeg.segmentIndex)}
                </span>
              )}
            </div>
          </div>

          {/* Clip info sidebar */}
          {playingSeg && (
            <div className="w-52 flex-shrink-0 overflow-y-auto dev-scrollbar" style={{ background: "#F0F0F0", borderLeft: "1px solid #D8D8D8" }}>
              <div className="p-3">
                <p className="text-[8px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#AAA" }}>Prompt</p>
                <p className="text-[10px] leading-relaxed" style={{ color: "#555" }}>{playingSeg.prompt}</p>
                <div className="mt-2 grid grid-cols-1 gap-1.5 text-[9px]">
                  {playingSeg.shotType && (
                    <div className="px-2 py-1 rounded" style={{ background: "#E8E8E8" }}>
                      <span style={{ color: "#AAA" }}>Shot: </span>
                      <span style={{ color: "#555" }}>{playingSeg.shotType}</span>
                    </div>
                  )}
                  {playingSeg.cameraMove && (
                    <div className="px-2 py-1 rounded" style={{ background: "#E8E8E8" }}>
                      <span style={{ color: "#AAA" }}>Camera: </span>
                      <span style={{ color: "#555" }}>{playingSeg.cameraMove}</span>
                    </div>
                  )}
                  {playingSeg.model && (
                    <div className="px-2 py-1 rounded" style={{ background: "#E8E8E8" }}>
                      <span style={{ color: "#AAA" }}>Model: </span>
                      <span style={{ color: "#555" }}>{playingSeg.model}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <TimelinePanel
          title={script.title}
          segments={epSegments}
          scenes={script.scenes.filter(s => s.episodeNum === selectedEp)}
          orderedIds={orderedIds}
          currentPlayId={playingSegId}
          playheadTime={currentSegTime}
          trimData={trimData}
          audioName={audio.audioUrl ? audio.audioName : null}
          onSelectSegment={handlePreview}
          onReorder={handleReorder}
          onTrimChange={handleTrimChange}
          onInsert={handleInsert}
          onContextMenu={handleContextMenu}
          onExportEDL={handleExportEDL}
          onExportCSV={handleExportCSV}
          onDownloadAll={handleDownloadAll}
          onSeekToTime={handleSeekToTime}
        />
      </div>

      {/* Save buttons (floating) */}
      {(orderDirty || trimDirty) && (
        <div className="fixed bottom-4 right-4 flex gap-2 z-50">
          {orderDirty && (
            <button
              onClick={handleSaveOrder}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium shadow-lg"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              {t("dev.editing.saveOrder")}
            </button>
          )}
          {trimDirty && (
            <button
              onClick={handleSaveTrim}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium shadow-lg"
              style={{ background: "#0D9488", color: "#fff" }}
            >
              Save Trim
            </button>
          )}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          segment={ctxMenu.seg}
          onClose={() => setCtxMenu(null)}
          onEditRegenerate={handleEditRegenerate}
          onQuickRegenerate={handleQuickRegenerate}
          onDownload={handleDownloadClip}
        />
      )}

      {/* Prompt Composer */}
      {composer && (
        <PromptComposer
          mode={composer.mode}
          scriptId={script.id}
          episodeNum={selectedEp}
          segment={composer.segment}
          afterIndex={composer.afterIndex}
          sceneNum={composer.sceneNum}
          scenes={script.scenes}
          roles={script.roles || []}
          locations={script.locations || []}
          props={script.props || []}
          nearbySegments={epSegments.slice(
            Math.max(0, composer.afterIndex - 3),
            composer.afterIndex + 4
          )}
          onClose={() => setComposer(null)}
          onSubmitReplace={handleComposerReplace}
          onSubmitInsert={handleComposerInsert}
        />
      )}
    </div>
  )
}
