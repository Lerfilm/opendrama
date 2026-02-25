"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"

interface VideoSegment {
  id: string
  episodeNum: number
  segmentIndex: number
  sceneNum: number
  durationSec: number
  prompt: string
  shotType?: string | null
  cameraMove?: string | null
  beatType?: string | null
  model?: string | null
  resolution?: string | null
  status: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  tokenCost?: number | null
}

interface Scene {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  mood?: string | null
}

interface Script {
  id: string
  title: string
  targetEpisodes: number
  scenes: Scene[]
  videoSegments: VideoSegment[]
}

// ── Helpers ──────────────────────────────────────────────
function getTitleAbbrev(title: string): string {
  const words = title.trim().split(/\s+/)
  if (words.length === 1) return words[0].replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "").slice(0, 4).toUpperCase()
  return words.map(w => w[0] || "").join("").toUpperCase().slice(0, 6)
}

function getFilename(abbrev: string, epNum: number, sceneNum: number, segIdx: number): string {
  return `${abbrev}-S${String(epNum).padStart(2, "0")}-SC${String(sceneNum).padStart(3, "0")}-SEG${String(segIdx + 1).padStart(3, "0")}.mp4`
}

function formatEDLTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const f = Math.floor((sec % 1) * 30)
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}:${String(f).padStart(2,"0")}`
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function buildEDL(title: string, epNum: number, abbrev: string, segs: VideoSegment[]): string {
  const done = segs.filter(s => s.status === "done").sort((a, b) => a.segmentIndex - b.segmentIndex)
  const lines = [
    `TITLE: ${title} - Episode ${epNum}`,
    `FCM: NON-DROP FRAME`,
    ``,
  ]
  let editNum = 1
  let timelinePos = 0
  for (const seg of done) {
    const fn = getFilename(abbrev, epNum, seg.sceneNum, seg.segmentIndex).replace(".mp4", "")
    lines.push(
      `${String(editNum).padStart(3, "0")}  ${fn}  V  C  ${formatEDLTime(0)} ${formatEDLTime(seg.durationSec)} ${formatEDLTime(timelinePos)} ${formatEDLTime(timelinePos + seg.durationSec)}`,
      `* FROM CLIP NAME: ${fn}.mp4`,
      `* SCENE ${String(seg.sceneNum).padStart(3, "0")} | ${seg.durationSec}s | ${seg.shotType || "auto"}`,
      ``
    )
    editNum++
    timelinePos += seg.durationSec
  }
  return lines.join("\n")
}

function buildCSV(title: string, epNum: number, abbrev: string, segs: VideoSegment[]): string {
  const header = "Filename,Scene,Segment,Duration(s),ShotType,Camera,Status,VideoURL,Prompt"
  const rows = segs.sort((a, b) => a.segmentIndex - b.segmentIndex).map(s => {
    const fn = getFilename(abbrev, epNum, s.sceneNum, s.segmentIndex)
    return [fn, s.sceneNum, s.segmentIndex + 1, s.durationSec,
      s.shotType || "", s.cameraMove || "", s.status, s.videoUrl || "",
      `"${s.prompt.replace(/"/g, "'").slice(0, 120)}"`
    ].join(",")
  })
  return [header, ...rows].join("\n")
}

const STATUS_MAP: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  pending:    { bg: "#F3F4F6", color: "#6B7280", label: "Pending",    icon: "○" },
  reserved:   { bg: "#FEF3C7", color: "#92400E", label: "Reserved",   icon: "◎" },
  submitted:  { bg: "#DBEAFE", color: "#1D4ED8", label: "Submitted",  icon: "◌" },
  generating: { bg: "#EDE9FE", color: "#6D28D9", label: "Generating", icon: "◉" },
  done:       { bg: "#D1FAE5", color: "#065F46", label: "Done",       icon: "✓" },
  failed:     { bg: "#FEE2E2", color: "#991B1B", label: "Failed",     icon: "✕" },
}

// ── Seamless Dual-Buffer Player ──────────────────────────
// Two <video> elements overlap. While one plays, the other preloads the next
// segment. On ended, we instantly swap: the preloaded video plays (0ms gap)
// and the old element loads the next-next segment.

