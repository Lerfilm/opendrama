"use client"

import { useState } from "react"
import { AIConfirmModal } from "@/components/dev/ai-confirm-modal"

interface LocationPhoto {
  url: string
  note?: string
  isApproved?: boolean
}

interface TimeSlot {
  timeOfDay: string
  mood?: string
  sceneNums?: number[]
  setNotes?: string
}

interface LocationEntry {
  name: string
  type: string
  address?: string
  contact?: string
  notes?: string
  description?: string
  photos: LocationPhoto[]
  timeSlots?: TimeSlot[]
}

interface SceneRef {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
}

interface LocationDetailProps {
  entry: LocationEntry | null
  selectedLoc: string | null
  allLocs: string[]
  scenes: SceneRef[]
  scenesForLoc: SceneRef[]
  scenesByTime: Record<string, SceneRef[]>
  isGeneratingDesc: boolean
  onUpdateEntry: (loc: string, patch: Partial<LocationEntry>) => void
  onAIDescribe: (loc: string) => void
  onAIExtract: () => void
}

export function LocationDetail({
  entry, selectedLoc, allLocs, scenes,
  scenesForLoc, scenesByTime,
  isGeneratingDesc,
  onUpdateEntry, onAIDescribe, onAIExtract,
}: LocationDetailProps) {
  const [showDescribeConfirm, setShowDescribeConfirm] = useState(false)
  const [isGeneratingPhoto, setIsGeneratingPhoto] = useState(false)

  if (!entry || !selectedLoc) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ color: "#CCC" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-30">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <p className="text-sm">Select a location</p>
        {allLocs.length === 0 && scenes.length > 0 && (
          <p className="text-[11px] mt-2 px-8 text-center">Click ✦ AI Extract to pull locations from your script</p>
        )}
      </div>
    )
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedLoc) return
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch("/api/upload/role-image", { method: "POST", body: fd })
      if (res.ok) {
        const { url } = await res.json()
        const newPhotos = [...(entry?.photos || []), { url, isApproved: false }]
        onUpdateEntry(selectedLoc, { photos: newPhotos })
      }
    } catch { /* silent */ }
    e.target.value = ""
  }

  async function handleAIGeneratePhoto() {
    if (!selectedLoc || !entry) return
    setIsGeneratingPhoto(true)
    try {
      const res = await fetch("/api/ai/generate-location-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locName: entry.name || selectedLoc,
          type: entry.type || "INT",
          description: entry.notes?.trim() || "",
        }),
      })
      const data = await res.json()
      if (data.url) {
        const newPhotos = [...(entry.photos || []), { url: data.url, isApproved: false }]
        onUpdateEntry(selectedLoc, { photos: newPhotos })
      }
    } catch { /* silent */ }
    finally { setIsGeneratingPhoto(false) }
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto dev-scrollbar">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>{entry.name}</h2>
            <p className="text-[11px]" style={{ color: "#999" }}>
              {scenesForLoc.length} scene{scenesForLoc.length !== 1 ? "s" : ""} in script
            </p>
          </div>
        </div>

        {/* Location info */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Type</label>
            <select
              value={entry.type}
              onChange={e => onUpdateEntry(selectedLoc, { type: e.target.value })}
              className="w-full h-8 px-2 text-sm rounded focus:outline-none"
              style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
            >
              <option value="INT">INT — Interior</option>
              <option value="EXT">EXT — Exterior</option>
              <option value="INT/EXT">INT/EXT — Both</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>Scout Notes</label>
              <button
                onClick={() => setShowDescribeConfirm(true)}
                disabled={isGeneratingDesc}
                className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
                style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
              >
                {isGeneratingDesc ? (
                  <><div className="w-2 h-2 rounded-full border border-indigo-400 border-t-transparent animate-spin" /> Generating...</>
                ) : (
                  <>✦ AI Describe</>
                )}
              </button>
            </div>
            <textarea
              value={entry.notes || ""}
              onChange={e => onUpdateEntry(selectedLoc, { notes: e.target.value })}
              rows={4}
              placeholder={"Lighting conditions, access restrictions, permit required, parking, power availability...\n\nUse ✦ AI Describe to auto-generate from scene content."}
              className="w-full px-2.5 py-2 text-sm rounded focus:outline-none resize-none leading-relaxed"
              style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
            />
          </div>
        </div>

        {/* Time-of-Day Shooting Schedule */}
        {(entry.timeSlots && entry.timeSlots.length > 0) ? (
          <div className="mb-6">
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#999" }}>
              Shooting Schedule by Time · {entry.timeSlots.length} slot{entry.timeSlots.length !== 1 ? "s" : ""}
            </label>
            <div className="space-y-2">
              {entry.timeSlots.map((slot, i) => (
                <div key={i} className="p-3 rounded" style={{ background: "#F5F5F5", border: "1px solid #E0E0E0" }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
                      {slot.timeOfDay}
                    </span>
                    {slot.mood && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#EDE9FE", color: "#7C3AED" }}>
                        {slot.mood}
                      </span>
                    )}
                    {slot.sceneNums && slot.sceneNums.length > 0 && (
                      <span className="text-[9px] font-mono ml-auto" style={{ color: "#AAA" }}>
                        S{slot.sceneNums.join(", S")}
                      </span>
                    )}
                  </div>
                  {slot.setNotes && (
                    <p className="text-[11px] leading-relaxed" style={{ color: "#666" }}>{slot.setNotes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : Object.keys(scenesByTime).length > 0 ? (
          <div className="mb-6">
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#999" }}>
              Scenes by Time of Day
            </label>
            <div className="space-y-3">
              {Object.entries(scenesByTime).map(([timeOfDay, timeScenes]) => (
                <div key={timeOfDay}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
                      {timeOfDay}
                    </span>
                    <span className="text-[9px]" style={{ color: "#AAA" }}>{timeScenes.length} scene{timeScenes.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-1 ml-1 max-h-[160px] overflow-y-auto dev-scrollbar">
                    {timeScenes.map(s => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ background: "#F0F0F0" }}>
                        <span className="text-[10px] font-mono font-bold" style={{ color: "#4F46E5" }}>E{s.episodeNum}S{s.sceneNum}</span>
                        <span className="text-[11px] truncate flex-1" style={{ color: "#444" }}>{s.heading || "Untitled scene"}</span>
                        {s.mood && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#EDE9FE", color: "#7C3AED" }}>{s.mood}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : scenesForLoc.length > 0 ? (
          <div className="mb-6">
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#999" }}>Scenes at this Location</label>
            <div className="space-y-1 max-h-[160px] overflow-y-auto dev-scrollbar">
              {scenesForLoc.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ background: "#F0F0F0" }}>
                  <span className="text-[10px] font-mono font-bold" style={{ color: "#4F46E5" }}>E{s.episodeNum}S{s.sceneNum}</span>
                  <span className="text-[11px] truncate flex-1" style={{ color: "#444" }}>{s.heading || "Untitled scene"}</span>
                  {s.timeOfDay && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#E0E0E0", color: "#777" }}>{s.timeOfDay}</span>}
                  {s.mood && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#EDE9FE", color: "#7C3AED" }}>{s.mood}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Scout Photos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>
              Scout Photos ({entry.photos?.length ?? 0})
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAIGeneratePhoto}
                disabled={isGeneratingPhoto}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded disabled:opacity-50 transition-colors"
                style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
              >
                {isGeneratingPhoto ? (
                  <><div className="w-2 h-2 rounded-full border border-indigo-400 border-t-transparent animate-spin" /> Generating...</>
                ) : (
                  <>✦ AI Generate</>
                )}
              </button>
              <label className="text-[11px] px-2.5 py-1 rounded cursor-pointer" style={{ background: "#4F46E5", color: "#fff" }}>
                ↑ Upload
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          </div>

          {(entry.photos?.length ?? 0) === 0 ? (
            <div
              className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-12"
              style={{ borderColor: "#C8C8C8", background: "#F5F5F5" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#BBB" }} className="mb-2">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <p className="text-[11px]" style={{ color: "#BBB" }}>Upload location scout photos</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {entry.photos.map((photo, i) => (
                <div key={i} className="relative group rounded overflow-hidden aspect-video" style={{ background: "#E0E0E0" }}>
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-1 left-1 flex gap-1">
                    <button
                      onClick={() => {
                        const newPhotos = entry.photos.map((p, j) => j === i ? { ...p, isApproved: !p.isApproved } : p)
                        onUpdateEntry(selectedLoc, { photos: newPhotos })
                      }}
                      className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: photo.isApproved ? "#10B981" : "rgba(0,0,0,0.5)", color: "#fff" }}
                    >
                      {photo.isApproved ? "✓ Approved" : "Approve"}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const newPhotos = entry.photos.filter((_, j) => j !== i)
                      onUpdateEntry(selectedLoc, { photos: newPhotos })
                    }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {showDescribeConfirm && (
      <AIConfirmModal
        featureKey="describe_location"
        featureLabel="Location AI Describe"
        onConfirm={() => { setShowDescribeConfirm(false); onAIDescribe(selectedLoc) }}
        onCancel={() => setShowDescribeConfirm(false)}
      />
    )}
    </>
  )
}
