"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import Link from "next/link"
import { MODEL_PRICING } from "@/lib/model-pricing"

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
  errorMessage?: string | null
  muxPlaybackId?: string | null
}

interface Scene {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
  action?: string | null
}

interface CostumePhoto { url: string; scene?: string; note?: string; isApproved?: boolean }

interface Role {
  id: string
  name: string
  role: string
  description?: string | null
  referenceImages: string[]
  voiceType?: string | null  // stores JSON with costumes
}

interface LocationData {
  name: string
  photoUrl: string | null
  photos: { url: string; note?: string }[]
}

interface Script {
  id: string
  title: string
  targetEpisodes: number
  scenes: Scene[]
  roles: Role[]
  locations: LocationData[]
  videoSegments: VideoSegment[]
}

const MODELS = [
  { id: "seedance_2_0", name: "Seedance 2.0", res: ["720p", "480p"], maxDur: 15, audio: true },
  { id: "seedance_1_5_pro", name: "Seedance 1.5 Pro", res: ["1080p", "720p"], maxDur: 12, audio: true },
  { id: "seedance_1_0_pro", name: "Seedance 1.0 Pro", res: ["1080p", "720p"], maxDur: 12, audio: false },
]

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#F3F4F6", color: "#6B7280", label: "Pending" },
  reserved: { bg: "#FEF3C7", color: "#92400E", label: "Reserved" },
  submitted: { bg: "#DBEAFE", color: "#1D4ED8", label: "Submitted" },
  generating: { bg: "#EDE9FE", color: "#6D28D9", label: "Generating" },
  done: { bg: "#D1FAE5", color: "#065F46", label: "Done" },
  failed: { bg: "#FEE2E2", color: "#991B1B", label: "Failed" },
}

