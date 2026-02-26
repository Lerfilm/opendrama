"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import Link from "next/link"

// ── Types ──────────────────────────────────────────

interface Role {
  id: string
  name: string
  role: string
  referenceImages: string[]
  avatarUrl?: string | null
}

interface LocationData {
  id: string
  name: string
  type: string
  photoUrl?: string | null
  parsedPhotos: { url: string; note?: string }[]
}

interface PropData {
  id: string
  name: string
  category: string
  photoUrl?: string | null
  parsedPhotos: { url: string; note?: string }[]
}

interface VideoSegment {
  id: string
  episodeNum: number
  segmentIndex: number
  sceneNum: number
  status: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  seedImageUrl?: string | null
  durationSec: number
}

interface RehearsalData {
  id: string
  prompt: string
  model: string
  resolution: string
  durationSec: number
  videoUrl?: string | null
  thumbnailUrl?: string | null
  createdAt: string
  completedAt?: string | null
}

interface Script {
  id: string
  title: string
  coverImage?: string | null
  coverWide?: string | null
  coverTall?: string | null
  metadata?: string | null
  roles: Role[]
  locations: LocationData[]
  props: PropData[]
  videoSegments: VideoSegment[]
  rehearsals?: RehearsalData[]
}

type AssetType = "all" | "character" | "location" | "prop" | "thumbnail" | "video" | "seed" | "cover" | "document" | "rehearsal"

interface Asset {
  id: string
  type: Exclude<AssetType, "all">
  url: string
  label: string
  bucket: string
  episodeNum?: number
  segmentIndex?: number
  sceneNum?: number
  roleId?: string
  roleName?: string
  locationId?: string
  propId?: string
  rehearsalId?: string
  rehearsalPrompt?: string
  rehearsalModel?: string
  rehearsalDuration?: number
  isBase64?: boolean
}

type BucketName = "role-images" | "scene-images" | "video-thumbs" | "seed-images" | "covers" | "props-images" | "scripts" | "video-assets"

const BUCKET_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  "role-images":   { label: "Characters", color: "#4F46E5", bg: "#EEF2FF" },
  "scene-images":  { label: "Locations",  color: "#10B981", bg: "#D1FAE5" },
  "video-thumbs":  { label: "Thumbnails", color: "#6366F1", bg: "#EDE9FE" },
  "seed-images":   { label: "Seeds",      color: "#F59E0B", bg: "#FEF3C7" },
  "covers":        { label: "Covers",     color: "#EC4899", bg: "#FCE7F3" },
  "props-images":  { label: "Props",      color: "#8B5CF6", bg: "#F5F3FF" },
  "scripts":       { label: "Scripts",    color: "#DC2626", bg: "#FEF2F2" },
  "video-assets":  { label: "Videos",     color: "#059669", bg: "#D1FAE5" },
  "rehearsal":     { label: "Rehearsal",  color: "#D97706", bg: "#FEF3C7" },
}

const UPLOAD_BUCKETS: BucketName[] = ["role-images", "scene-images", "video-thumbs", "seed-images", "covers", "props-images"]

const TYPE_FILTERS: { id: AssetType; label: string; icon: string }[] = [
  { id: "all",       label: "All",        icon: "⊞" },
  { id: "document",  label: "Scripts",    icon: "📋" },
  { id: "cover",     label: "Covers",     icon: "🎬" },
  { id: "character", label: "Characters", icon: "👤" },
  { id: "location",  label: "Locations",  icon: "📍" },
  { id: "prop",      label: "Props",      icon: "🎭" },
  { id: "thumbnail", label: "Thumbnails", icon: "🖼" },
  { id: "video",     label: "Videos",     icon: "▶" },
  { id: "rehearsal", label: "Rehearsal",  icon: "🧪" },
  { id: "seed",      label: "Seeds",      icon: "🌱" },
]

// ── Component ──────────────────────────────────────