function SeamlessPlayer({
  segments,
  currentIdx,
  isPlaying,
  videoVolume = 1,
  onSegmentChange,
  onEnded,
  onTimeUpdate,
}: {
  segments: VideoSegment[]
  currentIdx: number
  isPlaying: boolean
  videoVolume?: number
  onSegmentChange: (idx: number) => void
  onEnded: () => void
  onTimeUpdate: (currentTime: number, duration: number) => void
}) {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  // Which buffer is active: 'A' or 'B'
  const activeBufferRef = useRef<"A" | "B">("A")
  const [activeBuffer, setActiveBuffer] = useState<"A" | "B">("A")
  // Track what URL each buffer has loaded to avoid redundant loads
  const bufferUrlA = useRef<string | null>(null)
  const bufferUrlB = useRef<string | null>(null)
  // Preload state for next segment
  const preloadedIdx = useRef<number>(-1)
  const prevIdxRef = useRef<number>(-1)

  const getActiveRef = useCallback(() =>
    activeBufferRef.current === "A" ? videoARef : videoBRef
  , [])
  const getInactiveRef = useCallback(() =>
    activeBufferRef.current === "A" ? videoBRef : videoARef
  , [])
  const getActiveUrl = useCallback(() =>
    activeBufferRef.current === "A" ? bufferUrlA : bufferUrlB
  , [])
  const getInactiveUrl = useCallback(() =>
    activeBufferRef.current === "A" ? bufferUrlB : bufferUrlA
  , [])

  // Load a URL into a video element (only if not already loaded)
  const loadIntoBuffer = useCallback((
    ref: React.RefObject<HTMLVideoElement | null>,
    urlRef: React.MutableRefObject<string | null>,
    url: string,
    autoplay: boolean
  ) => {
    if (!ref.current) return
    if (urlRef.current === url) {
      // Already loaded — just play if needed
      if (autoplay) ref.current.play().catch(() => {})
      return
    }
    urlRef.current = url
    ref.current.src = url
    if (autoplay) {
      ref.current.load()
      ref.current.play().catch(() => {})
    } else {
      ref.current.preload = "auto"
      ref.current.load()
    }
  }, [])

  // When currentIdx changes (user clicked a segment or sequential advance)
  useEffect(() => {
    if (currentIdx < 0 || currentIdx >= segments.length) return
    const seg = segments[currentIdx]
    if (!seg?.videoUrl) return

    // If this is the preloaded segment in the inactive buffer, swap
    if (preloadedIdx.current === currentIdx && prevIdxRef.current !== currentIdx) {
      const nextBuf = activeBufferRef.current === "A" ? "B" : "A"
      activeBufferRef.current = nextBuf
      setActiveBuffer(nextBuf)
      const ref = nextBuf === "A" ? videoARef : videoBRef
      if (isPlaying) ref.current?.play().catch(() => {})
    } else {
      // Load into active buffer directly
      loadIntoBuffer(getActiveRef(), getActiveUrl(), seg.videoUrl, isPlaying)
    }

    prevIdxRef.current = currentIdx

    // Preload next segment into inactive buffer
    const nextIdx = currentIdx + 1
    if (nextIdx < segments.length && segments[nextIdx]?.videoUrl) {
      preloadedIdx.current = nextIdx
      loadIntoBuffer(getInactiveRef(), getInactiveUrl(), segments[nextIdx].videoUrl!, false)
    } else {
      preloadedIdx.current = -1
    }
  }, [currentIdx, segments, isPlaying, loadIntoBuffer, getActiveRef, getInactiveRef, getActiveUrl, getInactiveUrl])

  // Sync video volume to both buffers
  useEffect(() => {
    if (videoARef.current) videoARef.current.volume = videoVolume
    if (videoBRef.current) videoBRef.current.volume = videoVolume
  }, [videoVolume])

  // Handle ended event on active video → seamless swap
  const handleVideoEnded = useCallback(() => {
    const nextIdx = currentIdx + 1
    if (nextIdx >= segments.length) {
      onEnded()
      return
    }
    // Advance to next segment — the useEffect above will handle the swap
    onSegmentChange(nextIdx)
  }, [currentIdx, segments.length, onEnded, onSegmentChange])

  // Time update forwarding
  const handleTimeUpdate = useCallback(() => {
    const ref = activeBufferRef.current === "A" ? videoARef : videoBRef
    if (ref.current) {
      onTimeUpdate(ref.current.currentTime, ref.current.duration || 0)
    }
  }, [onTimeUpdate])

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoARef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          zIndex: activeBuffer === "A" ? 2 : 1,
          opacity: activeBuffer === "A" ? 1 : 0,
          pointerEvents: activeBuffer === "A" ? "auto" : "none",
        }}
        controls={activeBuffer === "A"}
        playsInline
        onEnded={activeBuffer === "A" ? handleVideoEnded : undefined}
        onTimeUpdate={activeBuffer === "A" ? handleTimeUpdate : undefined}
      />
      <video
        ref={videoBRef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          zIndex: activeBuffer === "B" ? 2 : 1,
          opacity: activeBuffer === "B" ? 1 : 0,
          pointerEvents: activeBuffer === "B" ? "auto" : "none",
        }}
        controls={activeBuffer === "B"}
        playsInline
        onEnded={activeBuffer === "B" ? handleVideoEnded : undefined}
        onTimeUpdate={activeBuffer === "B" ? handleTimeUpdate : undefined}
      />
    </div>
  )
}

