"use client"

import { useState, useMemo, useRef } from "react"
import Link from "next/link"

interface Role {
  id: string
  name: string
  role: string
  referenceImages: string[]
  avatarUrl?: string | null
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
  prompt: string
}

interface Script {
  id: string
  title: string
  coverImage?: string | null
  coverWide?: string | null
  coverTall?: string | null
  metadata?: string | null
  roles: Role[]
  videoSegments: VideoSegment[]
}

type AssetType = "all" | "character" | "thumbnail" | "video" | "seed" | "cover" | "document"
type BucketName = "role-images" | "scene-images" | "video-thumbs" | "seed-images" | "covers" | "props-images" | "scripts"

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
  isBase64?: boolean
}

const BUCKET_LABELS: Record<BucketName, { label: string; color: string; bg: string }> = {
  "role-images":   { label: "Characters", color: "#4F46E5", bg: "#EEF2FF" },
  "scene-images":  { label: "Scenes",     color: "#10B981", bg: "#D1FAE5" },
  "video-thumbs":  { label: "Thumbnails", color: "#6366F1", bg: "#EDE9FE" },
  "seed-images":   { label: "Seeds",      color: "#F59E0B", bg: "#FEF3C7" },
  "covers":        { label: "Covers",     color: "#EC4899", bg: "#FCE7F3" },
  "props-images":  { label: "Props",      color: "#8B5CF6", bg: "#F5F3FF" },
  "scripts":       { label: "Scripts",    color: "#DC2626", bg: "#FEF2F2" },
}

