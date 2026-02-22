"use client"

import { useState, useRef, useEffect, useCallback } from "react"

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
  // Generate abbreviation: first letters of each word, max 6 chars, uppercase
  const words = title.trim().split(/\s+/)
  if (words.length === 1) {
    // Single word: use up to 4 uppercase chars
    return words[0].replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "").slice(0, 4).toUpperCase()
  }
  // Multi-word: initials of each word
  return words.map(w => w[0] || "").join("").toUpperCase().slice(0, 6)
}

interface PackageManifestItem {
  filename: string
  folder: string
  segmentIndex: number
  sceneNum: number
  durationSec: number
  resolution: string
  shotType: string
  status: string
  videoUrl: string | null
  prompt: string
}

interface PackageManifest {
  projectTitle: string
  abbrev: string
  episode: number
  generatedAt: string
  totalDuration: number
  totalClips: number
  doneClips: number
  folderStructure: string[]
  clips: PackageManifestItem[]
  edlLines: string[]
}

function buildManifest(script: Script, episodeNum: number): PackageManifest {
  const abbrev = getTitleAbbrev(script.title)
  const epStr = String(episodeNum).padStart(2, "0")
  const segments = script.videoSegments
    .filter(s => s.episodeNum === episodeNum)
    .sort((a, b) => a.segmentIndex - b.segmentIndex)

  const doneSegs = segments.filter(s => s.status === "done")
  const totalDuration = doneSegs.reduce((a, s) => a + s.durationSec, 0)

  const clips: PackageManifestItem[] = segments.map(seg => {
    const sceneStr = String(seg.sceneNum).padStart(3, "0")
    const segStr = String(seg.segmentIndex + 1).padStart(3, "0")
    // Naming: ABBREV-S01-SC001-SEG001.mp4
    const filename = `${abbrev}-S${epStr}-SC${sceneStr}-SEG${segStr}.mp4`
    const folder = seg.status === "done" ? `EP${epStr}/VIDEO` : `EP${epStr}/PENDING`
    return {
      filename,
      folder,
      segmentIndex: seg.segmentIndex,
      sceneNum: seg.sceneNum,
      durationSec: seg.durationSec,
      resolution: seg.resolution || "1920x1080",
      shotType: seg.shotType || "—",
      status: seg.status,
      videoUrl: seg.videoUrl || null,
      prompt: seg.prompt.slice(0, 80),
    }
  })

  // Generate basic EDL (Edit Decision List) for done segments
  const edlLines: string[] = [
    `TITLE: ${script.title} - Episode ${episodeNum}`,
    `FCM: NON-DROP FRAME`,
    ``,
  ]
  let editNum = 1
  let timelinePos = 0
  for (const seg of doneSegs) {
    const clip = clips.find(c => c.segmentIndex === seg.segmentIndex)
    if (!clip) continue
    const inTC = formatEDLTime(0)
    const outTC = formatEDLTime(seg.durationSec)
    const recIn = formatEDLTime(timelinePos)
    const recOut = formatEDLTime(timelinePos + seg.durationSec)
    edlLines.push(
      `${String(editNum).padStart(3, "0")}  ${clip.filename.replace(".mp4", "")}  V  C  ${inTC} ${outTC} ${recIn} ${recOut}`,
      `* FROM CLIP NAME: ${clip.filename}`,
      `* SCENE ${String(seg.sceneNum).padStart(3, "0")} | ${seg.durationSec}s | ${seg.shotType || "auto"}`,
      ``
    )
    editNum++
    timelinePos += seg.durationSec
  }

  const folderStructure = [
    `${abbrev}-S${epStr}/`,
    `  EP${epStr}/`,
    `    VIDEO/          — ${doneSegs.length} video clips`,
    `    PENDING/        — ${segments.length - doneSegs.length} clips not yet generated`,
    `    AUDIO/          — (audio exports go here)`,
    `    GRAPHICS/       — (titles, VFX elements)`,
    `    DOCUMENTS/      — EDL, manifest CSV`,
    `  ASSETS/`,
    `    CHARACTERS/     — character reference images`,
    `    LOCATIONS/      — location stills`,
    `    PROPS/          — prop reference images`,
  ]

  return {
    projectTitle: script.title,
    abbrev,
    episode: episodeNum,
    generatedAt: new Date().toISOString(),
    totalDuration,
    totalClips: segments.length,
    doneClips: doneSegs.length,
    folderStructure,
    clips,
    edlLines,
  }
}

function formatEDLTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const f = Math.floor((sec % 1) * 30)
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}:${String(f).padStart(2,"0")}`
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function manifestToCSV(manifest: PackageManifest): string {
  const header = "Filename,Folder,Scene,Segment,Duration(s),Resolution,ShotType,Status,VideoURL,Prompt"
  const rows = manifest.clips.map(c =>
    [c.filename, c.folder, c.sceneNum, c.segmentIndex+1, c.durationSec,
     c.resolution, c.shotType, c.status, c.videoUrl || "", `"${c.prompt.replace(/"/g, "'")}"`].join(",")
  )
  return [header, ...rows].join("\n")
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#F3F4F6", color: "#6B7280" },
  reserved: { bg: "#FEF3C7", color: "#92400E" },
  submitted: { bg: "#DBEAFE", color: "#1D4ED8" },
  generating: { bg: "#EDE9FE", color: "#6D28D9" },
  done: { bg: "#D1FAE5", color: "#065F46" },
  failed: { bg: "#FEE2E2", color: "#991B1B" },
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const fr = Math.floor((sec % 1) * 30)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(fr).padStart(2, "0")}`
}

export function EditingWorkspace({ script }: { script: Script }) {
  const episodes = [...new Set(script.scenes.map(s => s.episodeNum))].sort((a, b) => a - b)
  if (episodes.length === 0) for (let i = 1; i <= script.targetEpisodes; i++) episodes.push(i)

  const [selectedEp, setSelectedEp] = useState(episodes[0] ?? 1)
  const [sourceSegId, setSourceSegId] = useState<string | null>(null)   // Source monitor
  const [programSegId, setProgramSegId] = useState<string | null>(null) // Program monitor (timeline playhead)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playingAll, setPlayingAll] = useState(false)
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0)
  const [zoom, setZoom] = useState(1) // px per second
  const [playheadX, setPlayheadX] = useState(0)
  const timelineRef = useRef<HTMLDivElement>(null)
  const programVideoRef = useRef<HTMLVideoElement>(null)
  const sourceVideoRef = useRef<HTMLVideoElement>(null)
  const [showPackage, setShowPackage] = useState(false)
  const [packageManifest, setPackageManifest] = useState<PackageManifest | null>(null)

  const epSegments = script.videoSegments
    .filter(s => s.episodeNum === selectedEp)
    .sort((a, b) => a.segmentIndex - b.segmentIndex)

  const doneSegments = epSegments.filter(s => s.status === "done" && s.videoUrl)
  const sourceSeg = epSegments.find(s => s.id === sourceSegId) ?? null
  const programSeg = epSegments.find(s => s.id === programSegId) ?? null

  const totalDuration = doneSegments.reduce((a, s) => a + s.durationSec, 0)
  const pxPerSec = Math.max(40, 80 * zoom)

  // Build cumulative offsets
  const segOffsets: Record<string, number> = {}
  let cumulative = 0
  for (const seg of doneSegments) {
    segOffsets[seg.id] = cumulative
    cumulative += seg.durationSec
  }

  // Playhead position → current segment
  const getSegAtTime = useCallback((t: number) => {
    for (const seg of doneSegments) {
      const start = segOffsets[seg.id] ?? 0
      if (t >= start && t < start + seg.durationSec) return seg
    }
    return doneSegments[doneSegments.length - 1] ?? null
  }, [doneSegments, segOffsets])

  // Tick program monitor time
  useEffect(() => {
    if (!isPlaying) return
    const iv = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 0.1
        if (next >= totalDuration) { setIsPlaying(false); return totalDuration }
        setPlayheadX(next * pxPerSec)
        const seg = getSegAtTime(next)
        if (seg && seg.id !== programSegId) setProgramSegId(seg.id)
        return next
      })
    }, 100)
    return () => clearInterval(iv)
  }, [isPlaying, totalDuration, pxPerSec, programSegId, getSegAtTime])

  function handlePlayPause() {
    if (currentTime >= totalDuration) { setCurrentTime(0); setPlayheadX(0) }
    setIsPlaying(p => !p)
    if (!programSegId && doneSegments.length > 0) setProgramSegId(doneSegments[0].id)
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const t = Math.max(0, Math.min(x / pxPerSec, totalDuration))
    setCurrentTime(t)
    setPlayheadX(x)
    const seg = getSegAtTime(t)
    if (seg) setProgramSegId(seg.id)
  }

  function handleSegClickSource(seg: VideoSegment) {
    setSourceSegId(seg.id === sourceSegId ? null : seg.id)
  }

  function handleInsertToTimeline(seg: VideoSegment) {
    // Already in doneSegments list; just jump program monitor to it
    if (segOffsets[seg.id] !== undefined) {
      const t = segOffsets[seg.id]
      setCurrentTime(t)
      setPlayheadX(t * pxPerSec)
      setProgramSegId(seg.id)
    }
  }

  return (
    <div className="h-full flex flex-col relative" style={{ background: "#1E1E1E" }}>

      {/* ── TOP: Dual Monitors ─────────────────────────────── */}
      <div className="flex flex-shrink-0" style={{ height: "42%", borderBottom: "2px solid #111" }}>

        {/* Episode Sidebar */}
        <div className="w-44 flex flex-col flex-shrink-0" style={{ background: "#252525", borderRight: "1px solid #333" }}>
          <div className="px-3 py-2" style={{ borderBottom: "1px solid #333" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>Episodes</span>
          </div>
          <div className="flex-1 overflow-y-auto dev-scrollbar py-1">
            {episodes.map(ep => {
              const segs = script.videoSegments.filter(s => s.episodeNum === ep)
              const done = segs.filter(s => s.status === "done").length
              const pct = segs.length > 0 ? Math.round((done / segs.length) * 100) : 0
              const isActive = ep === selectedEp
              return (
                <button
                  key={ep}
                  onClick={() => { setSelectedEp(ep); setSourceSegId(null); setProgramSegId(null); setCurrentTime(0); setPlayheadX(0); setIsPlaying(false) }}
                  className="w-full text-left px-3 py-2 transition-colors"
                  style={{
                    background: isActive ? "#2D3250" : "transparent",
                    borderLeft: isActive ? "2px solid #4F46E5" : "2px solid transparent",
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium" style={{ color: isActive ? "#E0E0FF" : "#888" }}>Ep {ep}</span>
                    <span className="text-[9px]" style={{ color: "#555" }}>{pct}%</span>
                  </div>
                  <div className="h-0.5 rounded-full" style={{ background: "#333" }}>
                    <div className="h-0.5 rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "#10B981" : "#4F46E5" }} />
                  </div>
                  <p className="text-[9px] mt-0.5" style={{ color: "#555" }}>{done}/{segs.length}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Source Monitor */}
        <div className="flex-1 flex flex-col" style={{ borderRight: "1px solid #333" }}>
          <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: "#252525", borderBottom: "1px solid #333" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>Source</span>
            {sourceSeg && (
              <>
                <span className="text-[10px]" style={{ color: "#555" }}>·</span>
                <span className="text-[10px]" style={{ color: "#888" }}>Seg #{sourceSeg.segmentIndex + 1} · {sourceSeg.durationSec}s</span>
                <div className="flex-1" />
                <button
                  onClick={() => sourceSeg && handleInsertToTimeline(sourceSeg)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: "#4F46E5", color: "#fff" }}
                >
                  → Timeline
                </button>
              </>
            )}
          </div>
          <div className="flex-1 relative flex items-center justify-center" style={{ background: "#0A0A0A" }}>
            {sourceSeg?.videoUrl ? (
              <video
                ref={sourceVideoRef}
                key={sourceSeg.id}
                src={sourceSeg.videoUrl}
                controls
                className="max-w-full max-h-full"
                style={{ display: "block" }}
              />
            ) : sourceSeg?.thumbnailUrl ? (
              <img src={sourceSeg.thumbnailUrl} className="max-w-full max-h-full object-contain" alt="" />
            ) : (
              <div className="flex flex-col items-center" style={{ color: "#333" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 3v18" />
                </svg>
                <p className="text-[11px]">Click a segment below</p>
              </div>
            )}
            {/* Timecode overlay */}
            <div className="absolute bottom-2 left-2 font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)", color: "#0F0" }}>
              {formatTime(sourceSeg ? 0 : 0)}
            </div>
          </div>
        </div>

        {/* Program Monitor */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: "#252525", borderBottom: "1px solid #333" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>Program</span>
            {programSeg && (
              <>
                <span className="text-[10px]" style={{ color: "#555" }}>·</span>
                <span className="text-[10px]" style={{ color: "#888" }}>
                  Ep {selectedEp} · {doneSegments.length} clips · {totalDuration}s
                </span>
              </>
            )}
          </div>
          <div className="flex-1 relative flex items-center justify-center" style={{ background: "#0A0A0A" }}>
            {programSeg?.videoUrl ? (
              <video
                ref={programVideoRef}
                key={programSeg.id}
                src={programSeg.videoUrl}
                autoPlay={isPlaying}
                className="max-w-full max-h-full"
                style={{ display: "block" }}
                onEnded={() => {
                  const idx = doneSegments.findIndex(s => s.id === programSeg.id)
                  if (idx < doneSegments.length - 1) {
                    const next = doneSegments[idx + 1]
                    setProgramSegId(next.id)
                    const t = segOffsets[next.id] ?? 0
                    setCurrentTime(t)
                    setPlayheadX(t * pxPerSec)
                  } else {
                    setIsPlaying(false)
                  }
                }}
              />
            ) : doneSegments.length === 0 ? (
              <div className="flex flex-col items-center" style={{ color: "#333" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <p className="text-[11px]">No clips on timeline</p>
                <p className="text-[10px] mt-1" style={{ color: "#444" }}>Generate videos in Theater first</p>
              </div>
            ) : (
              <div className="flex flex-col items-center" style={{ color: "#333" }}>
                <p className="text-[11px]">Press Play or click timeline</p>
              </div>
            )}
            {/* Timecode overlay */}
            <div className="absolute bottom-2 right-2 font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)", color: "#0F0" }}>
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </div>
          </div>
        </div>
      </div>

      {/* ── MIDDLE: Transport Controls ──────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1.5" style={{ background: "#222", borderBottom: "1px solid #111" }}>
        {/* Timecode */}
        <div className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: "#111", color: "#0F0", minWidth: 80, textAlign: "center" }}>
          {formatTime(currentTime)}
        </div>

        {/* Transport */}
        <div className="flex items-center gap-1">
          {/* Go to start */}
          <button
            onClick={() => { setCurrentTime(0); setPlayheadX(0); setIsPlaying(false); if (doneSegments[0]) setProgramSegId(doneSegments[0].id) }}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style={{ background: "#333", color: "#AAA" }}
            title="Go to Start"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
          {/* Step back */}
          <button
            onClick={() => {
              const idx = doneSegments.findIndex(s => s.id === programSegId)
              if (idx > 0) { const s = doneSegments[idx-1]; const t = segOffsets[s.id]??0; setProgramSegId(s.id); setCurrentTime(t); setPlayheadX(t*pxPerSec) }
            }}
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{ background: "#333", color: "#AAA" }}
            title="Previous Clip"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm13 1L9 12l10 5z"/></svg>
          </button>
          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="w-9 h-9 flex items-center justify-center rounded"
            style={{ background: isPlaying ? "#4F46E5" : "#4A4A4A", color: "#fff" }}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </button>
          {/* Step forward */}
          <button
            onClick={() => {
              const idx = doneSegments.findIndex(s => s.id === programSegId)
              if (idx < doneSegments.length - 1) { const s = doneSegments[idx+1]; const t = segOffsets[s.id]??0; setProgramSegId(s.id); setCurrentTime(t); setPlayheadX(t*pxPerSec) }
            }}
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{ background: "#333", color: "#AAA" }}
            title="Next Clip"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5l10 7-10 7V5zm13 1h-2v12h2z"/></svg>
          </button>
          {/* Go to end */}
          <button
            onClick={() => { const t = totalDuration; setCurrentTime(t); setPlayheadX(t*pxPerSec); setIsPlaying(false) }}
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{ background: "#333", color: "#AAA" }}
            title="Go to End"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18V6l8.5 6zm9.5 0V6h2v12z"/></svg>
          </button>
        </div>

        <div className="w-px h-5 mx-1" style={{ background: "#333" }} />

        {/* Zoom */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: "#555" }}>Zoom</span>
          <input
            type="range" min={0.3} max={3} step={0.1}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-20 accent-indigo-500"
          />
          <span className="text-[10px] font-mono" style={{ color: "#555" }}>{zoom.toFixed(1)}x</span>
        </div>

        <div className="flex-1" />

        {/* Episode info */}
        <span className="text-[10px]" style={{ color: "#555" }}>
          Ep {selectedEp} · {doneSegments.length} clips · {totalDuration}s total
        </span>

        <div className="w-px h-5" style={{ background: "#333" }} />

        {/* Package button */}
        <button
          onClick={() => {
            const m = buildManifest(script, selectedEp)
            setPackageManifest(m)
            setShowPackage(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-medium transition-colors"
          style={{ background: "#1E3A2F", color: "#10B981", border: "1px solid #2A5540" }}
          title="Package Episode Assets"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Package Ep {selectedEp}
        </button>
      </div>

      {/* ── BOTTOM: Timeline + Clip Bin ─────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Clip Bin (left) */}
        <div className="w-52 flex flex-col flex-shrink-0" style={{ background: "#252525", borderRight: "1px solid #333" }}>
          <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #333" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>Clip Bin</span>
            <span className="text-[10px]" style={{ color: "#555" }}>{epSegments.length} clips</span>
          </div>
          <div className="flex-1 overflow-y-auto dev-scrollbar">
            {epSegments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: "#444" }}>
                <p className="text-[11px]">No clips</p>
              </div>
            ) : (
              epSegments.map(seg => {
                const ss = STATUS_STYLE[seg.status] || STATUS_STYLE.pending
                const isSource = seg.id === sourceSegId
                return (
                  <div
                    key={seg.id}
                    onClick={() => handleSegClickSource(seg)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors"
                    style={{
                      background: isSource ? "#2D3250" : "transparent",
                      borderBottom: "1px solid #2A2A2A",
                      borderLeft: isSource ? "2px solid #4F46E5" : "2px solid transparent",
                    }}
                  >
                    {/* Thumbnail */}
                    <div className="w-12 h-7 rounded flex-shrink-0 overflow-hidden" style={{ background: "#1A1A1A" }}>
                      {seg.thumbnailUrl ? (
                        <img src={seg.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#444" }}>
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[9px] font-mono" style={{ color: "#666" }}>#{seg.segmentIndex + 1}</span>
                        <span className="text-[9px] px-1 py-0 rounded" style={ss}>{seg.status}</span>
                      </div>
                      <p className="text-[10px] truncate" style={{ color: "#777" }}>{seg.durationSec}s · {seg.prompt.slice(0, 25)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Timeline (right) */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: "#1A1A1A" }}>
          {/* Track Headers + Ruler */}
          <div className="flex-shrink-0" style={{ borderBottom: "1px solid #2A2A2A" }}>
            {/* Ruler */}
            <div className="flex overflow-hidden" style={{ height: 20, background: "#222" }}>
              <div className="w-20 flex-shrink-0" style={{ borderRight: "1px solid #2A2A2A" }} />
              <div className="flex-1 relative overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full"
                  style={{ width: Math.max(totalDuration * pxPerSec + 200, 800) }}
                >
                  {Array.from({ length: Math.ceil(totalDuration) + 10 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 flex flex-col items-center"
                      style={{ left: i * pxPerSec }}
                    >
                      <div className="w-px" style={{ height: i % 5 === 0 ? 12 : 6, background: i % 5 === 0 ? "#555" : "#333" }} />
                      {i % 5 === 0 && (
                        <span className="text-[8px] font-mono" style={{ color: "#555", marginTop: -2, marginLeft: 2 }}>{formatTime(i)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Track rows */}
          <div className="flex-1 overflow-auto dev-scrollbar">
            {/* V1 track */}
            <div className="flex" style={{ minHeight: 56, borderBottom: "1px solid #2A2A2A" }}>
              {/* Track label */}
              <div className="w-20 flex-shrink-0 flex items-center px-2" style={{ background: "#222", borderRight: "1px solid #2A2A2A" }}>
                <div>
                  <p className="text-[10px] font-semibold" style={{ color: "#888" }}>V1</p>
                  <p className="text-[9px]" style={{ color: "#555" }}>Video</p>
                </div>
              </div>
              {/* Track content */}
              <div
                ref={timelineRef}
                className="flex-1 relative cursor-crosshair"
                style={{ background: "#1A1A1A", minWidth: Math.max(totalDuration * pxPerSec + 200, 600) }}
                onClick={handleTimelineClick}
              >
                {/* Clips */}
                {doneSegments.map(seg => {
                  const left = (segOffsets[seg.id] ?? 0) * pxPerSec
                  const width = seg.durationSec * pxPerSec
                  const isProg = seg.id === programSegId
                  return (
                    <div
                      key={seg.id}
                      onClick={e => { e.stopPropagation(); setProgramSegId(seg.id); const t = segOffsets[seg.id]??0; setCurrentTime(t); setPlayheadX(t*pxPerSec) }}
                      className="absolute top-1 rounded overflow-hidden cursor-pointer select-none"
                      style={{
                        left,
                        width: Math.max(width - 2, 4),
                        height: "calc(100% - 8px)",
                        background: isProg ? "#3730A3" : "#2D3250",
                        border: isProg ? "1px solid #6366F1" : "1px solid #3A3A60",
                      }}
                      title={`Seg #${seg.segmentIndex + 1} · ${seg.durationSec}s`}
                    >
                      {seg.thumbnailUrl && (
                        <img src={seg.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover opacity-30" alt="" />
                      )}
                      <div className="relative px-1 pt-0.5">
                        <p className="text-[9px] font-semibold truncate" style={{ color: "#A5B4FC" }}>
                          #{seg.segmentIndex + 1}
                        </p>
                        {width > 60 && (
                          <p className="text-[8px] truncate" style={{ color: "#7C8CCC" }}>{seg.durationSec}s</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: playheadX, zIndex: 10 }}
                >
                  <div className="w-px h-full" style={{ background: "#EF4444" }} />
                  <div className="absolute -top-1 -left-1.5 w-3 h-3"
                    style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid #EF4444" }}
                  />
                </div>

                {/* Empty state */}
                {doneSegments.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ color: "#333" }}>
                    <p className="text-[11px]">No done segments · Generate videos in Theater</p>
                  </div>
                )}
              </div>
            </div>

            {/* A1 track (audio placeholder) */}
            <div className="flex" style={{ minHeight: 32, borderBottom: "1px solid #2A2A2A" }}>
              <div className="w-20 flex-shrink-0 flex items-center px-2" style={{ background: "#222", borderRight: "1px solid #2A2A2A" }}>
                <div>
                  <p className="text-[10px] font-semibold" style={{ color: "#888" }}>A1</p>
                  <p className="text-[9px]" style={{ color: "#555" }}>Audio</p>
                </div>
              </div>
              <div className="flex-1 relative" style={{ background: "#161616", minWidth: Math.max(totalDuration * pxPerSec + 200, 600) }}>
                {doneSegments.map(seg => {
                  const left = (segOffsets[seg.id] ?? 0) * pxPerSec
                  const width = seg.durationSec * pxPerSec
                  return (
                    <div
                      key={seg.id}
                      className="absolute top-1 rounded"
                      style={{
                        left,
                        width: Math.max(width - 2, 4),
                        height: "calc(100% - 8px)",
                        background: "#1C3A2A",
                        border: "1px solid #2A5540",
                      }}
                    >
                      {/* Waveform placeholder */}
                      <div className="w-full h-full flex items-center px-1 gap-px overflow-hidden">
                        {Array.from({ length: Math.floor(width / 4) }, (_, i) => (
                          <div
                            key={i}
                            style={{
                              width: 1,
                              height: `${20 + Math.sin(i * 0.8) * 40}%`,
                              background: "#10B981",
                              opacity: 0.4,
                              flexShrink: 0,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {/* Playhead A1 */}
                <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: playheadX, background: "#EF4444", zIndex: 10 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Package Panel Overlay ──────────────────────────── */}
      {showPackage && packageManifest && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="flex flex-col rounded-xl overflow-hidden" style={{
            width: "min(860px, 92vw)", maxHeight: "85vh",
            background: "#1A1A1A", border: "1px solid #333",
          }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ background: "#222", borderBottom: "1px solid #333" }}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full" style={{ background: "#10B981" }} />
                <div>
                  <span className="text-[13px] font-semibold" style={{ color: "#E5E5E5" }}>
                    Package — {packageManifest.abbrev}-S{String(packageManifest.episode).padStart(2,"0")}
                  </span>
                  <span className="ml-3 text-[11px]" style={{ color: "#555" }}>
                    {packageManifest.doneClips}/{packageManifest.totalClips} clips · {packageManifest.totalDuration}s
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Download EDL */}
                <button
                  onClick={() => downloadTextFile(
                    `${packageManifest.abbrev}-S${String(packageManifest.episode).padStart(2,"0")}.edl`,
                    packageManifest.edlLines.join("\n")
                  )}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium"
                  style={{ background: "#1E3A2F", color: "#10B981", border: "1px solid #2A5540" }}
                >
                  ↓ EDL
                </button>
                {/* Download CSV manifest */}
                <button
                  onClick={() => downloadTextFile(
                    `${packageManifest.abbrev}-S${String(packageManifest.episode).padStart(2,"0")}-manifest.csv`,
                    manifestToCSV(packageManifest)
                  )}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium"
                  style={{ background: "#1E2A3A", color: "#60A5FA", border: "1px solid #2A4060" }}
                >
                  ↓ CSV Manifest
                </button>
                <button
                  onClick={() => setShowPackage(false)}
                  className="w-7 h-7 flex items-center justify-center rounded"
                  style={{ background: "#2A2A2A", color: "#888" }}
                >✕</button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Left: Folder Structure */}
              <div className="w-56 flex-shrink-0 flex flex-col" style={{ background: "#161616", borderRight: "1px solid #2A2A2A" }}>
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #2A2A2A" }}>
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#555" }}>Folder Structure</span>
                </div>
                <div className="flex-1 overflow-y-auto dev-scrollbar p-3">
                  <pre className="text-[10px] font-mono leading-5" style={{ color: "#666", whiteSpace: "pre-wrap" }}>
                    {packageManifest.folderStructure.join("\n")}
                  </pre>
                  <div className="mt-4 pt-3" style={{ borderTop: "1px solid #2A2A2A" }}>
                    <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#555" }}>Post Rules</p>
                    {[
                      "序号从001开始递增",
                      "完成片段入 VIDEO/",
                      "待生成片段入 PENDING/",
                      "音频分离入 AUDIO/",
                      "参考素材入 ASSETS/",
                      "EDL + CSV入 DOCUMENTS/",
                    ].map(r => (
                      <div key={r} className="flex items-start gap-1.5 mb-1">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#444" }} />
                        <span className="text-[9px] leading-4" style={{ color: "#555" }}>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Clip List */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-4 px-4 py-2 flex-shrink-0" style={{ background: "#1E1E1E", borderBottom: "1px solid #2A2A2A" }}>
                  <span className="text-[9px] font-semibold uppercase tracking-wider flex-1" style={{ color: "#555" }}>Filename</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider w-16 text-right" style={{ color: "#555" }}>Scene</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider w-14 text-right" style={{ color: "#555" }}>Dur(s)</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider w-20" style={{ color: "#555" }}>Shot</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider w-16" style={{ color: "#555" }}>Status</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider w-12 text-right" style={{ color: "#555" }}>Action</span>
                </div>
                <div className="flex-1 overflow-y-auto dev-scrollbar">
                  {packageManifest.clips.map((clip, i) => {
                    const ss = STATUS_STYLE[clip.status] || STATUS_STYLE.pending
                    const isDone = clip.status === "done"
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-4 px-4 py-2"
                        style={{ borderBottom: "1px solid #222", background: isDone ? "transparent" : "rgba(255,80,80,0.03)" }}
                      >
                        {/* Filename */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono truncate" style={{ color: isDone ? "#A5B4FC" : "#555" }}>
                            {clip.filename}
                          </p>
                          <p className="text-[9px] truncate mt-0.5" style={{ color: "#444" }}>{clip.prompt}</p>
                        </div>
                        {/* Scene */}
                        <span className="text-[10px] font-mono w-16 text-right flex-shrink-0" style={{ color: "#666" }}>
                          SC{String(clip.sceneNum).padStart(3,"0")}
                        </span>
                        {/* Duration */}
                        <span className="text-[10px] font-mono w-14 text-right flex-shrink-0" style={{ color: "#666" }}>
                          {clip.durationSec}s
                        </span>
                        {/* Shot type */}
                        <span className="text-[10px] w-20 flex-shrink-0 truncate" style={{ color: "#666" }}>
                          {clip.shotType}
                        </span>
                        {/* Status badge */}
                        <span className="text-[9px] px-1.5 py-0.5 rounded w-16 flex-shrink-0 text-center" style={ss}>
                          {clip.status}
                        </span>
                        {/* Download link */}
                        <div className="w-12 flex-shrink-0 flex justify-end">
                          {clip.videoUrl ? (
                            <a
                              href={clip.videoUrl}
                              download={clip.filename}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{ background: "#1E3A2F", color: "#10B981" }}
                              title="Download this clip"
                            >↓</a>
                          ) : (
                            <span className="text-[10px]" style={{ color: "#333" }}>—</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Summary footer */}
                <div className="flex items-center gap-4 px-4 py-2 flex-shrink-0" style={{ background: "#161616", borderTop: "1px solid #2A2A2A" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: "#10B981" }} />
                    <span className="text-[10px]" style={{ color: "#555" }}>
                      {packageManifest.doneClips} clips ready
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: "#EF4444" }} />
                    <span className="text-[10px]" style={{ color: "#555" }}>
                      {packageManifest.totalClips - packageManifest.doneClips} pending
                    </span>
                  </div>
                  <div className="flex-1" />
                  <span className="text-[10px] font-mono" style={{ color: "#555" }}>
                    Total: {packageManifest.totalDuration}s · Generated {new Date(packageManifest.generatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