// ── Global Timeline Bar ──────────────────────────────────
// Shows all segments as blocks, with current position indicator
function TimelineBar({
  segments,
  currentIdx,
  currentTime,
  onSeek,
}: {
  segments: VideoSegment[]
  currentIdx: number
  currentTime: number
  onSeek: (segIdx: number) => void
}) {
  const totalDuration = segments.reduce((a, s) => a + s.durationSec, 0)
  if (totalDuration === 0) return null

  // Cumulative offsets
  let elapsed = 0
  for (let i = 0; i < currentIdx; i++) elapsed += segments[i].durationSec
  const globalPosition = elapsed + currentTime
  const progressPct = (globalPosition / totalDuration) * 100

  return (
    <div className="relative w-full h-6 flex-shrink-0" style={{ background: "#1E1E2E" }}>
      {/* Segment blocks */}
      <div className="absolute inset-0 flex">
        {segments.map((seg, i) => {
          const widthPct = (seg.durationSec / totalDuration) * 100
          const isCurrent = i === currentIdx
          const isPast = i < currentIdx
          return (
            <div
              key={seg.id}
              className="h-full relative cursor-pointer transition-colors group"
              style={{
                width: `${widthPct}%`,
                background: isCurrent ? "rgba(79,70,229,0.4)" : isPast ? "rgba(79,70,229,0.2)" : "transparent",
                borderRight: i < segments.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
              }}
              onClick={() => onSeek(i)}
              title={`#${seg.segmentIndex + 1} · SC${String(seg.sceneNum).padStart(2, "0")} · ${seg.durationSec}s`}
            >
              {/* Scene change indicator */}
              {i > 0 && seg.sceneNum !== segments[i - 1].sceneNum && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: "#F59E0B" }} />
              )}
              {/* Segment number - show for segments wide enough */}
              {widthPct > 4 && (
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono opacity-40 group-hover:opacity-80"
                  style={{ color: "#fff" }}>
                  {seg.segmentIndex + 1}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-0.5 transition-all"
        style={{
          left: `${progressPct}%`,
          background: "#A5B4FC",
          boxShadow: "0 0 4px rgba(165,180,252,0.6)",
          zIndex: 5,
        }}
      />
      {/* Progress fill */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{
          width: `${progressPct}%`,
          background: "rgba(79,70,229,0.15)",
          zIndex: 1,
        }}
      />
    </div>
  )
}

// ── Main Component ───────────────────────────────────────
// ── Audio Track Sync Hook ─────────────────────────────────
// Manages a background <audio> element that plays in sync with video segments.
// When playing all segments, the audio starts and seeks to match the global
// timeline position. Users can upload BGM / voiceover to overlay on silent video.
function useAudioTrack(scriptId: string, episodeNum: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioName, setAudioName] = useState<string>("")
  const [audioVolume, setAudioVolume] = useState(0.5)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch saved audio track on mount / episode change
  useEffect(() => {
    let cancelled = false
    fetch(`/api/editing/audio-track?scriptId=${scriptId}&episodeNum=${episodeNum}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.track) {
          setAudioUrl(data.track.url)
          setAudioName(data.track.name)
        } else {
          setAudioUrl(null)
          setAudioName("")
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [scriptId, episodeNum])

  // Create / update audio element
  useEffect(() => {
    if (!audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      return
    }
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.loop = true
    }
    audioRef.current.src = audioUrl
    audioRef.current.volume = audioVolume
    audioRef.current.load()
  }, [audioUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = audioVolume
  }, [audioVolume])

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {})
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const seekTo = useCallback((sec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sec
    }
  }, [])

  // Upload handler
  const uploadAudio = useCallback(async (file: File) => {
    setIsLoading(true)
    try {
      // Upload to R2
      const formData = new FormData()
      formData.append("file", file)
      formData.append("bucket", "audio-tracks")
      const uploadRes = await fetch("/api/upload/media", { method: "POST", body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed")

      // Save reference
      await fetch("/api/editing/audio-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId,
          episodeNum,
          audioUrl: uploadData.url,
          audioName: file.name,
        }),
      })

      setAudioUrl(uploadData.url)
      setAudioName(file.name)
    } catch (err) {
      console.error("Audio upload failed:", err)
      alert("Audio upload failed")
    } finally {
      setIsLoading(false)
    }
  }, [scriptId, episodeNum])

  // Remove handler
  const removeAudio = useCallback(async () => {
    try {
      await fetch("/api/editing/audio-track", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId, episodeNum }),
      })
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setAudioUrl(null)
      setAudioName("")
    } catch (err) {
      console.error("Audio remove failed:", err)
    }
  }, [scriptId, episodeNum])

  return {
    audioUrl,
    audioName,
    audioVolume,
    setAudioVolume,
    isLoading,
    play,
    pause,
    seekTo,
    uploadAudio,
    removeAudio,
  }
}

export function EditingWorkspace({ script }: { script: Script }) {
  const episodes = [...new Set(script.scenes.map(s => s.episodeNum))].sort((a, b) => a - b)
  if (episodes.length === 0) for (let i = 1; i <= script.targetEpisodes; i++) episodes.push(i)

  const abbrev = getTitleAbbrev(script.title)
  const [selectedEp, setSelectedEp] = useState(episodes[0] ?? 1)
  const [playingSegId, setPlayingSegId] = useState<string | null>(null)
  const [isSequentialPlay, setIsSequentialPlay] = useState(false)
  const [currentSegTime, setCurrentSegTime] = useState(0)

  // Audio controls
  const audio = useAudioTrack(script.id, selectedEp)
  const audioFileRef = useRef<HTMLInputElement>(null)
  const [videoVolume, setVideoVolume] = useState(0.8) // video audio: dialogue + SFX

  const epSegments = script.videoSegments
    .filter(s => s.episodeNum === selectedEp)
    .sort((a, b) => a.segmentIndex - b.segmentIndex)

  const doneSegs = useMemo(
    () => epSegments.filter(s => s.status === "done" && s.videoUrl),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedEp, script.videoSegments]
  )
  const failedSegs = epSegments.filter(s => s.status === "failed")
  const activeSegs = epSegments.filter(s => ["submitted", "generating", "reserved"].includes(s.status))
  const totalDuration = doneSegs.reduce((a, s) => a + s.durationSec, 0)
  const estTotalDuration = epSegments.reduce((a, s) => a + s.durationSec, 0)
  const playingSeg = epSegments.find(s => s.id === playingSegId) ?? null

  // Current playing index within doneSegs
  const currentDoneIdx = useMemo(
    () => doneSegs.findIndex(s => s.id === playingSegId),
    [doneSegs, playingSegId]
  )

  const epStr = String(selectedEp).padStart(2, "0")
  const projectCode = `${abbrev}-S${epStr}`

  // Sequential playback ended (last segment finished)
  const handleSequenceEnded = useCallback(() => {
    setIsSequentialPlay(false)
    audio.pause()
  }, [audio])

  // Segment change from seamless player
  const handleSegmentChange = useCallback((newDoneIdx: number) => {
    if (newDoneIdx >= 0 && newDoneIdx < doneSegs.length) {
      setPlayingSegId(doneSegs[newDoneIdx].id)
    }
  }, [doneSegs])

  // Time update from player — also sync audio position
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentSegTime(time)
  }, [])

  // Play all from start — sync audio
  function handlePlayAll() {
    if (doneSegs.length === 0) return
    setPlayingSegId(doneSegs[0].id)
    setIsSequentialPlay(true)
    // Start audio from beginning
    if (audio.audioUrl) {
      audio.seekTo(0)
      audio.play()
    }
  }

  // Click on a segment in the list — seek audio to matching position
  function handleSegmentClick(seg: VideoSegment) {
    setPlayingSegId(seg.id)
    setIsSequentialPlay(false)
    setCurrentSegTime(0)
    // Seek audio to the cumulative position of this segment
    if (audio.audioUrl) {
      const segIdx = doneSegs.findIndex(s => s.id === seg.id)
      if (segIdx >= 0) {
        let elapsed = 0
        for (let i = 0; i < segIdx; i++) elapsed += doneSegs[i].durationSec
        audio.seekTo(elapsed)
      }
    }
  }

  // Timeline seek — sync audio
  function handleTimelineSeek(segIdx: number) {
    if (segIdx >= 0 && segIdx < doneSegs.length) {
      setPlayingSegId(doneSegs[segIdx].id)
      setCurrentSegTime(0)
      // Seek audio to matching position
      if (audio.audioUrl) {
        let elapsed = 0
        for (let i = 0; i < segIdx; i++) elapsed += doneSegs[i].durationSec
        audio.seekTo(elapsed)
      }
    }
  }

  // Download a single clip
  function downloadClip(seg: VideoSegment) {
    if (!seg.videoUrl) return
    const fn = getFilename(abbrev, selectedEp, seg.sceneNum, seg.segmentIndex)
    const a = document.createElement("a")
    a.href = seg.videoUrl
    a.download = fn
    a.target = "_blank"
    a.click()
  }

  // Download all done clips
  function handleDownloadAll() {
    for (const seg of doneSegs) {
      downloadClip(seg)
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: "#F5F5F5" }}>

      {/* ── Header Bar ── */}
      <div className="flex items-center gap-4 px-5 py-3 flex-shrink-0" style={{ background: "#1A1A2E", borderBottom: "2px solid #0F0F1E" }}>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: doneSegs.length === epSegments.length && epSegments.length > 0 ? "#10B981" : "#F59E0B" }} />
            <div>
              <h1 className="text-[13px] font-bold" style={{ color: "#fff" }}>{script.title}</h1>
              <p className="text-[10px] font-mono" style={{ color: "#6366F1" }}>{projectCode}</p>
            </div>
          </div>
        </div>

        {/* Episode tabs */}
        <div className="flex items-center gap-1">
          {episodes.map(ep => (
            <button
              key={ep}
              onClick={() => { setSelectedEp(ep); setPlayingSegId(null); setIsSequentialPlay(false) }}
              className="px-3 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                background: ep === selectedEp ? "#4F46E5" : "#2D2D4E",
                color: ep === selectedEp ? "#fff" : "#888",
              }}
            >
              EP{String(ep).padStart(2, "0")}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 ml-4">
          <div className="text-right">
            <p className="text-[10px]" style={{ color: "#666" }}>Clips</p>
            <p className="text-[12px] font-bold font-mono" style={{ color: doneSegs.length === epSegments.length ? "#10B981" : "#F59E0B" }}>
              {doneSegs.length}/{epSegments.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: "#666" }}>Duration</p>
            <p className="text-[12px] font-bold font-mono" style={{ color: "#A5B4FC" }}>
              {formatDuration(totalDuration)}{estTotalDuration !== totalDuration && <span style={{ color: "#555" }}> / {formatDuration(estTotalDuration)}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex min-h-0">

        {/* Left: Video Preview */}
        <div className="flex flex-col" style={{ width: 400, borderRight: "1px solid #D8D8D8" }}>
          {/* Video player — dual-buffer seamless playback */}
          <div className="flex-shrink-0 relative" style={{ background: "#000", aspectRatio: "9/16", maxHeight: "55vh" }}>
            {currentDoneIdx >= 0 && doneSegs.length > 0 ? (
              <SeamlessPlayer
                segments={doneSegs}
                currentIdx={currentDoneIdx}
                isPlaying={true}
                videoVolume={videoVolume}
                onSegmentChange={handleSegmentChange}
                onEnded={handleSequenceEnded}
                onTimeUpdate={handleTimeUpdate}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center" style={{ color: "#444" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-40">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <p className="text-[11px]">{doneSegs.length > 0 ? "Click a clip to preview" : "No clips generated yet"}</p>
              </div>
            )}
            {/* Clip info overlay */}
            {playingSeg && (
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none" style={{ zIndex: 10 }}>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)", color: "#A5B4FC" }}>
                  #{playingSeg.segmentIndex + 1} · SC{String(playingSeg.sceneNum).padStart(2, "0")} · {playingSeg.durationSec}s
                </span>
                {isSequentialPlay && (
                  <span className="text-[9px] px-2 py-0.5 rounded animate-pulse" style={{ background: "rgba(79,70,229,0.8)", color: "#fff" }}>
                    ▶ Sequential
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Global timeline bar */}
          {doneSegs.length > 1 && (
            <TimelineBar
              segments={doneSegs}
              currentIdx={currentDoneIdx >= 0 ? currentDoneIdx : 0}
              currentTime={currentSegTime}
              onSeek={handleTimelineSeek}
            />
          )}

          {/* Audio Mixer Panel */}
          <div className="px-3 py-1.5 flex items-center gap-3 flex-shrink-0" style={{ background: "#1E1E2E", borderBottom: "1px solid #333" }}>
            {/* Video audio volume (dialogue + SFX from Seedance) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-semibold uppercase tracking-wider w-8" style={{ color: "#888" }}>
                VOX
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={videoVolume}
                onChange={e => setVideoVolume(Number(e.target.value))}
                className="w-14 h-1 accent-emerald-500"
                title={`Dialogue/SFX: ${Math.round(videoVolume * 100)}%`}
              />
              <span className="text-[8px] font-mono w-6" style={{ color: "#666" }}>
                {Math.round(videoVolume * 100)}%
              </span>
            </div>

            <div className="w-px h-4" style={{ background: "#333" }} />

            {/* BGM overlay track */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-semibold uppercase tracking-wider w-8" style={{ color: "#888" }}>
                BGM
              </span>
              {audio.audioUrl ? (
                <>
                  <span className="text-[9px] truncate max-w-[80px]" style={{ color: "#A5B4FC" }} title={audio.audioName}>
                    {audio.audioName}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audio.audioVolume}
                    onChange={e => audio.setAudioVolume(Number(e.target.value))}
                    className="w-14 h-1 accent-indigo-500"
                    title={`BGM: ${Math.round(audio.audioVolume * 100)}%`}
                  />
                  <span className="text-[8px] font-mono w-6" style={{ color: "#666" }}>
                    {Math.round(audio.audioVolume * 100)}%
                  </span>
                  <button
                    onClick={audio.removeAudio}
                    className="text-[9px] px-1 py-0.5 rounded hover:opacity-80"
                    style={{ background: "#3A2020", color: "#F87171" }}
                    title="Remove BGM"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={audioFileRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) audio.uploadAudio(file)
                      e.target.value = ""
                    }}
                  />
                  <button
                    onClick={() => audioFileRef.current?.click()}
                    disabled={audio.isLoading}
                    className="text-[9px] px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                    style={{ background: "#2D2D4E", color: "#A5B4FC" }}
                  >
                    {audio.isLoading ? "..." : "+ BGM"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Playback controls */}
          <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0" style={{ background: "#EBEBEB", borderBottom: "1px solid #D0D0D0" }}>
            <button
              onClick={handlePlayAll}
              disabled={doneSegs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Play All
            </button>
            {/* Prev / Next segment */}
            {currentDoneIdx >= 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSegmentChange(currentDoneIdx - 1)}
                  disabled={currentDoneIdx <= 0}
                  className="text-[10px] px-1.5 py-1 rounded disabled:opacity-30"
                  style={{ background: "#E0E0E0", color: "#555" }}
                  title="Previous segment"
                >◀</button>
                <span className="text-[10px] font-mono px-1" style={{ color: "#888" }}>
                  {currentDoneIdx + 1}/{doneSegs.length}
                </span>
                <button
                  onClick={() => handleSegmentChange(currentDoneIdx + 1)}
                  disabled={currentDoneIdx >= doneSegs.length - 1}
                  className="text-[10px] px-1.5 py-1 rounded disabled:opacity-30"
                  style={{ background: "#E0E0E0", color: "#555" }}
                  title="Next segment"
                >▶</button>
              </div>
            )}
            {isSequentialPlay && (
              <button
                onClick={() => { setIsSequentialPlay(false); audio.pause() }}
                className="text-[10px] px-2 py-1 rounded"
                style={{ background: "#E8E8E8", color: "#666" }}
              >
                Stop Sequence
              </button>
            )}
            <div className="flex-1" />
            {playingSeg && (
              <span className="text-[10px] font-mono" style={{ color: "#888" }}>
                {getFilename(abbrev, selectedEp, playingSeg.sceneNum, playingSeg.segmentIndex)}
              </span>
            )}
          </div>

          {/* Clip info when selected */}
          {playingSeg && (
            <div className="p-3 overflow-y-auto dev-scrollbar flex-1" style={{ background: "#F0F0F0" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Prompt</p>
              <p className="text-[11px] leading-relaxed" style={{ color: "#555" }}>{playingSeg.prompt}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
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
              </div>
            </div>
          )}
          {!playingSeg && <div className="flex-1" style={{ background: "#F0F0F0" }} />}
        </div>

        {/* Right: Clip List + Actions */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Action Bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ background: "#EBEBEB", borderBottom: "1px solid #D0D0D0" }}>
            {/* Download All */}
            <button
              onClick={handleDownloadAll}
              disabled={doneSegs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
              style={{ background: "#065F46", color: "#D1FAE5" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download All ({doneSegs.length})
            </button>

            {/* Export EDL */}
            <button
              onClick={() => downloadTextFile(
                `${projectCode}.edl`,
                buildEDL(script.title, selectedEp, abbrev, epSegments)
              )}
              disabled={doneSegs.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
              style={{ background: "#1E3A5F", color: "#93C5FD" }}
            >
              ↓ EDL
            </button>

            {/* Export CSV */}
            <button
              onClick={() => downloadTextFile(
                `${projectCode}-manifest.csv`,
                buildCSV(script.title, selectedEp, abbrev, epSegments)
              )}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-medium transition-colors"
              style={{ background: "#3A2E1E", color: "#FCD34D" }}
            >
              ↓ CSV
            </button>

            <div className="flex-1" />

            {/* Status summary */}
            {activeSegs.length > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded animate-pulse"
                style={{ background: "#EDE9FE", color: "#6D28D9" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#6D28D9" }} />
                {activeSegs.length} generating
              </span>
            )}
            {failedSegs.length > 0 && (
              <span className="text-[10px] px-2 py-1 rounded"
                style={{ background: "#FEE2E2", color: "#991B1B" }}>
                {failedSegs.length} failed
              </span>
            )}
          </div>

          {/* Clip List Table */}
          <div className="flex-1 overflow-y-auto dev-scrollbar">
            {epSegments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: "#CCC" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-30">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <line x1="9" x2="9" y1="3" y2="21" />
                </svg>
                <p className="text-[12px]">No segments for Episode {selectedEp}</p>
                <p className="text-[11px] mt-1" style={{ color: "#DDD" }}>Generate segments in Theater first</p>
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: "#F0F0F0", borderBottom: "1px solid #D8D8D8" }}>
                    <th className="text-left px-3 py-2 font-semibold w-10" style={{ color: "#AAA" }}>#</th>
                    <th className="text-left px-2 py-2 font-semibold w-14" style={{ color: "#AAA" }}>Preview</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: "#AAA" }}>Filename</th>
                    <th className="text-left px-3 py-2 font-semibold w-16" style={{ color: "#AAA" }}>Scene</th>
                    <th className="text-left px-3 py-2 font-semibold w-14 text-right" style={{ color: "#AAA" }}>Dur</th>
                    <th className="text-left px-3 py-2 font-semibold w-20" style={{ color: "#AAA" }}>Shot</th>
                    <th className="text-left px-3 py-2 font-semibold w-20" style={{ color: "#AAA" }}>Status</th>
                    <th className="text-center px-3 py-2 font-semibold w-16" style={{ color: "#AAA" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {epSegments.map((seg, i) => {
                    const st = STATUS_MAP[seg.status] || STATUS_MAP.pending
                    const fn = getFilename(abbrev, selectedEp, seg.sceneNum, seg.segmentIndex)
                    const isPlaying = seg.id === playingSegId
                    const isDone = seg.status === "done"
                    const scene = script.scenes.find(s => s.episodeNum === selectedEp && s.sceneNum === seg.sceneNum)
                    return (
                      <tr
                        key={seg.id}
                        onClick={() => { if (isDone) handleSegmentClick(seg) }}
                        className={`transition-colors ${isDone ? "cursor-pointer hover:bg-indigo-50" : ""}`}
                        style={{
                          background: isPlaying ? "#EEF2FF" : i % 2 === 0 ? "#FAFAFA" : "#fff",
                          borderBottom: "1px solid #F0F0F0",
                          borderLeft: isPlaying ? "3px solid #4F46E5" : "3px solid transparent",
                        }}
                      >
                        {/* # */}
                        <td className="px-3 py-2.5 font-mono" style={{ color: isPlaying ? "#4F46E5" : "#CCC" }}>
                          {seg.segmentIndex + 1}
                        </td>
                        {/* Thumbnail */}
                        <td className="px-2 py-1.5">
                          <div className="w-10 h-6 rounded overflow-hidden flex-shrink-0" style={{ background: "#E8E8E8" }}>
                            {seg.thumbnailUrl ? (
                              <img src={seg.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-[8px]" style={{ color: "#CCC" }}>{st.icon}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        {/* Filename */}
                        <td className="px-3 py-2.5">
                          <p className="font-mono text-[10px] truncate" style={{ color: isDone ? "#1A1A1A" : "#AAA" }}>
                            {fn}
                          </p>
                          <p className="text-[9px] truncate mt-0.5" style={{ color: "#CCC" }}>
                            {seg.prompt.slice(0, 50)}
                          </p>
                        </td>
                        {/* Scene */}
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-[10px]" style={{ color: "#666" }}>
                            SC{String(seg.sceneNum).padStart(2, "0")}
                          </span>
                          {scene?.heading && (
                            <p className="text-[8px] truncate max-w-[80px]" style={{ color: "#CCC" }}>
                              {scene.heading.slice(0, 20)}
                            </p>
                          )}
                        </td>
                        {/* Duration */}
                        <td className="px-3 py-2.5 text-right font-mono" style={{ color: "#666" }}>
                          {seg.durationSec}s
                        </td>
                        {/* Shot type */}
                        <td className="px-3 py-2.5">
                          <span className="text-[10px]" style={{ color: "#888" }}>
                            {seg.shotType || "—"}
                          </span>
                        </td>
                        {/* Status */}
                        <td className="px-3 py-2.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1"
                            style={{ background: st.bg, color: st.color }}>
                            {st.icon} {st.label}
                          </span>
                        </td>
                        {/* Action */}
                        <td className="px-3 py-2.5 text-center">
                          {isDone && seg.videoUrl ? (
                            <button
                              onClick={e => { e.stopPropagation(); downloadClip(seg) }}
                              className="text-[10px] px-2 py-0.5 rounded font-medium"
                              style={{ background: "#D1FAE5", color: "#065F46" }}
                              title="Download clip"
                            >↓</button>
                          ) : (
                            <span className="text-[10px]" style={{ color: "#DDD" }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Summary */}
          <div className="flex items-center gap-4 px-4 py-2 flex-shrink-0" style={{ background: "#EBEBEB", borderTop: "1px solid #D0D0D0" }}>
            <div className="flex items-center gap-4 text-[10px]">
              <span style={{ color: "#065F46" }}>✓ {doneSegs.length} ready</span>
              {activeSegs.length > 0 && <span style={{ color: "#6D28D9" }}>◉ {activeSegs.length} active</span>}
              {failedSegs.length > 0 && <span style={{ color: "#991B1B" }}>✕ {failedSegs.length} failed</span>}
              {epSegments.filter(s => s.status === "pending").length > 0 && (
                <span style={{ color: "#6B7280" }}>○ {epSegments.filter(s => s.status === "pending").length} pending</span>
              )}
            </div>
            <div className="flex-1" />
            <span className="text-[10px] font-mono" style={{ color: "#888" }}>
              {projectCode} · {formatDuration(totalDuration)} ready / {formatDuration(estTotalDuration)} total
            </span>

            {/* Folder structure hint */}
            <div className="relative group">
              <button className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#E8E8E8", color: "#888" }}>
                📁 Structure
              </button>
              <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-20">
                <pre className="text-[9px] font-mono leading-4 p-3 rounded-lg shadow-lg whitespace-pre"
                  style={{ background: "#1A1A1A", color: "#888", border: "1px solid #333", minWidth: 220 }}>
{`${abbrev}-S${epStr}/
  EP${epStr}/
    VIDEO/       ${doneSegs.length} clips
    PENDING/     ${epSegments.length - doneSegs.length} clips
    AUDIO/       (audio exports)
    GRAPHICS/    (titles, VFX)
    DOCUMENTS/   EDL, manifest
  ASSETS/
    CHARACTERS/  reference images
    LOCATIONS/   location stills
    PROPS/       prop references`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