const UPLOAD_BUCKETS: BucketName[] = ["role-images", "scene-images", "video-thumbs", "seed-images", "covers", "props-images"]

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

  // Build asset list from script data
  const allAssets = useMemo<Asset[]>(() => {
    const list: Asset[] = []

    // Source PDF from metadata
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
        list.push({ id: `ref-${role.id}-${i}`, type: "character", url, label: `${role.name} #${i + 1}`, bucket: "role-images", roleId: role.id, roleName: role.name, isBase64: url.startsWith("data:") })
      }
    }

    // Video segments
    for (const seg of script.videoSegments) {
      const base = `Ep${seg.episodeNum} SC${String(seg.sceneNum).padStart(2,"0")} #${seg.segmentIndex + 1}`
      if (seg.thumbnailUrl) list.push({ id: `thumb-${seg.id}`, type: "thumbnail", url: seg.thumbnailUrl, label: `${base} Thumb`, bucket: "video-thumbs", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum, isBase64: seg.thumbnailUrl.startsWith("data:") })
      if (seg.videoUrl)     list.push({ id: `video-${seg.id}`, type: "video",     url: seg.videoUrl,     label: `${base} Video`, bucket: "video-assets", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum })
      if (seg.seedImageUrl) list.push({ id: `seed-${seg.id}`,  type: "seed",      url: seg.seedImageUrl, label: `${base} Seed`,  bucket: "seed-images", episodeNum: seg.episodeNum, segmentIndex: seg.segmentIndex, sceneNum: seg.sceneNum, isBase64: seg.seedImageUrl.startsWith("data:") })
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
    character: allAssets.filter(a => a.type === "character").length,
    thumbnail: allAssets.filter(a => a.type === "thumbnail").length,
    video: allAssets.filter(a => a.type === "video").length,
    seed: allAssets.filter(a => a.type === "seed").length,
    cover: allAssets.filter(a => a.type === "cover").length,
    base64: allAssets.filter(a => a.isBase64).length,
    supabase: allAssets.filter(a => !a.isBase64 && a.url.startsWith("http")).length,
  }), [allAssets])

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

  const TYPE_FILTERS: { id: AssetType; label: string; icon: string }[] = [
    { id: "all",       label: "All",        icon: "⊞" },
    { id: "document",  label: "Scripts",    icon: "📋" },
    { id: "character", label: "Characters", icon: "👤" },
    { id: "thumbnail", label: "Thumbnails", icon: "🖼" },
    { id: "video",     label: "Videos",     icon: "▶" },
    { id: "seed",      label: "Seeds",      icon: "🌱" },
    { id: "cover",     label: "Covers",     icon: "📄" },
  ]

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
            { label: "Thumbnails", val: stats.thumbnail, color: "#6366F1" },
            { label: "Videos",     val: stats.video,     color: "#10B981" },
            { label: "Seeds",      val: stats.seed,      color: "#F59E0B" },
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
              {stats.supabase} in Supabase · {stats.base64} local
            </span>
          </div>
        </div>
        <div className="flex-1" />
        {stats.base64 > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]"
            style={{ background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E" }}>
            ⚠ {stats.base64} assets stored as base64 — configure SUPABASE_SERVICE_ROLE_KEY to use cloud storage
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar: filters + upload */}
        <div className="w-52 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C8C8C8" }}>

          {/* Type filter */}
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #D8D8D8" }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Filter by Type</p>
            <div className="space-y-0.5">
              {TYPE_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors"
                  style={{
                    background: filterType === f.id ? "#DCE0F5" : "transparent",
                    color: filterType === f.id ? "#1A1A1A" : "#666",
                    borderLeft: filterType === f.id ? "2px solid #4F46E5" : "2px solid transparent",
                  }}
                >
                  <span>{f.icon}</span>
                  <span className="font-medium">{f.label}</span>
                  <span className="ml-auto text-[9px]" style={{ color: "#AAA" }}>
                    {f.id === "all" ? allAssets.length : allAssets.filter(a => a.type === f.id).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Episode filter */}
          {episodes.length > 0 && (
            <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #D8D8D8" }}>
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

          {/* Upload panel */}
          <div className="px-3 py-2.5 flex flex-col gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#AAA" }}>Upload to Storage</p>
            <select
              value={uploadBucket}
              onChange={e => setUploadBucket(e.target.value as BucketName)}
              className="w-full text-[10px] rounded px-2 py-1.5 focus:outline-none"
              style={{ background: "#E0E0E0", border: "1px solid #C8C8C8", color: "#555" }}
            >
              {UPLOAD_BUCKETS.map(b => (
                <option key={b} value={b}>{BUCKET_LABELS[b]?.label || b} ({b})</option>
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
                <p className="text-[9px] font-semibold mb-1" style={{ color: "#065F46" }}>✓ Uploaded!</p>
                <p className="text-[8px] break-all font-mono" style={{ color: "#065F46" }}>{uploadedUrl.slice(0, 60)}...</p>
                <button
                  onClick={() => copyUrl("upload", uploadedUrl)}
                  className="mt-1 text-[9px] px-2 py-0.5 rounded"
                  style={{ background: "#10B981", color: "#fff" }}
                >
                  {copiedId === "upload" ? "Copied!" : "Copy URL"}
                </button>
              </div>
            )}

            {/* Bucket links */}
            <div className="mt-1">
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#AAA" }}>Storage Buckets</p>
              {UPLOAD_BUCKETS.map(b => {
                const info = BUCKET_LABELS[b]
                return (
                  <div key={b} className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                    <span className="text-[9px]" style={{ color: "#666" }}>{b}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Grid */}
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
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {filteredAssets.map(asset => {
                  const isSelected = selectedAsset?.id === asset.id
                  const bucketInfo = BUCKET_LABELS[asset.bucket as BucketName]
                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAsset(isSelected ? null : asset)}
                      className="rounded-lg overflow-hidden cursor-pointer transition-all group"
                      style={{
                        background: "#fff",
                        border: isSelected ? "2px solid #4F46E5" : "1px solid #E0E0E0",
                        boxShadow: isSelected ? "0 0 0 2px #C7D2FE" : "none",
                      }}
                    >
                      {/* Thumbnail */}
                      <div className="relative bg-gray-100" style={{ aspectRatio: "16/10", background: "#E8E8E8" }}>
                        {asset.type === "video" ? (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "#1A1A1A" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" opacity={0.5}>
                              <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
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
                          <img
                            src={asset.url}
                            alt={asset.label}
                            className="w-full h-full object-cover"
                            style={{ display: "block" }}
                            loading="lazy"
                          />
                        )}
                        {/* Storage badge */}
                        <div className="absolute top-1 right-1">
                          {asset.isBase64 ? (
                            <span className="text-[7px] px-1 py-0.5 rounded font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>local</span>
                          ) : (
                            <span className="text-[7px] px-1 py-0.5 rounded font-medium" style={{ background: "#D1FAE5", color: "#065F46" }}>☁</span>
                          )}
                        </div>
                        {/* Copy button on hover */}
                        <button
                          onClick={e => { e.stopPropagation(); copyUrl(asset.id, asset.url) }}
                          className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[8px] px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                        >
                          {copiedId === asset.id ? "✓" : "Copy URL"}
                        </button>
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
                          {asset.episodeNum && (
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
              {selectedAsset.type === "video" ? (
                <video src={selectedAsset.url} controls className="w-full h-full object-contain" style={{ display: "block" }} />
              ) : selectedAsset.type === "document" ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: "#1A1A1A" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={1}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M9 15h6M9 11h6M9 7h3"/>
                  </svg>
                  <span className="text-[10px] font-bold" style={{ color: "#DC2626" }}>PDF</span>
                  <a href={selectedAsset.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] px-3 py-1.5 rounded font-medium"
                    style={{ background: "#DC2626", color: "#fff" }}>
                    ↗ Open PDF
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
                  {selectedAsset.isBase64 ? "📦 Local (base64)" : "☁ Supabase Storage"}
                </p>
              </div>

              {/* Metadata */}
              <div className="space-y-1">
                {[
                  ["Type", selectedAsset.type],
                  ["Bucket", selectedAsset.bucket],
                  selectedAsset.roleName ? ["Character", selectedAsset.roleName] : null,
                  selectedAsset.episodeNum ? ["Episode", `Ep ${selectedAsset.episodeNum}`] : null,
                  selectedAsset.sceneNum ? ["Scene", `SC${String(selectedAsset.sceneNum).padStart(2,"0")}`] : null,
                ].filter((x): x is [string, string] => x !== null).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[9px]" style={{ color: "#AAA" }}>{k}</span>
                    <span className="text-[9px] font-medium" style={{ color: "#555" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* URL */}
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#AAA" }}>URL</p>
                <div className="rounded p-2 text-[8px] font-mono break-all leading-4" style={{ background: "#F0F0F0", color: "#666", maxHeight: 64, overflow: "hidden" }}>
                  {selectedAsset.url.startsWith("data:") ? `data:${selectedAsset.url.split(";")[0].split(":")[1]};base64,...(${Math.round(selectedAsset.url.length / 1024)}KB)` : selectedAsset.url}
                </div>
                <button
                  onClick={() => copyUrl(selectedAsset.id + "-detail", selectedAsset.url)}
                  className="mt-1.5 w-full py-1.5 rounded text-[10px] font-medium"
                  style={{ background: copiedId === selectedAsset.id + "-detail" ? "#10B981" : "#4F46E5", color: "#fff" }}
                >
                  {copiedId === selectedAsset.id + "-detail" ? "✓ Copied!" : "Copy URL"}
                </button>
                {!selectedAsset.isBase64 && (
                  <a
                    href={selectedAsset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 w-full py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1"
                    style={{ background: "#F0F0F0", color: "#666", display: "flex" }}
                  >
                    ↗ Open in new tab
                  </a>
                )}
              </div>

              {/* If base64, suggest uploading to Supabase */}
              {selectedAsset.isBase64 && (
                <div className="rounded-lg p-2.5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
                  <p className="text-[9px] font-semibold" style={{ color: "#92400E" }}>💡 Local Storage</p>
                  <p className="text-[9px] mt-1 leading-4" style={{ color: "#92400E" }}>
                    This asset is stored as base64 in the database. Configure SUPABASE_SERVICE_ROLE_KEY to upload to cloud storage instead.
                  </p>
                </div>
              )}

              {/* Navigation links */}
              {selectedAsset.roleId && (
                <Link
                  href={`/dev/casting/${script.id}`}
                  className="w-full py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1"
                  style={{ background: "#EEF2FF", color: "#4F46E5" }}
                >
                  Edit in Casting →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
