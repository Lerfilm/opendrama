"use client"

import { useState } from "react"

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

interface Script {
  id: string
  title: string
  genre: string
  logline?: string | null
  synopsis?: string | null
  coverTall?: string | null
  targetEpisodes: number
  status: string
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

  const [tags, setTags] = useState<string[]>(["drama", script.genre].filter(Boolean))
  const [tagInput, setTagInput] = useState("")
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [publishedSeries, setPublishedSeries] = useState<Series | null>(series)

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
    if (!confirm(`Publish "${script.title}" with ${readyEpisodes.length} episode(s)? This will create/update the Series on the platform.`)) return
    setIsPublishing(true)
    setPublishResult(null)
    try {
      const res = await fetch(`/api/scripts/${script.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
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
          {/* Script info */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Script</p>
            <div className="flex items-center gap-3">
              {script.coverTall ? (
                <img src={script.coverTall} alt="" className="w-12 h-16 rounded object-cover flex-shrink-0" style={{ border: "1px solid #C8C8C8" }} />
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

          {/* Tags */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#AAA" }}>Tags</p>
            <div className="flex flex-wrap gap-1 mb-2">
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
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTag()}
                placeholder="Add tag..."
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
        <div className="max-w-3xl mx-auto">
          <h2 className="text-sm font-semibold mb-1" style={{ color: "#1A1A1A" }}>Episode Overview</h2>
          <p className="text-[11px] mb-4" style={{ color: "#888" }}>
            {readyEpisodes.length} of {script.targetEpisodes} episodes ready to publish
          </p>

          <div className="space-y-3">
            {Array.from({ length: script.targetEpisodes }, (_, i) => i + 1).map(ep => {
              const epSegs = epMap.get(ep) ?? []
              const totalDur = epSegs.reduce((s, x) => s + x.durationSec, 0)
              const hasVideo = epSegs.length > 0
              const thumbnail = epSegs.find(s => s.thumbnailUrl)?.thumbnailUrl

              return (
                <div
                  key={ep}
                  className="flex items-center gap-4 p-3 rounded-lg"
                  style={{ background: hasVideo ? "#F5F5F5" : "#EDEDEE", border: `1px solid ${hasVideo ? "#D0D0D0" : "#E0E0E0"}` }}
                >
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
                      {hasVideo ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#D1FAE5", color: "#065F46" }}>Ready</span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#F3F4F6", color: "#6B7280" }}>No video</span>
                      )}
                    </div>
                    <p className="text-[10px]" style={{ color: "#AAA" }}>
                      {epSegs.length} segments · {totalDur}s
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
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