export function TheaterWorkspace({ script, initialBalance }: { script: Script; initialBalance: number }) {
  const episodes = [...new Set(script.scenes.map(s => s.episodeNum))].sort((a, b) => a - b)
  if (episodes.length === 0 && script.targetEpisodes > 0) {
    for (let i = 1; i <= script.targetEpisodes; i++) episodes.push(i)
  }

  // ── Image preloading ──
  const [imagesReady, setImagesReady] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)

  useEffect(() => {
    // Collect all image URLs
    const urls = new Set<string>()
    for (const r of script.roles) {
      for (const img of r.referenceImages ?? []) if (img) urls.add(img)
    }
    for (const l of script.locations) {
      if (l.photoUrl) urls.add(l.photoUrl)
      for (const p of l.photos ?? []) if (p.url) urls.add(p.url)
    }
    for (const s of script.videoSegments) {
      if (s.thumbnailUrl) urls.add(s.thumbnailUrl)
    }
    // Also preload costume photos from role.voiceType JSON
    for (const r of script.roles) {
      try {
        if (r.voiceType?.startsWith("{")) {
          const meta = JSON.parse(r.voiceType) as { costumes?: { url: string }[] }
          for (const c of meta.costumes ?? []) if (c.url) urls.add(c.url)
        }
      } catch { /* ok */ }
    }

    const allUrls = [...urls]
    if (allUrls.length === 0) { setImagesReady(true); return }

    let loaded = 0
    const total = allUrls.length
    const timeout = setTimeout(() => setImagesReady(true), 8000) // max 8s wait

    for (const url of allUrls) {
      const img = new Image()
      img.onload = img.onerror = () => {
        loaded++
        setLoadProgress(Math.round((loaded / total) * 100))
        if (loaded >= total) {
          clearTimeout(timeout)
          setImagesReady(true)
        }
      }
      img.src = url
    }
    return () => clearTimeout(timeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedEp, setSelectedEp] = useState(episodes[0] ?? 1)
  const [segments, setSegments] = useState<VideoSegment[]>(script.videoSegments)
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null)
  const [model, setModel] = useState("seedance_2_0")
  const [resolution, setResolution] = useState("720p")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSplitting, setIsSplitting] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)
  const [balance, setBalance] = useState(initialBalance)
  const [editingPrompts, setEditingPrompts] = useState<Record<string, string>>({})
  const [useChainMode, setUseChainMode] = useState(true) // chain mode = visual continuity via last-frame extraction
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [assetTab, setAssetTab] = useState<"characters" | "locations" | "materials">("characters")
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const dropPosRef = useRef<number>(0) // tracks caret position during drag for accurate drop insertion

  const epSegments = segments.filter(s => s.episodeNum === selectedEp).sort((a, b) => a.segmentIndex - b.segmentIndex)
  const selectedSeg = segments.find(s => s.id === selectedSegId) ?? null

  // Stat summary
  const done = epSegments.filter(s => s.status === "done").length
  const failed = epSegments.filter(s => s.status === "failed").length
  const active = epSegments.filter(s => ["submitted", "generating", "reserved"].includes(s.status)).length
  const totalDuration = epSegments.reduce((sum, s) => sum + s.durationSec, 0)

  // Cost estimate: sum duration of ungenerated segments × price per second for selected model/resolution
  const ungeneratedSegments = epSegments.filter(s => !["done", "submitted", "generating", "reserved"].includes(s.status))
  const estimatedCost = ungeneratedSegments.reduce((sum, s) => {
    const pricePerSec = MODEL_PRICING[model]?.[resolution] ?? 0
    return sum + Math.ceil(s.durationSec * pricePerSec * 2 / 100) // must match server calculateTokenCost: API cost × 2
  }, 0)

  // Refresh coin balance from server
  async function refreshBalance() {
    try {
      const res = await fetch("/api/tokens/balance")
      if (res.ok) {
        const data = await res.json()
        setBalance(data.available ?? data.balance ?? 0)
      }
    } catch { /* ok */ }
  }

  // Poll for status updates
  const pollStatus = useCallback(async () => {
    if (isPolling) return
    setIsPolling(true)
    try {
      const res = await fetch(`/api/video/status?scriptId=${script.id}&episodeNum=${selectedEp}`)
      if (res.ok) {
        const data = await res.json()
        setSegments(prev => {
          const map = new Map(prev.map(s => [s.id, s]))
          for (const s of (data.segments ?? [])) map.set(s.id, s)
          return [...map.values()]
        })
      }
      // Also refresh balance during polling (tokens consumed as segments complete)
      refreshBalance()
    } finally {
      setIsPolling(false)
    }
  }, [script.id, selectedEp, isPolling])

  // Auto-poll every 5s when there are active segments
  useEffect(() => {
    if (active > 0) {
      pollingRef.current = setInterval(pollStatus, 5000)
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [active, pollStatus])

  // Submit generation (chain mode or batch mode)
  async function handleGenerate() {
    if (epSegments.length === 0) { alert("No segments to generate. Run AI Plan first."); return }
    setIsSubmitting(true)
    try {
      const endpoint = useChainMode ? "/api/video/chain-submit" : "/api/video/submit"
      // Both modes need the same segment data
      const segData = epSegments.map(s => ({
        segmentIndex: s.segmentIndex,
        sceneNum: s.sceneNum,
        durationSec: s.durationSec,
        prompt: editingPrompts[s.id] ?? s.prompt,
        shotType: s.shotType,
        cameraMove: s.cameraMove,
        beatType: s.beatType,
      }))

      const payload = useChainMode
        ? { scriptId: script.id, episodeNum: selectedEp, model, resolution, segments: segData }
        : { mode: "batch", scriptId: script.id, episodeNum: selectedEp, model, resolution, segments: segData }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.status === 402) { alert("Insufficient balance"); return }
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Failed to submit")
        return
      }
      const data = await res.json()
      // Both modes return new segments with new IDs — update state
      if (data.segments) {
        setSegments(prev => {
          const filtered = prev.filter(s => s.episodeNum !== selectedEp)
          return [...filtered, ...data.segments].sort((a, b) => a.episodeNum - b.episodeNum || a.segmentIndex - b.segmentIndex)
        })
      }
      await pollStatus()
      await refreshBalance()
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset single segment
  async function handleReset(segId: string) {
    await fetch("/api/video/reset", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId: segId }),
    })
    setSegments(prev => prev.filter(s => s.id !== segId))
    if (selectedSegId === segId) setSelectedSegId(null)
    await refreshBalance()
  }

  // Reset all segments for episode
  async function handleResetAll() {
    if (!confirm("Reset all segments for this episode? This will refund reserved tokens.")) return
    await fetch("/api/video/reset", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptId: script.id, episodeNum: selectedEp }),
    })
    setSegments(prev => prev.filter(s => s.episodeNum !== selectedEp))
    setSelectedSegId(null)
    await refreshBalance()
  }

  // AI Plan: Enhanced split that includes transition analysis + Seedance 2.0 optimized prompts
  async function handleAIPlan() {
    if (!confirm(`AI Plan Episode ${selectedEp}? This analyzes scenes, adds transitions, and generates Seedance-optimized video segments. Replaces existing segments.`)) return
    setIsSplitting(true)
    try {
      const res = await fetch("/api/ai/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum: selectedEp,
          model,
          resolution,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        if (err.error === "insufficient_balance") {
          alert(`Insufficient balance. Need ${err.required} coins, have ${err.balance}.`)
        } else {
          alert(err.error || "AI Plan failed")
        }
        return
      }
      const data = await res.json()

      // Save segments
      const saveRes = await fetch("/api/segments/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum: selectedEp,
          model,
          resolution,
          segments: data.segments,
        }),
      })
      if (saveRes.ok) {
        const saved = await saveRes.json()
        setSegments(prev => {
          const filtered = prev.filter(s => s.episodeNum !== selectedEp)
          return [...filtered, ...(saved.segments || [])].sort((a, b) => a.episodeNum - b.episodeNum || a.segmentIndex - b.segmentIndex)
        })
      }
      await refreshBalance()
    } catch {
      alert("AI Plan failed")
    } finally {
      setIsSplitting(false)
    }
  }

  // Single-segment regeneration
  async function handleRegenerate(segmentId: string) {
    const seg = epSegments.find(s => s.id === segmentId)
    if (!seg) return
    const editedPrompt = editingPrompts[segmentId] ?? seg.prompt
    setIsSubmitting(true)
    try {
      // Submit single segment with optional prompt override + model/resolution
      const res = await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId,
          prompt: editedPrompt !== seg.prompt ? editedPrompt : undefined,
          model,
          resolution,
        }),
      })
      if (res.status === 402) { alert("Insufficient balance"); return }
      if (!res.ok) { const err = await res.json(); alert(err.error || "Submit failed"); return }
      const data = await res.json()
      if (data.segment) {
        setSegments(prev => prev.map(s => s.id === segmentId ? data.segment : s))
      }
      await pollStatus()
      await refreshBalance()
    } finally { setIsSubmitting(false) }
  }

  // Insert @mention text into prompt at cursor position (or append)
  function insertAtCursor(segId: string, text: string) {
    const textarea = promptRef.current
    if (textarea && document.activeElement === textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const current = editingPrompts[segId] ?? epSegments.find(s => s.id === segId)?.prompt ?? ""
      const before = current.substring(0, start)
      const after = current.substring(end)
      const newText = before + text + " " + after
      setEditingPrompts(prev => ({ ...prev, [segId]: newText }))
      setTimeout(() => {
        if (promptRef.current) {
          const pos = start + text.length + 1
          promptRef.current.selectionStart = pos
          promptRef.current.selectionEnd = pos
          promptRef.current.focus()
        }
      }, 0)
    } else {
      setEditingPrompts(prev => {
        const current = prev[segId] ?? epSegments.find(s => s.id === segId)?.prompt ?? ""
        return { ...prev, [segId]: current + " " + text }
      })
    }
  }


  // Build name→type lookup for @mention highlighting (keyed by lowercase)
  const mentionLookup = useMemo(() => {
    const map = new Map<string, "char" | "loc">()
    for (const r of script.roles) map.set(r.name.toLowerCase(), "char")
    for (const l of script.locations) map.set(l.name.toLowerCase(), "loc")
    return map
  }, [script.roles, script.locations])

  // Build regex from known names (longest first to avoid partial matches)
  const mentionRegex = useMemo(() => {
    const names = [
      ...script.roles.map(r => r.name),
      ...script.locations.map(l => l.name),
    ].filter(Boolean).sort((a, b) => b.length - a.length) // longest first
    const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    if (escaped.length === 0) return /\[Ref Seg#\d+\]/g
    return new RegExp(`(@(?:${escaped.join("|")}))|(\\[Ref Seg#\\d+\\])`, "gi")
  }, [script.roles, script.locations])

  // Render prompt text with colored @mentions and [Ref] tags
  function renderHighlightedPrompt(text: string) {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let key = 0
    // Reset regex state
    mentionRegex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
      }
      const token = match[0]
      if (match[1]) {
        // @Name match
        const name = token.slice(1)
        const type = mentionLookup.get(name.toLowerCase())
        const color = type === "char" ? "#6366F1" : type === "loc" ? "#10B981" : "#F59E0B"
        const bg = type === "char" ? "rgba(99,102,241,0.15)" : type === "loc" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)"
        parts.push(
          <span key={key++} style={{ color, background: bg, borderRadius: 3, padding: "0 2px", fontWeight: 600 }}>
            {token}
          </span>
        )
      } else {
        // [Ref Seg#N]
        parts.push(
          <span key={key++} style={{ color: "#F97316", background: "rgba(249,115,22,0.15)", borderRadius: 3, padding: "0 2px", fontWeight: 600 }}>
            {token}
          </span>
        )
      }
      lastIndex = match.index + token.length
    }
    if (lastIndex < text.length) {
      parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
    }
    // Trailing newline so overlay height matches textarea
    parts.push(<br key="tail" />)
    return parts
  }

  const currentModel = MODELS.find(m => m.id === model)

  // ── Main tab: call sheet or segments ──
  const [mainTab, setMainTab] = useState<"callsheet" | "segments">("callsheet")

  // ── Assets: collect visual references used in segment detail ──
  const characterAssets = useMemo(() =>
    script.roles.filter(r => (r.referenceImages?.length ?? 0) > 0),
    [script.roles]
  )

  const costumeAssets = useMemo(() => {
    const items: { role: Role; costume: CostumePhoto }[] = []
    for (const role of script.roles) {
      let meta: { costumes?: CostumePhoto[] } = {}
      try { if (role.voiceType?.startsWith("{")) meta = JSON.parse(role.voiceType) } catch { /* ok */ }
      for (const c of (meta.costumes || [])) {
        items.push({ role, costume: c })
      }
    }
    return items
  }, [script.roles])

  // ── Call Sheet helpers ──
  const epScenes = useMemo(() =>
    script.scenes.filter(s => s.episodeNum === selectedEp).sort((a, b) => a.sceneNum - b.sceneNum),
    [script.scenes, selectedEp]
  )

  // Extract character names from scene action/dialogue text
  const mentionedInEp = useMemo(() => {
    const names = new Set<string>()
    for (const scene of epScenes) {
      const text = scene.action || ""
      // Parse block JSON if possible
      try {
        const blocks = JSON.parse(text) as Array<{ type: string; character?: string; text?: string }>
        if (Array.isArray(blocks)) {
          for (const b of blocks) {
            if (b.type === "dialogue" && b.character) names.add(b.character.trim())
          }
        }
      } catch { /* ok */ }
      // Also check raw text for CAPS character names
      const matches = text.matchAll(/^([A-Z\u4e00-\u9fff]{2,}(?:\s[A-Z]+)?)\s*\n/gm)
      for (const m of matches) if (m[1].length < 30) names.add(m[1].trim())
    }
    return names
  }, [epScenes])

  // Characters in this episode: only show roles actually mentioned in the episode's scenes
  const epCast = useMemo(() =>
    script.roles.filter(r =>
      mentionedInEp.has(r.name.toUpperCase()) ||
      mentionedInEp.has(r.name) ||
      epScenes.some(s => (s.action || "").includes(r.name))
    ),
    [script.roles, mentionedInEp, epScenes]
  )

  // Location photo lookup
  const locPhotoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of script.locations) {
      const url = l.photos?.[0]?.url || l.photoUrl
      if (url) map.set(l.name, url)
    }
    return map
  }, [script.locations])

  // Unique locations in this episode
  const epLocations = useMemo(() => {
    const map = new Map<string, { scenes: number[]; timeOfDay: string; mood: string }>()
    for (const s of epScenes) {
      if (!s.location) continue
      const e = map.get(s.location)
      if (e) { e.scenes.push(s.sceneNum) }
      else map.set(s.location, { scenes: [s.sceneNum], timeOfDay: s.timeOfDay || "", mood: s.mood || "" })
    }
    return [...map.entries()].map(([loc, d]) => ({ loc, ...d }))
  }, [epScenes])

  // Costume lookup per role
  const costumesPerRole = useMemo(() => {
    const map = new Map<string, CostumePhoto[]>()
    for (const role of script.roles) {
      let meta: { costumes?: CostumePhoto[] } = {}
      try { if (role.voiceType?.startsWith("{")) meta = JSON.parse(role.voiceType) } catch { /* ok */ }
      if (meta.costumes?.length) map.set(role.id, meta.costumes)
    }
    return map
  }, [script.roles])

  // ── Loading screen while images preload ──
  if (!imagesReady) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ background: "#1A1A2E" }}>
        <div className="flex flex-col items-center gap-5">
          {/* Film clapper icon */}
          <div className="relative">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={1.5} className="animate-pulse">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M2 8h20"/>
              <path d="M6 4l2 4"/>
              <path d="M10 4l2 4"/>
              <path d="M14 4l2 4"/>
              <path d="M18 4l2 4"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: "#E0E0FF" }}>{script.title}</p>
            <p className="text-[11px] mt-1" style={{ color: "#6366F1" }}>Loading assets...</p>
          </div>
          {/* Progress bar */}
          <div className="w-48 h-1 rounded-full overflow-hidden" style={{ background: "#2A2A4E" }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadProgress}%`, background: "#6366F1" }}
            />
          </div>
          <p className="text-[10px] font-mono" style={{ color: "#555" }}>{loadProgress}%</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: "#E8E8E8" }}>
    {/* ── Main Tab Bar ── */}
    <div className="flex items-center px-3 gap-0 flex-shrink-0" style={{ background: "#E2E2E2", borderBottom: "1px solid #C8C8C8" }}>
      {([
        { id: "callsheet", label: "📋 Call Sheet" },
        { id: "segments", label: "◼ Segments" },
      ] as const).map(tab => (
        <button
          key={tab.id}
          onClick={() => setMainTab(tab.id)}
          className="px-4 py-2 text-[11px] font-medium relative transition-colors"
          style={{ color: mainTab === tab.id ? "#1A1A1A" : "#888" }}
        >
          {tab.label}
          {mainTab === tab.id && (
            <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t" style={{ background: "#4F46E5" }} />
          )}
        </button>
      ))}
    </div>

    {/* Main content */}
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Episode list + controls */}
      <div className="w-52 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
        {/* Header */}
        <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Episodes</span>
        </div>

        {/* Episode list */}
        <div className="flex-1 overflow-y-auto dev-scrollbar py-1">
          {episodes.map(ep => {
            const epSegs = segments.filter(s => s.episodeNum === ep)
            const epDone = epSegs.filter(s => s.status === "done").length
            const epActive = epSegs.filter(s => ["submitted", "generating", "reserved"].includes(s.status)).length
            const isActive = ep === selectedEp
            return (
              <button
                key={ep}
                onClick={() => { setSelectedEp(ep); setSelectedSegId(null) }}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors"
                style={{
                  background: isActive ? "#DCE0F5" : "transparent",
                  borderLeft: isActive ? "2px solid #4F46E5" : "2px solid transparent",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium" style={{ color: isActive ? "#1A1A1A" : "#444" }}>Episode {ep}</p>
                  <p className="text-[10px]" style={{ color: "#AAA" }}>
                    {epSegs.length > 0 ? `${epDone}/${epSegs.length} done` : "No segments"}
                  </p>
                </div>
                {epActive > 0 && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                )}
                {epDone > 0 && epDone === epSegs.length && (
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </button>
            )
          })}
        </div>

        {/* Model selector */}
        <div className="px-3 py-3 space-y-2" style={{ borderTop: "1px solid #C8C8C8" }}>
          <div>
            <label className="text-[9px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Model</label>
            <select
              value={model}
              onChange={e => { setModel(e.target.value); const m = MODELS.find(x => x.id === e.target.value); if (m && !m.res.includes(resolution)) setResolution(m.res[0]) }}
              className="w-full text-[11px] rounded px-2 py-1 focus:outline-none"
              style={{ background: "#E0E0E0", border: "1px solid #C0C0C0", color: "#444" }}
            >
              {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[9px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Resolution</label>
              <select
                value={resolution}
                onChange={e => setResolution(e.target.value)}
                className="w-full text-[11px] rounded px-2 py-1 focus:outline-none"
                style={{ background: "#E0E0E0", border: "1px solid #C0C0C0", color: "#444" }}
              >
                {(currentModel?.res || ["720p"]).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[9px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Max</label>
              <div className="text-[11px] px-2 py-1 rounded" style={{ background: "#E0E0E0", border: "1px solid #C0C0C0", color: "#444" }}>
                {currentModel?.maxDur ?? 12}s
              </div>
            </div>
          </div>
          {/* Audio badge */}
          {currentModel?.audio && (
            <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded" style={{ background: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
              Sound ON
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: "#AAA" }}>Balance: {balance} coins</span>
          </div>
        </div>
      </div>

      {/* ── CALL SHEET VIEW ── */}
      {mainTab === "callsheet" && (
        <div className="flex-1 overflow-y-auto dev-scrollbar" style={{ background: "#F5F5F5" }}>
          {/* Call Sheet Header */}
          <div className="px-6 py-4" style={{ background: "#1A1A2E", color: "#E0E0FF" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#6366F1" }}>CALL SHEET · PRODUCTION SCHEDULE</p>
                <h2 className="text-lg font-bold" style={{ color: "#fff" }}>{script.title}</h2>
                <p className="text-[11px] mt-0.5" style={{ color: "#8888CC" }}>
                  Episode {selectedEp} of {episodes.length} · {epScenes.length} scenes · {epLocations.length} locations
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-wider" style={{ color: "#555" }}>Generated</p>
                <p className="text-[11px] font-mono" style={{ color: "#666" }}>{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-5">

            {/* ── Section 1: Cast List ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #D8D8D8", background: "#fff" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#F0F0F5", borderBottom: "1px solid #E0E0E8" }}>
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#4F46E5" }}>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#1A1A1A" }}>Cast — Episode {selectedEp}</span>
                </div>
                <Link href={`/dev/casting/${script.id}`} className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#E8E4FF", color: "#4F46E5" }}>
                  Edit Casting →
                </Link>
              </div>

              {script.roles.length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px]" style={{ color: "#CCC" }}>
                  No cast defined yet.{" "}
                  <Link href={`/dev/casting/${script.id}`} className="underline" style={{ color: "#4F46E5" }}>Go to Casting →</Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                        <th className="text-left px-4 py-2 font-semibold w-8" style={{ color: "#AAA" }}>#</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#AAA" }}>Character</th>
                        <th className="text-left px-3 py-2 font-semibold w-24" style={{ color: "#AAA" }}>Role</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#AAA" }}>Portrait</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#AAA" }}>Costume</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#AAA" }}>Scenes</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#AAA" }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {epCast.map((role, idx) => {
                        const costumes = costumesPerRole.get(role.id) || []
                        return (
                          <tr key={role.id}
                            style={{
                              borderBottom: "1px solid #F0F0F0",
                              background: "rgba(79,70,229,0.03)",
                            }}>
                            {/* # */}
                            <td className="px-4 py-2.5 font-mono" style={{ color: "#DDD" }}>{idx + 1}</td>
                            {/* Name */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {role.referenceImages?.[0] ? (
                                  <img src={role.referenceImages[0]} className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                    style={{ border: "1.5px solid #D0D0D0" }} alt="" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                                    style={{ background: "#E8E4FF", color: "#4F46E5" }}>
                                    {role.name[0]}
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold" style={{ color: "#1A1A1A" }}>{role.name}</p>
                                  <p className="text-[9px]" style={{ color: "#4F46E5" }}>● Ep {selectedEp}</p>
                                </div>
                              </div>
                            </td>
                            {/* Role type */}
                            <td className="px-3 py-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium capitalize"
                                style={{
                                  background: role.role === "protagonist" ? "#EEF2FF" : role.role === "antagonist" ? "#FEF2F2" : "#F5F5F5",
                                  color: role.role === "protagonist" ? "#4338CA" : role.role === "antagonist" ? "#B91C1C" : "#6B7280",
                                }}>
                                {role.role}
                              </span>
                            </td>
                            {/* Portrait thumbnails */}
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1">
                                {role.referenceImages?.slice(0, 3).map((img, i) => (
                                  <img key={i} src={img} className="w-10 h-14 rounded object-cover"
                                    style={{ border: "1px solid #E0E0E0" }} alt="" />
                                ))}
                                {!role.referenceImages?.length && (
                                  <span className="text-[9px]" style={{ color: "#CCC" }}>—</span>
                                )}
                              </div>
                            </td>
                            {/* Costume photos */}
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1">
                                {costumes.slice(0, 2).map((c, i) => (
                                  <div key={i} className="relative">
                                    <img src={c.url} className="w-10 h-14 rounded object-cover"
                                      style={{ border: `1px solid ${c.isApproved ? "#10B981" : "#E0E0E0"}` }} alt="" />
                                    {c.isApproved && (
                                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                        style={{ background: "#10B981" }}>
                                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}>
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {costumes.length > 2 && (
                                  <div className="w-10 h-14 rounded flex items-center justify-center text-[9px] font-medium"
                                    style={{ background: "#F0F0F0", color: "#888" }}>
                                    +{costumes.length - 2}
                                  </div>
                                )}
                                {!costumes.length && <span className="text-[9px]" style={{ color: "#CCC" }}>—</span>}
                              </div>
                            </td>
                            {/* Scenes appearing in */}
                            <td className="px-3 py-2.5">
                              <div className="flex gap-0.5 flex-wrap max-w-[120px]">
                                {epScenes.filter(s =>
                                  (s.action || "").includes(role.name) ||
                                  (s.heading || "").includes(role.name)
                                ).map(s => (
                                  <span key={s.id} className="px-1 py-0.5 rounded text-[8px] font-mono"
                                    style={{ background: "#EEF2FF", color: "#4338CA" }}>
                                    {String(s.sceneNum).padStart(2,"0")}
                                  </span>
                                ))}
                              </div>
                            </td>
                            {/* Notes from description */}
                            <td className="px-3 py-2.5 max-w-[140px]">
                              <p className="text-[10px] truncate" style={{ color: "#999" }}>
                                {role.description?.slice(0, 40) || "—"}
                              </p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Section 2: Scene Schedule ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #D8D8D8", background: "#fff" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#F0F5F0", borderBottom: "1px solid #E0E8E0" }}>
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#10B981" }}>
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                    <line x1="16" x2="16" y1="2" y2="6"/>
                    <line x1="8" x2="8" y1="2" y2="6"/>
                    <line x1="3" x2="21" y1="10" y2="10"/>
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#1A1A1A" }}>Scene Schedule</span>
                </div>
                <span className="text-[9px]" style={{ color: "#AAA" }}>{epScenes.length} scenes</span>
              </div>

              {epScenes.length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px]" style={{ color: "#CCC" }}>No scenes for this episode.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                        <th className="text-left px-4 py-2 font-semibold w-12" style={{ color: "#AAA" }}>Scene</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#AAA" }}>Heading / Description</th>
                        <th className="text-left px-3 py-2 font-semibold w-28" style={{ color: "#AAA" }}>Location</th>
                        <th className="text-left px-3 py-2 font-semibold w-20" style={{ color: "#AAA" }}>Time</th>
                        <th className="text-left px-3 py-2 font-semibold w-20" style={{ color: "#AAA" }}>Mood</th>
                        <th className="text-left px-3 py-2 font-semibold w-20" style={{ color: "#AAA" }}>Segs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {epScenes.map((scene, i) => {
                        const sceneSegs = epSegments.filter(s => s.sceneNum === scene.sceneNum)
                        const timeColors: Record<string, string> = {
                          day: "#F59E0B", night: "#6366F1", dawn: "#F97316", dusk: "#EC4899", interior: "#06B6D4", exterior: "#10B981"
                        }
                        const tod = (scene.timeOfDay || "").toLowerCase()
                        const todColor = Object.entries(timeColors).find(([k]) => tod.includes(k))?.[1] || "#9CA3AF"
                        return (
                          <tr key={scene.id} style={{ borderBottom: "1px solid #F5F5F5", background: i % 2 === 0 ? "transparent" : "#FAFAFA" }}>
                            <td className="px-4 py-2.5">
                              <span className="font-mono font-bold text-[12px]" style={{ color: "#4F46E5" }}>
                                {String(scene.sceneNum).padStart(2, "0")}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="font-medium" style={{ color: "#1A1A1A" }}>
                                {scene.heading || `Scene ${scene.sceneNum}`}
                              </p>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="truncate max-w-[100px]" style={{ color: "#666" }}>{scene.location || "—"}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              {scene.timeOfDay ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                  style={{ background: `${todColor}22`, color: todColor }}>
                                  {scene.timeOfDay}
                                </span>
                              ) : <span style={{ color: "#DDD" }}>—</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="truncate max-w-[80px] text-[10px]" style={{ color: "#999" }}>{scene.mood || "—"}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              {sceneSegs.length > 0 ? (
                                <div className="flex gap-1 flex-wrap">
                                  {sceneSegs.map(seg => {
                                    const ss = STATUS_STYLE[seg.status] || STATUS_STYLE.pending
                                    return (
                                      <span key={seg.id} className="text-[8px] px-1 py-0.5 rounded font-mono"
                                        style={{ background: ss.bg, color: ss.color }}>
                                        {seg.segmentIndex + 1}
                                      </span>
                                    )
                                  })}
                                </div>
                              ) : <span className="text-[9px]" style={{ color: "#DDD" }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Section 3: Locations ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #D8D8D8", background: "#fff" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#F5F0F0", borderBottom: "1px solid #E8E0E0" }}>
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#EF4444" }}>
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#1A1A1A" }}>Locations</span>
                </div>
                <Link href={`/dev/location/${script.id}`} className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#EF4444" }}>
                  Edit Location →
                </Link>
              </div>
              {epLocations.length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px]" style={{ color: "#CCC" }}>No locations specified in scenes.</div>
              ) : (
                <div className="grid grid-cols-3 gap-3 p-4">
                  {epLocations.map(loc => (
                    <div key={loc.loc} className="rounded-lg overflow-hidden flex flex-col"
                      style={{ background: "#FFF5F5", border: "1px solid #FFE4E4" }}>
                      {locPhotoMap.get(loc.loc) ? (
                        <img src={locPhotoMap.get(loc.loc)} alt="" className="w-full h-24 object-cover" />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center"
                          style={{ background: "#FEE2E2" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2}>
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                        </div>
                      )}
                      <div className="px-2.5 py-2 flex flex-col gap-1">
                        <p className="font-semibold text-[10px] truncate" style={{ color: "#1A1A1A" }}>{loc.loc}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {loc.timeOfDay && (
                            <span className="text-[8px]" style={{ color: "#F97316" }}>{loc.timeOfDay}</span>
                          )}
                          {loc.scenes.map(n => (
                            <span key={n} className="text-[8px] px-1 rounded font-mono"
                              style={{ background: "#FFE4E4", color: "#B91C1C" }}>
                              SC{String(n).padStart(2,"0")}
                            </span>
                          ))}
                          {loc.mood && <span className="text-[8px]" style={{ color: "#AAA" }}>{loc.mood}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section 4: Props summary ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #D8D8D8", background: "#fff" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#F5F5F0", borderBottom: "1px solid #E8E8E0" }}>
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#F59E0B" }}>
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.29 7 12 12 20.71 7"/>
                    <line x1="12" y1="22" x2="12" y2="12"/>
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#1A1A1A" }}>Props</span>
                </div>
                <Link href={`/dev/props/${script.id}`} className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#D97706" }}>
                  Edit Props →
                </Link>
              </div>
              <div className="px-4 py-4 text-center text-[11px]" style={{ color: "#BBB" }}>
                Props are managed in the Props module.{" "}
                <Link href={`/dev/props/${script.id}`} className="underline" style={{ color: "#F59E0B" }}>Go to Props →</Link>
              </div>
            </div>

            {/* ── Section 5: Segment status per scene ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #D8D8D8", background: "#fff" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#F0F0F8", borderBottom: "1px solid #E0E0F0" }}>
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#6366F1" }}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#1A1A1A" }}>Production Status</span>
                </div>
                <button onClick={() => setMainTab("segments")} className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#EEF2FF", color: "#4F46E5" }}>
                  Open Segments →
                </button>
              </div>
              <div className="p-4">
                {epSegments.length === 0 ? (
                  <div className="text-center text-[11px] py-4" style={{ color: "#CCC" }}>
                    No segments yet. <button onClick={() => setMainTab("segments")} className="underline" style={{ color: "#4F46E5" }}>Go to Segments to AI Split →</button>
                  </div>
                ) : (
                  <div className="flex gap-3 flex-wrap">
                    {Object.entries(STATUS_STYLE).map(([status, style]) => {
                      const count = epSegments.filter(s => s.status === status).length
                      if (count === 0) return null
                      return (
                        <div key={status} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                          style={{ background: style.bg, border: `1px solid ${style.color}33` }}>
                          <span className="text-[12px] font-bold" style={{ color: style.color }}>{count}</span>
                          <span className="text-[10px]" style={{ color: style.color }}>{style.label}</span>
                        </div>
                      )
                    })}
                    <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                      style={{ background: "#F0F0F5", border: "1px solid #D8D8E8" }}>
                      <span className="text-[10px] font-medium" style={{ color: "#6366F1" }}>
                        {epSegments.reduce((a, s) => a + s.durationSec, 0)}s total
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── SEGMENTS VIEW ── */}
      {mainTab === "segments" && <>
      {/* Center: Segment list */}
      <div className="flex flex-col" style={{ width: 380, borderRight: "1px solid #C0C0C0", background: "#F0F0F0" }}>
        {/* Toolbar — clean two-row layout */}
        <div className="px-3 py-2 space-y-1.5" style={{ borderBottom: "1px solid #C8C8C8", background: "#EBEBEB" }}>
          {/* Row 1: Episode info + Generate button */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold" style={{ color: "#333" }}>Ep {selectedEp}</span>
            {epSegments.length > 0 && (
              <span className="text-[10px]" style={{ color: "#AAA" }}>
                {done}/{epSegments.length} · {totalDuration}s
              </span>
            )}
            {active > 0 && (
              <button onClick={pollStatus} className="text-[9px] px-1.5 py-0.5 rounded transition-colors" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
                {isPolling ? "..." : "↻"}
              </button>
            )}
            <div className="flex-1" />
            {/* Chain/Batch toggle — compact icon-only */}
            <button
              onClick={() => setUseChainMode(c => !c)}
              className="flex items-center gap-1 text-[9px] px-1.5 py-1 rounded transition-colors"
              style={{
                background: useChainMode ? "#FDF4FF" : "#F5F5F5",
                color: useChainMode ? "#9333EA" : "#999",
                border: `1px solid ${useChainMode ? "#E9D5FF" : "#DDD"}`,
              }}
              title={useChainMode
                ? "Chain Mode ON: Visual continuity via last-frame"
                : "Batch Mode: Independent generation (faster)"
              }
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {useChainMode ? "Chain" : "Batch"}
            </button>
            {/* Main Generate button with cost inline */}
            <button
              onClick={() => setShowGenerateConfirm(true)}
              disabled={isSubmitting || epSegments.length === 0}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              {isSubmitting ? (
                <div className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <span>▶</span>
              )}
              {isSubmitting ? "..." : done === epSegments.length && done > 0 ? "Re-generate" : "Generate"}
              {estimatedCost > 0 && !isSubmitting && (
                <span className="text-[8px] opacity-70">{estimatedCost}🪙</span>
              )}
            </button>
          </div>
          {/* Row 2: Secondary actions — only when segments exist */}
          {epSegments.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleAIPlan}
                disabled={isSplitting}
                className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                style={{ color: "#4F46E5" }}
              >
                {isSplitting ? (
                  <div className="w-2 h-2 rounded-full border border-t-transparent animate-spin" style={{ borderColor: "#4F46E5" }} />
                ) : (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                )}
                {isSplitting ? "Planning..." : "Re-plan"}
              </button>
              <span style={{ color: "#DDD" }}>·</span>
              <button onClick={handleResetAll} className="text-[9px] px-2 py-0.5 rounded transition-colors" style={{ color: "#999" }}>
                Reset All
              </button>
            </div>
          )}
        </div>

        {/* Segment list */}
        <div className="flex-1 overflow-y-auto dev-scrollbar">
          {epSegments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48" style={{ color: "#CCC" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-40">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <line x1="9" x2="9" y1="3" y2="21" />
              </svg>
              <p className="text-xs">No segments</p>
              <p className="text-[10px] mt-1" style={{ color: "#DDD" }}>Click "✦ AI Split" to generate from script</p>
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {epSegments.map(seg => {
                const ss = STATUS_STYLE[seg.status] || STATUS_STYLE.pending
                const isSelected = seg.id === selectedSegId
                return (
                  <button
                    key={seg.id}
                    onClick={() => setSelectedSegId(seg.id === selectedSegId ? null : seg.id)}
                    className="w-full text-left rounded-lg p-2.5 transition-all"
                    style={{
                      background: isSelected ? "#DCE0F5" : "#E8E8E8",
                      outline: isSelected ? "1px solid #A5B4FC" : "1px solid #D0D0D0",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono w-5 flex-shrink-0" style={{ color: "#AAA" }}>#{seg.segmentIndex + 1}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>
                      <span className="text-[10px] ml-auto" style={{ color: "#AAA" }}>{seg.durationSec}s</span>
                    </div>
                    <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "#555", paddingLeft: 20 }}>
                      {renderHighlightedPrompt(seg.prompt?.slice(0, 120) ?? "")}
                    </p>
                    {seg.status === "failed" && seg.errorMessage && (
                      <p className="text-[10px] mt-1 pl-5" style={{ color: "#EF4444" }}>{seg.errorMessage.slice(0, 80)}</p>
                    )}
                    {/* Thumbnail preview */}
                    {seg.thumbnailUrl && (
                      <div className="mt-2 pl-5">
                        <img src={seg.thumbnailUrl} alt="" className="h-16 rounded object-cover" style={{ border: "1px solid #D0D0D0" }} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Video preview / Segment detail */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#F5F5F5" }}>
        {!selectedSeg ? (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ color: "#CCC" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-30">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <p className="text-sm">Select a segment to preview</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto dev-scrollbar p-4">
            {/* Video preview */}
            {(selectedSeg.muxPlaybackId || selectedSeg.videoUrl) ? (
              <div className="mb-4 rounded-lg overflow-hidden" style={{ background: "#000", border: "1px solid #C0C0C0" }}>
                <video
                  src={
                    selectedSeg.muxPlaybackId
                      ? `https://stream.mux.com/${selectedSeg.muxPlaybackId}.m3u8`
                      : selectedSeg.videoUrl!
                  }
                  controls
                  className="w-full max-h-[320px]"
                  style={{ display: "block" }}
                />
              </div>
            ) : selectedSeg.thumbnailUrl ? (
              <div className="mb-4 rounded-lg overflow-hidden" style={{ border: "1px solid #C0C0C0" }}>
                <img src={selectedSeg.thumbnailUrl} alt="" className="w-full max-h-[240px] object-cover" />
              </div>
            ) : (
              <div className="mb-4 rounded-lg flex items-center justify-center h-40" style={{ background: "#E0E0E0", border: "1px solid #C8C8C8" }}>
                <span className="text-[11px]" style={{ color: "#AAA" }}>
                  {["submitted", "generating"].includes(selectedSeg.status) ? "Generating..." : "No video yet"}
                </span>
              </div>
            )}

            {/* Segment info — compact single row */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap px-1 py-1.5 rounded-lg text-[10px]" style={{ background: "#EBEBEB" }}>
                <span className="font-semibold" style={{ color: "#1A1A1A" }}>#{selectedSeg.segmentIndex + 1}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={STATUS_STYLE[selectedSeg.status] || STATUS_STYLE.pending}>
                  {STATUS_STYLE[selectedSeg.status]?.label || selectedSeg.status}
                </span>
                <span style={{ color: "#888" }}>{selectedSeg.durationSec}s</span>
                <span style={{ color: "#CCC" }}>·</span>
                <span style={{ color: "#888" }}>Sc{selectedSeg.sceneNum}</span>
                {selectedSeg.shotType && <><span style={{ color: "#CCC" }}>·</span><span style={{ color: "#888" }}>{selectedSeg.shotType}</span></>}
                {selectedSeg.cameraMove && selectedSeg.cameraMove !== "static" && <><span style={{ color: "#CCC" }}>·</span><span style={{ color: "#888" }}>{selectedSeg.cameraMove}</span></>}
                {selectedSeg.tokenCost && <><span style={{ color: "#CCC" }}>·</span><span style={{ color: "#888" }}>{selectedSeg.tokenCost}🪙</span></>}
                <div className="ml-auto flex items-center gap-1.5">
                  {(selectedSeg.status === "failed" || selectedSeg.status === "done") && (
                    <button onClick={() => handleReset(selectedSeg.id)} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#E0E0E0", color: "#888" }}>Reset</button>
                  )}
                </div>
              </div>

              {/* ── Enhanced Prompt Editor with Drag & Drop Asset Tray ── */}
              <div className="space-y-3">
                {/* Prompt header with re-generate button */}
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>Prompt</label>
                  <button
                    onClick={() => handleRegenerate(selectedSeg.id)}
                    disabled={isSubmitting || ["submitted", "generating", "reserved"].includes(selectedSeg.status)}
                    className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded font-medium transition-colors disabled:opacity-40"
                    style={{ background: "#4F46E5", color: "#fff" }}
                  >
                    {isSubmitting ? "Submitting..." : "▶ Re-generate"}
                  </button>
                </div>

                {/* Scene heading badge */}
                {(() => {
                  const scene = script.scenes.find(s => s.episodeNum === selectedSeg.episodeNum && s.sceneNum === selectedSeg.sceneNum)
                  return scene?.heading ? (
                    <div className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
                      {scene.heading}
                    </div>
                  ) : null
                })()}

                {/* Prompt editor with colored @mention overlay */}
                <div
                  className="relative rounded-lg transition-all"
                  style={{
                    border: isDragOver ? "2px dashed #4F46E5" : "1px solid #D0D0D0",
                    background: isDragOver ? "#EEF2FF" : "#EBEBEB",
                  }}
                >
                  {isDragOver && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg z-20 pointer-events-none"
                      style={{ background: "rgba(79,70,229,0.08)" }}>
                      <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg"
                        style={{ background: "#4F46E5", color: "#fff" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M12 5v14M5 12h14"/>
                        </svg>
                        <span className="text-[11px] font-medium">Drop here to insert</span>
                      </div>
                    </div>
                  )}
                  {/* Highlight overlay — renders colored @mentions behind the transparent textarea */}
                  <div
                    aria-hidden
                    className="absolute inset-0 p-3 text-[13px] leading-relaxed overflow-hidden whitespace-pre-wrap break-words pointer-events-none"
                    style={{ color: "#333", fontFamily: "inherit" }}
                  >
                    {renderHighlightedPrompt(editingPrompts[selectedSeg.id] ?? selectedSeg.prompt ?? "")}
                  </div>
                  <textarea
                    ref={promptRef}
                    value={editingPrompts[selectedSeg.id] ?? selectedSeg.prompt}
                    onChange={e => setEditingPrompts(prev => ({ ...prev, [selectedSeg.id]: e.target.value }))}
                    onDragOver={e => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = "copy"
                      setIsDragOver(true)
                      if (promptRef.current) dropPosRef.current = promptRef.current.selectionStart
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDragOver(false)
                      const data = e.dataTransfer.getData("text/plain")
                      if (data && selectedSeg) {
                        const current = editingPrompts[selectedSeg.id] ?? selectedSeg.prompt ?? ""
                        const pos = dropPosRef.current
                        const before = current.substring(0, pos)
                        const after = current.substring(pos)
                        const newValue = before + data + " " + after
                        setEditingPrompts(prev => ({ ...prev, [selectedSeg.id]: newValue }))
                        const newPos = pos + data.length + 1
                        requestAnimationFrame(() => {
                          if (promptRef.current) {
                            promptRef.current.focus()
                            promptRef.current.selectionStart = newPos
                            promptRef.current.selectionEnd = newPos
                          }
                        })
                      }
                    }}
                    rows={8}
                    className="relative z-10 w-full resize-none text-[13px] leading-relaxed p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    style={{ background: "transparent", color: "transparent", caretColor: "#333" }}
                    placeholder="Enter video description, or drag assets here..."
                  />
                </div>

                {/* ── Asset Tray: Draggable Elements ── */}
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #D8D8D8", background: "#fff" }}>
                  {/* Tab headers */}
                  <div className="flex" style={{ borderBottom: "1px solid #E8E8E8", background: "#F8F8F8" }}>
                    {([
                      { id: "characters" as const, icon: "👤", label: "Characters" },
                      { id: "locations" as const, icon: "🏞", label: "Locations" },
                      { id: "materials" as const, icon: "🎬", label: "Materials" },
                    ]).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setAssetTab(tab.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors relative"
                        style={{ color: assetTab === tab.id ? "#4F46E5" : "#999" }}
                      >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                        {assetTab === tab.id && (
                          <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t" style={{ background: "#4F46E5" }} />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Asset cards — photo-maximized with overlay labels */}
                  <div className="p-2 max-h-[300px] overflow-y-auto dev-scrollbar">
                    {/* ── Characters tab ── */}
                    {assetTab === "characters" && (() => {
                      const scene = script.scenes.find(s => s.episodeNum === selectedSeg.episodeNum && s.sceneNum === selectedSeg.sceneNum)
                      const sceneCharNames = new Set<string>()
                      if (scene?.action) {
                        try {
                          const blocks = JSON.parse(scene.action) as Array<{ type: string; character?: string }>
                          if (Array.isArray(blocks)) {
                            for (const b of blocks) if (b.type === "dialogue" && b.character) sceneCharNames.add(b.character.trim())
                          }
                        } catch { /* ok */ }
                      }
                      const sceneRoles = script.roles.filter(r =>
                        sceneCharNames.has(r.name) || sceneCharNames.has(r.name.toUpperCase()) ||
                        [...sceneCharNames].some(n => n.toUpperCase() === r.name.toUpperCase())
                      )
                      const otherRoles = script.roles.filter(r => !sceneRoles.includes(r))
                      const allRoles = [...sceneRoles, ...otherRoles]
                      return allRoles.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5">
                          {allRoles.map((role, idx) => {
                            const isInScene = idx < sceneRoles.length
                            return (
                              <div
                                key={role.id}
                                draggable
                                onDragStart={e => {
                                  e.dataTransfer.setData("text/plain", `@${role.name}`)
                                  e.dataTransfer.effectAllowed = "copy"
                                }}
                                onClick={() => insertAtCursor(selectedSeg.id, `@${role.name}`)}
                                className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-lg transition-all select-none group"
                                style={{ border: `2px solid ${isInScene ? "#818CF8" : "transparent"}` }}
                                title={`Drag to prompt to insert @${role.name}`}
                              >
                                {role.referenceImages?.[0] ? (
                                  <img src={role.referenceImages[0]} alt={role.name}
                                    className="w-full h-20 object-cover pointer-events-none group-hover:scale-105 transition-transform duration-200" />
                                ) : (
                                  <div className="w-full h-20 flex items-center justify-center text-lg font-bold pointer-events-none"
                                    style={{ background: "#E8E4FF", color: "#4F46E5" }}>
                                    {role.name[0]?.toUpperCase()}
                                  </div>
                                )}
                                {/* Overlay label at bottom */}
                                <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 pointer-events-none"
                                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                                  <span className="text-[8px] font-semibold text-white truncate block leading-tight">
                                    {role.name}
                                  </span>
                                </div>
                                {isInScene && (
                                  <div className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-[6px] font-semibold pointer-events-none"
                                    style={{ background: "rgba(99,102,241,0.85)", color: "#fff" }}>
                                    IN
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : <div className="py-4 text-center text-[10px]" style={{ color: "#CCC" }}>No character data</div>
                    })()}

                    {/* ── Locations tab ── */}
                    {assetTab === "locations" && (() => {
                      const scene = script.scenes.find(s => s.episodeNum === selectedSeg.episodeNum && s.sceneNum === selectedSeg.sceneNum)
                      const currentLoc = scene?.location
                      return script.locations.length > 0 ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {[...script.locations]
                            .sort((a, b) => (a.name === currentLoc ? -1 : b.name === currentLoc ? 1 : 0))
                            .map(loc => {
                              const isCurrent = loc.name === currentLoc
                              const photoUrl = loc.photos?.[0]?.url || loc.photoUrl
                              return (
                                <div
                                  key={loc.name}
                                  draggable
                                  onDragStart={e => {
                                    e.dataTransfer.setData("text/plain", `@${loc.name}`)
                                    e.dataTransfer.effectAllowed = "copy"
                                  }}
                                  onClick={() => insertAtCursor(selectedSeg.id, `@${loc.name}`)}
                                  className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-lg transition-all select-none group"
                                  style={{ border: `2px solid ${isCurrent ? "#34D399" : "transparent"}` }}
                                  title={`Drag to prompt to insert @${loc.name}`}
                                >
                                  {photoUrl ? (
                                    <img src={photoUrl} alt={loc.name}
                                      className="w-full h-28 object-cover pointer-events-none group-hover:scale-105 transition-transform duration-200" />
                                  ) : (
                                    <div className="w-full h-28 flex items-center justify-center pointer-events-none"
                                      style={{ background: "#FEE2E2" }}>
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2}>
                                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                                        <circle cx="12" cy="10" r="3"/>
                                      </svg>
                                    </div>
                                  )}
                                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 pointer-events-none"
                                    style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                                    <span className="text-[9px] font-semibold text-white truncate block leading-tight">
                                      {loc.name}
                                    </span>
                                  </div>
                                  {isCurrent && (
                                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded text-[7px] font-semibold pointer-events-none"
                                      style={{ background: "rgba(16,185,129,0.85)", color: "#fff" }}>
                                      NOW
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      ) : <div className="py-4 text-center text-[10px]" style={{ color: "#CCC" }}>No location data</div>
                    })()}

                    {/* ── Materials tab ── */}
                    {assetTab === "materials" && (() => {
                      const nearbySegs = epSegments
                        .filter(s => s.id !== selectedSeg.id && (s.thumbnailUrl || s.videoUrl))
                        .sort((a, b) =>
                          Math.abs(a.segmentIndex - selectedSeg.segmentIndex) -
                          Math.abs(b.segmentIndex - selectedSeg.segmentIndex)
                        )
                      const prevSeg = epSegments.find(s => s.segmentIndex === selectedSeg.segmentIndex - 1)
                      return nearbySegs.length > 0 ? (
                        <div className="space-y-2">
                          {prevSeg?.thumbnailUrl && useChainMode && (
                            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                              style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth={2}>
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                              </svg>
                              <span className="text-[8px]" style={{ color: "#C2410C" }}>
                                Chain Mode uses the last frame of previous segment as visual reference
                              </span>
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-1.5">
                            {nearbySegs.slice(0, 6).map(seg => {
                              const isPrev = seg.segmentIndex === selectedSeg.segmentIndex - 1
                              return (
                                <div
                                  key={seg.id}
                                  draggable
                                  onDragStart={e => {
                                    e.dataTransfer.setData("text/plain", `[Ref Seg#${seg.segmentIndex + 1}]`)
                                    e.dataTransfer.effectAllowed = "copy"
                                  }}
                                  onClick={() => insertAtCursor(selectedSeg.id, `[Ref Seg#${seg.segmentIndex + 1}]`)}
                                  className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-lg transition-all select-none group"
                                  style={{ border: `2px solid ${isPrev ? "#FB923C" : "transparent"}` }}
                                  title={`Segment #${seg.segmentIndex + 1}${isPrev ? " (Previous)" : ""}`}
                                >
                                  {seg.thumbnailUrl ? (
                                    <img src={seg.thumbnailUrl} alt=""
                                      className="w-full h-20 object-cover pointer-events-none group-hover:scale-105 transition-transform duration-200" />
                                  ) : (
                                    <div className="w-full h-20 flex items-center justify-center pointer-events-none"
                                      style={{ background: "#E8E8E8" }}>
                                      <span className="text-[10px] font-mono" style={{ color: "#AAA" }}>#{seg.segmentIndex + 1}</span>
                                    </div>
                                  )}
                                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 pointer-events-none"
                                    style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.65))" }}>
                                    <span className="text-[8px] font-mono font-semibold text-white">
                                      #{seg.segmentIndex + 1} {isPrev ? "Prev" : `${seg.durationSec}s`}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-[10px]" style={{ color: "#CCC" }}>
                          No other segment materials (generate other segments first)
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {selectedSeg.errorMessage && (
                <div className="p-2.5 rounded text-[11px] leading-relaxed" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                  <strong>Error:</strong> {selectedSeg.errorMessage}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </>}
    </div>

    {/* Generate confirm modal */}
    {showGenerateConfirm && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={() => setShowGenerateConfirm(false)}
      >
        <div
          className="w-80 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: "#FAFAFA", border: "1px solid #E0E0E0" }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-5 pt-5 pb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>AI Feature Confirmation</span>
            <p className="text-sm font-semibold mt-1" style={{ color: "#1A1A1A" }}>
              Generate {epSegments.length} Video Segment{epSegments.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="mx-5 mb-4 rounded-lg px-4 py-3" style={{ background: "#F0F0F0" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "#666" }}>Estimated Cost</span>
              <span className="text-sm font-bold" style={{ color: "#4F46E5" }}>~{estimatedCost} 🪙</span>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px]" style={{ color: "#666" }}>Current Balance</span>
              <span className="text-sm font-semibold" style={{ color: balance >= estimatedCost ? "#1A1A1A" : "#EF4444" }}>
                {balance} 🪙
              </span>
            </div>
            {balance < estimatedCost && (
              <p className="text-[11px] pt-1.5" style={{ color: "#EF4444" }}>
                Insufficient balance, need {estimatedCost - balance} 🪙 more. Please recharge
              </p>
            )}
          </div>
          <div className="px-5 pb-5 flex gap-2">
            <button
              onClick={() => setShowGenerateConfirm(false)}
              className="flex-1 h-9 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: "#E8E8E8", color: "#555" }}
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowGenerateConfirm(false); handleGenerate() }}
              disabled={balance < estimatedCost && estimatedCost > 0}
              className="flex-1 h-9 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              Confirm ~{estimatedCost} 🪙
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}
