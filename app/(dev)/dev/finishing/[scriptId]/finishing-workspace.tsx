"use client"

import { useState, useRef, useCallback } from "react"

interface VideoSegment {
  id: string
  episodeNum: number
  segmentIndex: number
  status: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  durationSec: number
}

interface Role {
  id: string
  name: string
  role: string
  referenceImages: string[]
}

interface Scene {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
}

interface PublishedScript {
  id: string
  status: string
  publishedAt: Date
}

interface FinishedVideo {
  url: string
  filename: string
  uploadedAt: string
}

interface FinishingMeta {
  finishedEpisodes?: Record<string, FinishedVideo>
  trailer?: FinishedVideo
  promo?: FinishedVideo
}

interface Script {
  id: string
  title: string
  genre: string
  logline?: string | null
  synopsis?: string | null
  coverTall?: string | null
  coverWide?: string | null
  targetEpisodes: number
  status: string
  metadata?: string | null
  scenes: Scene[]
  roles: Role[]
  videoSegments: VideoSegment[]
  published?: PublishedScript | null
}

interface Series {
  id: string
  title: string
  description?: string | null
  status: string
  viewCount: number
  coverTall?: string | null
}

export function FinishingWorkspace({ script, series }: { script: Script; series: Series | null }) {
  const episodes = [...new Set(script.scenes.map(s => s.episodeNum))].sort((a, b) => a - b)

  // Group done segments by episode
  const epMap = new Map<number, VideoSegment[]>()
  for (const seg of script.videoSegments) {
    if (!epMap.has(seg.episodeNum)) epMap.set(seg.episodeNum, [])
    epMap.get(seg.episodeNum)!.push(seg)
  }

  const totalDone = script.videoSegments.length
  const readyEpisodes = episodes.filter(ep => (epMap.get(ep)?.length ?? 0) > 0)

  // Parse finishing metadata (finished uploaded videos)
  const parsedMeta: FinishingMeta = (() => {
    try { return script.metadata ? JSON.parse(script.metadata) : {} } catch { return {} }
  })()

  const [finishedEps, setFinishedEps] = useState<Record<string, FinishedVideo>>(
    parsedMeta.finishedEpisodes || {}
  )
  const [trailer, setTrailer] = useState<FinishedVideo | null>(parsedMeta.trailer || null)
  const [promo, setPromo] = useState<FinishedVideo | null>(parsedMeta.promo || null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null) // ep number or "trailer"/"promo"
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string | null>(null)

  async function saveFinishingMeta(
    epMap2: Record<string, FinishedVideo>,
    tr: FinishedVideo | null,
    pr: FinishedVideo | null
  ) {
    // Merge with existing metadata to preserve other fields
    let existing: Record<string, unknown> = {}
    try { existing = script.metadata ? JSON.parse(script.metadata) : {} } catch { /* ok */ }
    const newMeta = JSON.stringify({
      ...existing,
      finishedEpisodes: epMap2,
      ...(tr ? { trailer: tr } : {}),
      ...(pr ? { promo: pr } : {}),
    })
    await fetch(`/api/scripts/${script.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: newMeta }),
    })
  }

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const target = uploadTargetRef.current
    if (!file || !target) return
    e.target.value = ""

    setUploadingFor(target)
    setUploadProgress(10)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("bucket", "finished-videos")
      const res = await fetch("/api/upload/media", { method: "POST", body: fd })
      setUploadProgress(80)
      if (!res.ok) { alert("Upload failed"); return }
      const data = await res.json()
      const video: FinishedVideo = { url: data.url, filename: file.name, uploadedAt: new Date().toISOString() }
      setUploadProgress(90)

      if (target === "trailer") {
        setTrailer(video)
        await saveFinishingMeta(finishedEps, video, promo)
      } else if (target === "promo") {
        setPromo(video)
        await saveFinishingMeta(finishedEps, trailer, video)
      } else {
        const newEps = { ...finishedEps, [target]: video }
        setFinishedEps(newEps)
        await saveFinishingMeta(newEps, trailer, promo)
      }
      setUploadProgress(100)
      setTimeout(() => setUploadProgress(0), 600)
    } finally {
      setUploadingFor(null)
    }
  }, [finishedEps, trailer, promo, script.id])

  function triggerUpload(target: string) {
    uploadTargetRef.current = target
    fileInputRef.current?.click()
  }

  const [tags, setTags] = useState<string[]>([script.genre].filter(Boolean))
  const [tagInput, setTagInput] = useState("")
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [publishedSeries, setPublishedSeries] = useState<Series | null>(series)
  const [editTitle, setEditTitle] = useState(script.title)
  const [editLogline, setEditLogline] = useState(script.logline || "")
  const [isSavingMeta, setIsSavingMeta] = useState(false)

  // Cover / poster state
  const [coverTall, setCoverTall] = useState<string | null>(script.coverTall || null)
  const [coverWide, setCoverWide] = useState<string | null>(script.coverWide || null)
  const [coverUploading, setCoverUploading] = useState<"tall" | "wide" | null>(null)
  const [coverGenerating, setCoverGenerating] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const coverTargetRef = useRef<"tall" | "wide">("tall")

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const target = coverTargetRef.current
    if (!file) return
    e.target.value = ""
    setCoverUploading(target)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("bucket", "covers")
      const res = await fetch("/api/upload/media", { method: "POST", body: fd })
      if (!res.ok) { alert("Upload failed"); return }
      const data = await res.json()
      const url = data.url as string
      // Save to DB
      const field = target === "tall" ? "coverTall" : "coverWide"
      const saveRes = await fetch(`/api/scripts/${script.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: url }),
      })
      if (!saveRes.ok) { alert("Failed to save cover"); return }
      if (target === "tall") setCoverTall(url)
      else setCoverWide(url)
    } catch (err) {
      alert("Upload error: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setCoverUploading(null)
    }
  }

  function triggerCoverUpload(target: "tall" | "wide") {
    coverTargetRef.current = target
    coverInputRef.current?.click()
  }

  async function handleAIGenerateCover() {
    setCoverGenerating(true)
    try {
      const res = await fetch("/api/cover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, episodeNum: 1 }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert("Cover generation failed: " + (d.error || res.statusText))
        return
      }
      const { tallTaskId } = await res.json()
      // Poll for result
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const statusRes = await fetch(`/api/cover/status?scriptId=${script.id}&tallTaskId=${encodeURIComponent(tallTaskId)}`)
        if (!statusRes.ok) continue
        const status = await statusRes.json()
        if (status.status === "done") {
          if (status.coverTall) setCoverTall(status.coverTall)
          return
        }
        if (status.status === "failed") {
          alert("Cover generation failed")
          return
        }
      }
      alert("Cover generation timed out")
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setCoverGenerating(false)
    }
  }

  async function removeCover(field: "tall" | "wide") {
    const key = field === "tall" ? "coverTall" : "coverWide"
    const res = await fetch(`/api/scripts/${script.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: null }),
    })
    if (!res.ok) { alert("Failed to remove cover"); return }
    if (field === "tall") setCoverTall(null)
    else setCoverWide(null)
  }

  async function saveScriptMeta() {
    setIsSavingMeta(true)
    try {
      await fetch(`/api/scripts/${script.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, logline: editLogline }),
      })
    } finally {
      setIsSavingMeta(false)
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput("")
  }

  async function handlePublish() {
    if (totalDone === 0) {
      setPublishResult({ ok: false, message: "No completed video segments found. Generate videos first." })
      return
    }
    if (!confirm(`Publish "${editTitle}" with ${readyEpisodes.length} episode(s)? This will create/update the Series on the platform.`)) return
    setIsPublishing(true)
    setPublishResult(null)
    try {
      const res = await fetch(`/api/scripts/${script.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, title: editTitle, logline: editLogline }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPublishResult({ ok: false, message: data.error || "Publish failed" })
      } else {
        setPublishResult({ ok: true, message: `Published! ${data.published} episode(s) uploaded to Mux.` })
        // Reload to get new series info
        setTimeout(() => window.location.reload(), 2000)
      }
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="h-full flex" style={{ background: "#E8E8E8" }}>
      {/* Left: Status + actions */}
      <div className="w-72 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Finishing</span>
        </div>

        <div className="flex-1 overflow-y-auto dev-scrollbar p-4 space-y-5">
          {/* Hidden file input for cover uploads */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverUpload}
          />

          {/* Script info */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Script</p>
            <div className="flex items-center gap-3">
              {coverTall ? (
                <img src={coverTall} alt="" className="w-12 h-16 rounded object-cover flex-shrink-0" style={{ border: "1px solid #C8C8C8" }} />
              ) : (
                <div className="w-12 h-16 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#D8D8D8" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#AAA" }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>{script.title}</p>
                <p className="text-[10px]" style={{ color: "#888" }}>{script.genre}</p>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block"
                  style={script.status === "published" ? { background: "#E0E7FF", color: "#3730A3" } :
                    script.status === "ready" ? { background: "#D1FAE5", color: "#065F46" } :
                    { background: "#F3F4F6", color: "#6B7280" }}
                >
                  {script.status}
                </span>
              </div>
            </div>
          </div>

          {/* Readiness */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Readiness</p>
            <div className="space-y-2">
              {[
                { label: "Script scenes", done: script.scenes.length > 0, detail: `${script.scenes.length} scenes` },
                { label: "Characters", done: script.roles.length > 0, detail: `${script.roles.length} roles` },
                { label: "Video segments", done: totalDone > 0, detail: `${totalDone} done segments` },
                { label: "Ready episodes", done: readyEpisodes.length > 0, detail: `${readyEpisodes.length}/${script.targetEpisodes} eps ready` },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: item.done ? "#D1FAE5" : "#F3F4F6" }}>
                    {item.done ? (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#CCC" }} />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-[11px]" style={{ color: item.done ? "#1A1A1A" : "#AAA" }}>{item.label}</span>
                    <span className="text-[10px] ml-1.5" style={{ color: "#AAA" }}>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Editable Metadata */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Metadata</p>
            <div className="space-y-2">
              <div>
                <label className="text-[9px] uppercase tracking-wider mb-0.5 block" style={{ color: "#BBB" }}>Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={saveScriptMeta}
                  className="w-full h-7 px-2 text-[11px] rounded focus:outline-none"
                  style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider mb-0.5 block" style={{ color: "#BBB" }}>Logline</label>
                <textarea
                  value={editLogline}
                  onChange={e => setEditLogline(e.target.value)}
                  onBlur={saveScriptMeta}
                  rows={2}
                  placeholder="One-line description..."
                  className="w-full px-2 py-1 text-[11px] rounded focus:outline-none resize-none"
                  style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
                />
              </div>
              {isSavingMeta && <p className="text-[9px]" style={{ color: "#AAA" }}>Saving...</p>}
            </div>
          </div>

          {/* Cover / Poster */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Cover / Poster</p>
            <div className="space-y-3">
              {/* Tall cover 3:4 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: "#BBB" }}>Vertical 3:4</span>
                  {coverTall && (
                    <button onClick={() => removeCover("tall")} className="text-[9px]" style={{ color: "#EF4444" }}>Remove</button>
                  )}
                </div>
                {coverTall ? (
                  <div className="relative group">
                    <img src={coverTall} alt="Cover 3:4" className="w-full rounded-lg object-cover" style={{ aspectRatio: "3/4", border: "1px solid #C8C8C8" }} />
                    <div className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.4)" }}>
                      <button
                        onClick={() => triggerCoverUpload("tall")}
                        disabled={!!coverUploading}
                        className="text-[10px] px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "#fff", color: "#1A1A1A" }}
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="w-full rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
                    style={{ aspectRatio: "3/4", background: "#E0E0E0", border: "2px dashed #C0C0C0" }}
                    onClick={() => triggerCoverUpload("tall")}
                  >
                    {coverUploading === "tall" ? (
                      <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#AAA" }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span className="text-[10px] mt-1" style={{ color: "#AAA" }}>Upload image</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Wide cover 16:9 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: "#BBB" }}>Horizontal 16:9</span>
                  {coverWide && (
                    <button onClick={() => removeCover("wide")} className="text-[9px]" style={{ color: "#EF4444" }}>Remove</button>
                  )}
                </div>
                {coverWide ? (
                  <div className="relative group">
                    <img src={coverWide} alt="Cover 16:9" className="w-full rounded-lg object-cover" style={{ aspectRatio: "16/9", border: "1px solid #C8C8C8" }} />
                    <div className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.4)" }}>
                      <button
                        onClick={() => triggerCoverUpload("wide")}
                        disabled={!!coverUploading}
                        className="text-[10px] px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "#fff", color: "#1A1A1A" }}
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="w-full rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
                    style={{ aspectRatio: "16/9", background: "#E0E0E0", border: "2px dashed #C0C0C0" }}
                    onClick={() => triggerCoverUpload("wide")}
                  >
                    {coverUploading === "wide" ? (
                      <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#AAA" }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span className="text-[10px] mt-1" style={{ color: "#AAA" }}>Upload image</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* AI Generate button */}
              <button
                onClick={handleAIGenerateCover}
                disabled={coverGenerating}
                className="w-full py-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
              >
                {coverGenerating ? (
                  <><div className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />Generating...</>
                ) : (
                  <>AI Generate Cover</>
                )}
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Tags</p>

            {/* Selected tags */}
            <div className="flex flex-wrap gap-1 mb-3">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
                  {tag}
                  <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="hover:opacity-70">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              ))}
              {tags.length === 0 && <span className="text-[10px]" style={{ color: "#CCC" }}>No tags selected</span>}
            </div>

            {/* Preset tag palette */}
            {([
              { group: "受众 Audience", tags: ["Female 女频", "Male 男频"] },
              { group: "情感 Romance", tags: ["Enemies to Lovers", "Love at First Sight", "Fated Lovers", "Forbidden", "Toxic Love", "Love-Hate", "Sweet Romance", "Second Chance", "Reunion", "Love After Divorce", "Campus Romance"] },
              { group: "人设 Character", tags: ["Strong Heroine 大女主", "Hidden Identity 隐藏身份", "Playing Dumb 扮猪吃虎"] },
              { group: "剧情 Plot", tags: ["Pregnancy 怀孕", "All-Too-Late 追悔莫及", "Tear-Jerker 催泪", "Feel-Good 轻松愉快"] },
              { group: "年龄 Age", tags: ["Young Adult 青春向"] },
            ] as const).map(({ group, tags: presets }) => (
              <div key={group} className="mb-2">
                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "#BBB" }}>{group}</p>
                <div className="flex flex-wrap gap-1">
                  {presets.map(preset => {
                    const active = tags.includes(preset)
                    return (
                      <button
                        key={preset}
                        onClick={() => setTags(prev => active ? prev.filter(t => t !== preset) : [...prev, preset])}
                        className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                        style={active
                          ? { background: "#4F46E5", color: "#fff" }
                          : { background: "#EBEBEB", color: "#666" }}
                      >
                        {preset}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Free-form custom tag */}
            <div className="flex gap-1 mt-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTag()}
                placeholder="Custom tag..."
                className="flex-1 h-7 px-2 text-[11px] rounded focus:outline-none"
                style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
              />
              <button onClick={addTag} className="text-[11px] px-2 py-1 rounded" style={{ background: "#E0E0E0", color: "#555" }}>+</button>
            </div>
          </div>

          {/* Publish button */}
          <div>
            <button
              onClick={handlePublish}
              disabled={isPublishing || totalDone === 0}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              {isPublishing ? "Publishing..." : script.published ? "Re-publish" : "Publish Series"}
            </button>
            {publishResult && (
              <div
                className="mt-2 p-2.5 rounded text-[11px] leading-relaxed"
                style={publishResult.ok ? { background: "#D1FAE5", color: "#065F46" } : { background: "#FEE2E2", color: "#991B1B" }}
              >
                {publishResult.message}
              </div>
            )}
          </div>

          {/* Series link if published */}
          {publishedSeries && (
            <div className="p-3 rounded-lg" style={{ background: "#E0E4F8", border: "1px solid #C7D2FE" }}>
              <p className="text-[10px] font-semibold mb-1" style={{ color: "#4F46E5" }}>Published Series</p>
              <p className="text-xs font-medium" style={{ color: "#1A1A1A" }}>{publishedSeries.title}</p>
              <p className="text-[10px]" style={{ color: "#888" }}>{publishedSeries.viewCount} views</p>
              <a
                href={`/series/${publishedSeries.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] mt-2 transition-colors"
                style={{ color: "#4F46E5" }}
              >
                View on platform →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Right: Episode overview */}
      <div className="flex-1 overflow-y-auto dev-scrollbar p-5">
        {/* Hidden file input for video uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="max-w-3xl mx-auto">
          <h2 className="text-sm font-semibold mb-1" style={{ color: "#1A1A1A" }}>Episode Overview</h2>
          <p className="text-[11px] mb-4" style={{ color: "#888" }}>
            {readyEpisodes.length} of {script.targetEpisodes} episodes ready · Upload finished edited videos below
          </p>

          <div className="space-y-3">
            {Array.from({ length: script.targetEpisodes }, (_, i) => i + 1).map(ep => {
              const epKey = String(ep)
              const epSegs = epMap.get(ep) ?? []
              const totalDur = epSegs.reduce((s, x) => s + x.durationSec, 0)
              const hasVideo = epSegs.length > 0
              const thumbnail = epSegs.find(s => s.thumbnailUrl)?.thumbnailUrl
              const finished = finishedEps[epKey]
              const isUploading = uploadingFor === epKey

              return (
                <div
                  key={ep}
                  className="p-3 rounded-lg"
                  style={{ background: finished ? "#F0F7FF" : hasVideo ? "#F5F5F5" : "#EDEDEE", border: `1px solid ${finished ? "#BDD8F5" : hasVideo ? "#D0D0D0" : "#E0E0E0"}` }}
                >
                  <div className="flex items-center gap-4">
                    {/* Thumbnail */}
                    <div className="w-20 h-12 rounded flex-shrink-0 overflow-hidden" style={{ background: "#D8D8D8" }}>
                      {thumbnail ? (
                        <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#BBB" }}>
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium" style={{ color: "#1A1A1A" }}>Episode {ep}</span>
                        {finished ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>✓ Finished</span>
                        ) : hasVideo ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#D1FAE5", color: "#065F46" }}>AI Ready</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#F3F4F6", color: "#6B7280" }}>No video</span>
                        )}
                      </div>
                      <p className="text-[10px]" style={{ color: "#AAA" }}>
                        {epSegs.length} AI segments · {totalDur}s
                      </p>
                      {/* Segment thumbnail strip */}
                      {epSegs.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {epSegs.slice(0, 8).map(seg => (
                            <div key={seg.id} className="w-8 h-5 rounded overflow-hidden flex-shrink-0" style={{ background: "#D8D8D8" }}>
                              {seg.thumbnailUrl ? (
                                <img src={seg.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full" style={{ background: "#E0E0E0" }} />
                              )}
                            </div>
                          ))}
                          {epSegs.length > 8 && (
                            <div className="w-8 h-5 rounded flex items-center justify-center text-[8px]" style={{ background: "#D8D8D8", color: "#888" }}>
                              +{epSegs.length - 8}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Upload section */}
                    <div className="flex-shrink-0 text-right">
                      {finished ? (
                        <div className="space-y-1">
                          <p className="text-[9px] truncate max-w-[120px]" style={{ color: "#4B5563" }} title={finished.filename}>
                            {finished.filename}
                          </p>
                          <div className="flex gap-1 justify-end">
                            <a href={finished.url} target="_blank" rel="noopener noreferrer"
                              className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
                              View
                            </a>
                            <button onClick={() => triggerUpload(epKey)}
                              className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#E5E7EB", color: "#555" }}>
                              Replace
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => triggerUpload(epKey)}
                          disabled={isUploading}
                          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                          style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
                        >
                          {isUploading ? (
                            <><div className="w-2.5 h-2.5 rounded-full border border-indigo-400 border-t-transparent animate-spin" />Uploading...</>
                          ) : (
                            <>↑ Upload</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Upload progress bar */}
                  {isUploading && uploadProgress > 0 && (
                    <div className="mt-2 w-full h-1 rounded-full overflow-hidden" style={{ background: "#D0D4E8" }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: "#4F46E5" }} />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Divider */}
            <div className="pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#AAA" }}>Promotional Media</p>
            </div>

            {/* Trailer slot */}
            {(() => {
              const isUploading = uploadingFor === "trailer"
              return (
                <div className="p-3 rounded-lg" style={{ background: trailer ? "#F0F7FF" : "#EDEDEE", border: `1px solid ${trailer ? "#BDD8F5" : "#E0E0E0"}` }}>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-12 rounded flex-shrink-0 flex items-center justify-center" style={{ background: "#D8D8D8" }}>
                      <span className="text-[9px] font-medium" style={{ color: "#888" }}>TRAILER</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-0.5" style={{ color: "#1A1A1A" }}>Trailer</p>
                      <p className="text-[10px]" style={{ color: "#AAA" }}>Short preview video (30–90 sec)</p>
                      {trailer && <p className="text-[9px] mt-0.5 truncate max-w-[200px]" style={{ color: "#4B5563" }}>{trailer.filename}</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {trailer ? (
                        <div className="flex gap-1">
                          <a href={trailer.url} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>View</a>
                          <button onClick={() => triggerUpload("trailer")}
                            className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#E5E7EB", color: "#555" }}>Replace</button>
                        </div>
                      ) : (
                        <button onClick={() => triggerUpload("trailer")} disabled={isUploading}
                          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded disabled:opacity-50"
                          style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}>
                          {isUploading ? <><div className="w-2.5 h-2.5 rounded-full border border-indigo-400 border-t-transparent animate-spin" />Uploading...</> : <>↑ Upload</>}
                        </button>
                      )}
                    </div>
                  </div>
                  {isUploading && uploadProgress > 0 && (
                    <div className="mt-2 w-full h-1 rounded-full overflow-hidden" style={{ background: "#D0D4E8" }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: "#4F46E5" }} />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Promo / Clip slot */}
            {(() => {
              const isUploading = uploadingFor === "promo"
              return (
                <div className="p-3 rounded-lg" style={{ background: promo ? "#F0F7FF" : "#EDEDEE", border: `1px solid ${promo ? "#BDD8F5" : "#E0E0E0"}` }}>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-12 rounded flex-shrink-0 flex items-center justify-center" style={{ background: "#D8D8D8" }}>
                      <span className="text-[9px] font-medium" style={{ color: "#888" }}>PROMO</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-0.5" style={{ color: "#1A1A1A" }}>切片 Promo Clip</p>
                      <p className="text-[10px]" style={{ color: "#AAA" }}>Short-form promo clip (15–60 sec)</p>
                      {promo && <p className="text-[9px] mt-0.5 truncate max-w-[200px]" style={{ color: "#4B5563" }}>{promo.filename}</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {promo ? (
                        <div className="flex gap-1">
                          <a href={promo.url} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>View</a>
                          <button onClick={() => triggerUpload("promo")}
                            className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#E5E7EB", color: "#555" }}>Replace</button>
                        </div>
                      ) : (
                        <button onClick={() => triggerUpload("promo")} disabled={isUploading}
                          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded disabled:opacity-50"
                          style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}>
                          {isUploading ? <><div className="w-2.5 h-2.5 rounded-full border border-indigo-400 border-t-transparent animate-spin" />Uploading...</> : <>↑ Upload</>}
                        </button>
                      )}
                    </div>
                  </div>
                  {isUploading && uploadProgress > 0 && (
                    <div className="mt-2 w-full h-1 rounded-full overflow-hidden" style={{ background: "#D0D4E8" }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: "#4F46E5" }} />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