export function MediaWorkspace({ script }: { script: Script }) {
  const [filterType, setFilterType] = useState<AssetType>("all")
  const [filterEp, setFilterEp] = useState<number | "all">("all")
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [uploadBucket, setUploadBucket] = useState<BucketName>("scene-images")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState("")

  // ── Build asset list ──

  const allAssets = useMemo<Asset[]>(() => {
    const list: Asset[] = []

    // Source PDF
    if (script.metadata) {
      try {
        const meta = JSON.parse(script.metadata)
        if (meta.pdfUrl) {
          list.push({ id: "source-pdf", type: "document", url: meta.pdfUrl, label: meta.pdfName || "Source Screenplay PDF", bucket: "scripts" })
        }
      } catch { /* ignore */ }
    }

    // Covers
    if (script.coverImage) list.push({ id: "cover-main", type: "cover", url: script.coverImage, label: "Cover", bucket: "covers", isBase64: script.coverImage.startsWith("data:") })
    if (script.coverWide)  list.push({ id: "cover-wide", type: "cover", url: script.coverWide,  label: "Cover 16:9", bucket: "covers", isBase64: script.coverWide.startsWith("data:") })
    if (script.coverTall)  list.push({ id: "cover-tall", type: "cover", url: script.coverTall,  label: "Cover 3:4", bucket: "covers", isBase64: script.coverTall.startsWith("data:") })

    // Characters
    for (const role of script.roles) {
      if (role.avatarUrl) list.push({ id: `avatar-${role.id}`, type: "character", url: role.avatarUrl, label: `${role.name} Avatar`, bucket: "role-images", roleId: role.id, roleName: role.name, isBase64: role.avatarUrl.startsWith("data:") })
      for (let i = 0; i < role.referenceImages.length; i++) {
        const url = role.referenceImages[i]
        list.push({ id: `ref-${role.id}-${i}`, type: "character", url, label: `${role.name} Ref #${i + 1}`, bucket: "role-images", roleId: role.id, roleName: role.name, isBase64: url.startsWith("data:") })
      }
    }

    // Locations
    for (const loc of (script.locations || [])) {
      if (loc.photoUrl) {
        list.push({ id: `loc-${loc.id}`, type: "location", url: loc.photoUrl, label: `${loc.type}. ${loc.name}`, bucket: "scene-images", locationId: loc.id, isBase64: loc.photoUrl.startsWith("data:") })
      }
      for (let i = 0; i < loc.parsedPhotos.length; i++) {
        const p = loc.parsedPhotos[i]
        if (p.url && p.url !== loc.photoUrl) {
          list.push({ id: `loc-photo-${loc.id}-${i}`, type: "location", url: p.url, label: `${loc.name} ${p.note || `#${i + 1}`}`, bucket: "scene-images", locationId: loc.id, isBase64: p.url.startsWith("data:") })
        }
      }
    }

    // Props
    for (const prop of (script.props || [])) {
      if (prop.photoUrl) {
        list.push({ id: `prop-${prop.id}`, type: "prop", url: prop.photoUrl, label: prop.name, bucket: "props-images", propId: prop.id, isBase64: prop.photoUrl.startsWith("data:") })
      }
      for (let i = 0; i < prop.parsedPhotos.length; i++) {
        const p = prop.parsedPhotos[i]
        if (p.url && p.url !== prop.photoUrl) {
          list.push({ id: `prop-photo-${prop.id}-${i}`, type: "prop", url: p.url, label: `${prop.name} ${p.note || `#${i + 1}`}`, bucket: "props-images", propId: prop.id, isBase64: p.url.startsWith("data:") })
        }
      }
    }

    // Video segments
    for (const seg of script.videoSegments) {
      const base = `Ep${seg.episodeNum} SC${String(seg.sceneNum).padStart(2, "0")} #${seg.segmentIndex + 1}`
      if (seg.thumbnailUrl) list.push({ id: `thumb-${seg.id}`, type: "thumbnail", url: seg.thumbnailUrl, label: `${base} Thumb`, bucket: "video-thumbs", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum, isBase64: seg.thumbnailUrl.startsWith("data:") })
      if (seg.videoUrl)     list.push({ id: `video-${seg.id}`, type: "video",     url: seg.videoUrl,     label: `${base} Video`, bucket: "video-assets", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum })
      if (seg.seedImageUrl) list.push({ id: `seed-${seg.id}`,  type: "seed",      url: seg.seedImageUrl, label: `${base} Seed`,  bucket: "seed-images", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum, isBase64: seg.seedImageUrl.startsWith("data:") })
    }

    // Rehearsal videos
    for (const reh of (script.rehearsals || [])) {
      if (reh.videoUrl) {
        const promptLabel = reh.prompt.length > 30 ? reh.prompt.substring(0, 30) + "…" : reh.prompt
        list.push({
          id: `rehearsal-${reh.id}`,
          type: "rehearsal",
          url: reh.videoUrl,
          label: `🧪 ${promptLabel}`,
          bucket: "rehearsal",
          rehearsalId: reh.id,
          rehearsalPrompt: reh.prompt,
          rehearsalModel: reh.model,
          rehearsalDuration: reh.durationSec,
        })
      }
    }

    return list
  }, [script])

  const episodes = useMemo(() =>
    [...new Set(script.videoSegments.map(s => s.episodeNum))].sort((a, b) => a - b),
    [script.videoSegments]
  )

  const filteredAssets = useMemo(() => {
    let list = allAssets
    if (filterType !== "all") list = list.filter(a => a.type === filterType)
    if (filterEp !== "all") list = list.filter(a => a.episodeNum === filterEp || a.episodeNum === undefined)
    return list
  }, [allAssets, filterType, filterEp])

  const stats = useMemo(() => ({
    character:  allAssets.filter(a => a.type === "character").length,
    location:   allAssets.filter(a => a.type === "location").length,
    prop:       allAssets.filter(a => a.type === "prop").length,
    thumbnail:  allAssets.filter(a => a.type === "thumbnail").length,
    video:      allAssets.filter(a => a.type === "video").length,
    rehearsal:  allAssets.filter(a => a.type === "rehearsal").length,
    seed:       allAssets.filter(a => a.type === "seed").length,
    cover:      allAssets.filter(a => a.type === "cover").length,
    base64:     allAssets.filter(a => a.isBase64).length,
    cloud:      allAssets.filter(a => !a.isBase64 && a.url.startsWith("http")).length,
  }), [allAssets])

  // ── Handlers ──

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setUploadError(null)
    setUploadedUrl(null)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("bucket", uploadBucket)
      const res = await fetch("/api/upload/media", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      setUploadedUrl(data.url)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function copyUrl(id: string, url: string) {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── Selection ──

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    const ids = filteredAssets.filter(a => !a.isBase64 && a.type !== "document").map(a => a.id)
    setSelectedIds(new Set(ids))
  }, [filteredAssets])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // ── Download ──

  const downloadSingleFile = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    } catch (err) {
      console.error(`Failed to download ${filename}:`, err)
    }
  }, [])

  const sanitizeFilename = useCallback((label: string, url: string) => {
    const clean = label.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff ]/g, "").replace(/\s+/g, "_")
    // Try to get extension from URL
    const urlPath = url.split("?")[0]
    const ext = urlPath.match(/\.(jpg|jpeg|png|webp|gif|mp4|mov|pdf)$/i)?.[0] || ".png"
    return clean + ext
  }, [])

  const handleBatchDownload = useCallback(async () => {
    const toDownload = filteredAssets.filter(a => selectedIds.has(a.id) && !a.isBase64)
    if (toDownload.length === 0) return

    setIsDownloading(true)
    setDownloadProgress(`0 / ${toDownload.length}`)

    // Group by type for organized filenames
    const typeCounters: Record<string, number> = {}

    for (let i = 0; i < toDownload.length; i++) {
      const asset = toDownload[i]
      const typeKey = asset.type
      typeCounters[typeKey] = (typeCounters[typeKey] || 0) + 1

      const filename = sanitizeFilename(asset.label, asset.url)
      setDownloadProgress(`${i + 1} / ${toDownload.length}: ${filename}`)
      await downloadSingleFile(asset.url, filename)

      // Small delay between downloads to avoid browser throttling
      if (i < toDownload.length - 1) {
        await new Promise(r => setTimeout(r, 300))
      }
    }

    setIsDownloading(false)
    setDownloadProgress("")
    setSelectedIds(new Set())
  }, [filteredAssets, selectedIds, sanitizeFilename, downloadSingleFile])

  const handleDownloadAll = useCallback(async (type: AssetType) => {
    const toDownload = allAssets.filter(a => {
      if (type !== "all" && a.type !== type) return false
      if (a.isBase64 || a.type === "document") return false
      return true
    })
    if (toDownload.length === 0) return

    setIsDownloading(true)
    for (let i = 0; i < toDownload.length; i++) {
      const asset = toDownload[i]
      const filename = sanitizeFilename(asset.label, asset.url)
      setDownloadProgress(`${i + 1} / ${toDownload.length}: ${filename}`)
      await downloadSingleFile(asset.url, filename)
      if (i < toDownload.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    setIsDownloading(false)
    setDownloadProgress("")
  }, [allAssets, sanitizeFilename, downloadSingleFile])

  const selectedCount = selectedIds.size
  const downloadableSelected = filteredAssets.filter(a => selectedIds.has(a.id) && !a.isBase64 && a.type !== "document").length

  // ── Render ──

  return (
    <div className="h-full flex flex-col" style={{ background: "#F0F0F0" }}>

      {/* Header */}
      <div className="px-5 py-3 flex items-center gap-4 flex-shrink-0" style={{ background: "#EBEBEB", borderBottom: "1px solid #C8C8C8" }}>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#AAA" }}>Media Library</p>
          <p className="text-[13px] font-bold" style={{ color: "#1A1A1A" }}>{script.title}</p>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {[
            { label: "Characters", val: stats.character, color: "#4F46E5" },
            { label: "Locations",  val: stats.location,  color: "#10B981" },
            { label: "Props",      val: stats.prop,      color: "#8B5CF6" },
            { label: "Videos",     val: stats.video,     color: "#059669" },
            { label: "Rehearsal",  val: stats.rehearsal, color: "#D97706" },
            { label: "Thumbs",     val: stats.thumbnail, color: "#6366F1" },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1">
              <span className="text-[12px] font-bold" style={{ color: s.color }}>{s.val}</span>
              <span className="text-[10px]" style={{ color: "#AAA" }}>{s.label}</span>
            </div>
          ))}
          <div className="w-px h-4" style={{ background: "#D0D0D0" }} />
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: stats.base64 > 0 ? "#F59E0B" : "#10B981" }} />
            <span className="text-[10px]" style={{ color: "#888" }}>
              {stats.cloud} cloud · {stats.base64} local
            </span>
          </div>
        </div>
        <div className="flex-1" />

        {/* Batch download bar */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
            <span className="text-[11px] font-medium" style={{ color: "#4F46E5" }}>
              {selectedCount} selected
            </span>
            <button
              onClick={handleBatchDownload}
              disabled={isDownloading || downloadableSelected === 0}
              className="px-2.5 py-1 rounded text-[10px] font-semibold disabled:opacity-50"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              {isDownloading ? "Downloading..." : `↓ Download ${downloadableSelected}`}
            </button>
            <button
              onClick={clearSelection}
              className="px-2 py-1 rounded text-[10px] font-medium"
              style={{ background: "#E0E7FF", color: "#4F46E5" }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Download progress */}
        {isDownloading && downloadProgress && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]"
            style={{ background: "#D1FAE5", border: "1px solid #A7F3D0", color: "#065F46" }}>
            ↓ {downloadProgress}
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar: filters + upload + batch actions */}
        <div className="w-52 flex flex-col flex-shrink-0 overflow-y-auto dev-scrollbar" style={{ background: "#EBEBEB", borderRight: "1px solid #C8C8C8" }}>

          {/* Type filter */}
          <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid #D8D8D8" }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Filter by Type</p>
            <div className="space-y-0.5">
              {TYPE_FILTERS.map(f => {
                const count = f.id === "all" ? allAssets.length : allAssets.filter(a => a.type === f.id).length
                return (
                  <button
                    key={f.id}
                    onClick={() => { setFilterType(f.id); setSelectedIds(new Set()) }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors"
                    style={{
                      background: filterType === f.id ? "#DCE0F5" : "transparent",
                      color: filterType === f.id ? "#1A1A1A" : "#666",
                      borderLeft: filterType === f.id ? "2px solid #4F46E5" : "2px solid transparent",
                    }}
                  >
                    <span>{f.icon}</span>
                    <span className="font-medium">{f.label}</span>
                    <span className="ml-auto text-[9px]" style={{ color: "#AAA" }}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Episode filter */}
          {episodes.length > 0 && (
            <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid #D8D8D8" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Episode</p>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setFilterEp("all")}
                  className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: filterEp === "all" ? "#4F46E5" : "#E0E0E0", color: filterEp === "all" ? "#fff" : "#666" }}
                >All</button>
                {episodes.map(ep => (
                  <button
                    key={ep}
                    onClick={() => setFilterEp(ep)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: filterEp === ep ? "#4F46E5" : "#E0E0E0", color: filterEp === ep ? "#fff" : "#666" }}
                  >Ep {ep}</button>
                ))}
              </div>
            </div>
          )}

          {/* Batch Download Presets */}
          <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid #D8D8D8" }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Batch Download</p>
            <div className="space-y-1">
              <button
                onClick={selectAll}
                className="w-full py-1 rounded text-[10px] font-medium"
                style={{ background: "#E0E7FF", color: "#4F46E5" }}
              >
                Select All Visible ({filteredAssets.filter(a => !a.isBase64 && a.type !== "document").length})
              </button>
              {(["character", "location", "prop", "video"] as const).map(t => {
                const count = allAssets.filter(a => a.type === t && !a.isBase64).length
                if (count === 0) return null
                const labels: Record<string, string> = { character: "All Characters", location: "All Locations", prop: "All Props", video: "All Videos" }
                return (
                  <button
                    key={t}
                    onClick={() => handleDownloadAll(t)}
                    disabled={isDownloading}
                    className="w-full py-1 rounded text-[10px] font-medium disabled:opacity-50"
                    style={{ background: "#F0F0F0", color: "#555" }}
                  >
                    ↓ {labels[t]} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Upload panel */}
          <div className="px-3 py-2.5 flex flex-col gap-2 flex-shrink-0">
            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#AAA" }}>Upload</p>
            <select
              value={uploadBucket}
              onChange={e => setUploadBucket(e.target.value as BucketName)}
              className="w-full text-[10px] rounded px-2 py-1.5 focus:outline-none"
              style={{ background: "#E0E0E0", border: "1px solid #C8C8C8", color: "#555" }}
            >
              {UPLOAD_BUCKETS.map(b => (
                <option key={b} value={b}>{BUCKET_LABELS[b]?.label || b}</option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              {isUploading ? "Uploading..." : "↑ Choose File"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
            {uploadError && <p className="text-[10px] leading-4" style={{ color: "#EF4444" }}>{uploadError}</p>}
            {uploadedUrl && (
              <div className="rounded p-2" style={{ background: "#D1FAE5", border: "1px solid #A7F3D0" }}>
                <p className="text-[9px] font-semibold mb-1" style={{ color: "#065F46" }}>✓ Uploaded</p>
                <button
                  onClick={() => copyUrl("upload", uploadedUrl)}
                  className="mt-1 text-[9px] px-2 py-0.5 rounded"
                  style={{ background: "#10B981", color: "#fff" }}
                >
                  {copiedId === "upload" ? "Copied!" : "Copy URL"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main grid */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto dev-scrollbar p-4">
            {filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48" style={{ color: "#CCC" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-40">
                  <rect width="18" height="18" x="3" y="3" rx="2"/>
                  <path d="M3 9h18M9 3v18"/>
                </svg>
                <p className="text-sm">No assets found</p>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {filteredAssets.map(asset => {
                  const isSelected = selectedAsset?.id === asset.id
                  const isChecked = selectedIds.has(asset.id)
                  const bucketInfo = BUCKET_LABELS[asset.bucket]
                  const canDownload = !asset.isBase64 && asset.type !== "document"

                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAsset(isSelected ? null : asset)}
                      className="rounded-lg overflow-hidden cursor-pointer transition-all group"
                      style={{
                        background: "#fff",
                        border: isChecked ? "2px solid #4F46E5" : isSelected ? "2px solid #818CF8" : "1px solid #E0E0E0",
                        boxShadow: isChecked ? "0 0 0 2px #C7D2FE" : "none",
                      }}
                    >
                      {/* Thumbnail */}
                      <div className="relative bg-gray-100" style={{ aspectRatio: "16/10", background: "#E8E8E8" }}>
                        {(asset.type === "video" || asset.type === "rehearsal") ? (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: asset.type === "rehearsal" ? "#2D1B00" : "#1A1A1A" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" opacity={0.5}>
                              <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            {asset.type === "rehearsal" && (
                              <span className="absolute top-1 left-1 text-[7px] px-1 py-0.5 rounded font-bold" style={{ background: "#D97706", color: "#fff" }}>🧪</span>
                            )}
                          </div>
                        ) : asset.type === "document" ? (
                          <a href={asset.url} target="_blank" rel="noopener noreferrer"
                            className="w-full h-full flex flex-col items-center justify-center gap-1 hover:opacity-80 transition-opacity"
                            style={{ background: "#FEF2F2" }}
                            onClick={e => e.stopPropagation()}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={1.5}>
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <path d="M9 15h6M9 11h3"/>
                            </svg>
                            <span className="text-[8px] font-bold" style={{ color: "#DC2626" }}>PDF</span>
                          </a>
                        ) : (
                          <img src={asset.url} alt={asset.label} className="w-full h-full object-cover" style={{ display: "block" }} loading="lazy" />
                        )}

                        {/* Checkbox for batch select */}
                        {canDownload && (
                          <button
                            onClick={e => toggleSelect(asset.id, e)}
                            className="absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center transition-all"
                            style={{
                              background: isChecked ? "#4F46E5" : "rgba(255,255,255,0.85)",
                              border: isChecked ? "none" : "1.5px solid #C0C0C0",
                              opacity: isChecked ? 1 : 0,
                            }}
                            onMouseEnter={e => { if (!isChecked) (e.currentTarget.style.opacity = "1") }}
                            onMouseLeave={e => { if (!isChecked) (e.currentTarget.style.opacity = "0") }}
                          >
                            {isChecked && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </button>
                        )}

                        {/* Storage badge */}
                        <div className="absolute top-1 right-1">
                          {asset.isBase64 ? (
                            <span className="text-[7px] px-1 py-0.5 rounded font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>local</span>
                          ) : (
                            <span className="text-[7px] px-1 py-0.5 rounded font-medium" style={{ background: "#D1FAE5", color: "#065F46" }}>R2</span>
                          )}
                        </div>

                        {/* Hover actions */}
                        <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canDownload && (
                            <button
                              onClick={e => { e.stopPropagation(); downloadSingleFile(asset.url, sanitizeFilename(asset.label, asset.url)) }}
                              className="text-[8px] px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                            >↓</button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); copyUrl(asset.id, asset.url) }}
                            className="text-[8px] px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                          >
                            {copiedId === asset.id ? "✓" : "URL"}
                          </button>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] font-medium truncate" style={{ color: "#1A1A1A" }}>{asset.label}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {bucketInfo && (
                            <span className="text-[8px] px-1 py-0 rounded" style={{ background: bucketInfo.bg, color: bucketInfo.color }}>
                              {bucketInfo.label}
                            </span>
                          )}
                          {asset.episodeNum != null && (
                            <span className="text-[8px]" style={{ color: "#BBB" }}>Ep{asset.episodeNum}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Asset detail */}
        {selectedAsset && (
          <div className="w-64 flex flex-col flex-shrink-0 overflow-y-auto dev-scrollbar" style={{ background: "#FAFAFA", borderLeft: "1px solid #D8D8D8" }}>
            {/* Preview */}
            <div className="relative" style={{ background: "#1A1A1A", aspectRatio: "1" }}>
              {(selectedAsset.type === "video" || selectedAsset.type === "rehearsal") ? (
                <video src={selectedAsset.url} controls className="w-full h-full object-contain" style={{ display: "block" }} />
              ) : selectedAsset.type === "document" ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: "#1A1A1A" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={1}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M9 15h6M9 11h6M9 7h3"/>
                  </svg>
                  <a href={selectedAsset.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] px-3 py-1.5 rounded font-medium"
                    style={{ background: "#DC2626", color: "#fff" }}>
                    Open PDF
                  </a>
                </div>
              ) : (
                <img src={selectedAsset.url} alt={selectedAsset.label} className="w-full h-full object-contain" style={{ display: "block" }} />
              )}
            </div>

            <div className="p-3 space-y-3">
              <div>
                <p className="text-[10px] font-bold" style={{ color: "#1A1A1A" }}>{selectedAsset.label}</p>
                <p className="text-[9px] mt-0.5" style={{ color: "#AAA" }}>
                  {selectedAsset.isBase64 ? "Local (base64)" : "Cloudflare R2"}
                </p>
              </div>

              {/* Metadata */}
              <div className="space-y-1">
                {[
                  ["Type", selectedAsset.type],
                  ["Bucket", selectedAsset.bucket],
                  selectedAsset.roleName ? ["Character", selectedAsset.roleName] : null,
                  selectedAsset.episodeNum != null ? ["Episode", `Ep ${selectedAsset.episodeNum}`] : null,
                  selectedAsset.sceneNum != null ? ["Scene", `SC${String(selectedAsset.sceneNum).padStart(2, "0")}`] : null,
                  selectedAsset.rehearsalModel ? ["Model", selectedAsset.rehearsalModel] : null,
                  selectedAsset.rehearsalDuration ? ["Duration", `${selectedAsset.rehearsalDuration}s`] : null,
                ].filter((x): x is [string, string] => x !== null).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[9px]" style={{ color: "#AAA" }}>{k}</span>
                    <span className="text-[9px] font-medium" style={{ color: "#555" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Rehearsal prompt */}
              {selectedAsset.rehearsalPrompt && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#AAA" }}>Prompt</p>
                  <div className="rounded p-2 text-[9px] leading-4" style={{ background: "#FEF3C7", color: "#78350F", maxHeight: 80, overflowY: "auto" }}>
                    {selectedAsset.rehearsalPrompt}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-1.5">
                {!selectedAsset.isBase64 && selectedAsset.type !== "document" && (
                  <button
                    onClick={() => downloadSingleFile(selectedAsset.url, sanitizeFilename(selectedAsset.label, selectedAsset.url))}
                    className="w-full py-1.5 rounded text-[10px] font-semibold"
                    style={{ background: "#10B981", color: "#fff" }}
                  >
                    ↓ Download
                  </button>
                )}
                <button
                  onClick={() => copyUrl(selectedAsset.id + "-detail", selectedAsset.url)}
                  className="w-full py-1.5 rounded text-[10px] font-medium"
                  style={{ background: copiedId === selectedAsset.id + "-detail" ? "#10B981" : "#4F46E5", color: "#fff" }}
                >
                  {copiedId === selectedAsset.id + "-detail" ? "✓ Copied!" : "Copy URL"}
                </button>
                {!selectedAsset.isBase64 && (
                  <a
                    href={selectedAsset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1"
                    style={{ background: "#F0F0F0", color: "#666", display: "flex" }}
                  >
                    Open in new tab
                  </a>
                )}
              </div>

              {/* URL preview */}
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#AAA" }}>URL</p>
                <div className="rounded p-2 text-[8px] font-mono break-all leading-4" style={{ background: "#F0F0F0", color: "#666", maxHeight: 64, overflow: "hidden" }}>
                  {selectedAsset.url.startsWith("data:") ? `base64 (${Math.round(selectedAsset.url.length / 1024)}KB)` : selectedAsset.url}
                </div>
              </div>

              {/* Navigation links */}
              {selectedAsset.roleId && (
                <Link href={`/dev/casting/${script.id}`}
                  className="w-full py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1"
                  style={{ background: "#EEF2FF", color: "#4F46E5" }}>
                  Edit in Casting
                </Link>
              )}
              {selectedAsset.locationId && (
                <Link href={`/dev/location/${script.id}`}
                  className="w-full py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1"
                  style={{ background: "#D1FAE5", color: "#065F46" }}>
                  Edit in Locations
                </Link>
              )}
              {selectedAsset.propId && (
                <Link href={`/dev/props/${script.id}`}
                  className="w-full py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1"
                  style={{ background: "#F5F3FF", color: "#6D28D9" }}>
                  Edit in Props
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
