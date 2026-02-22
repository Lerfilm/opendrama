"use client"

import { useMemo, useState, useCallback } from "react"

interface SceneRef {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
}

interface LocationPhoto {
  url: string
  note?: string
  isApproved?: boolean
}

interface LocationEntry {
  name: string               // location name e.g. "Office Lobby"
  type: string               // INT | EXT | INT/EXT
  address?: string
  contact?: string
  notes?: string
  photos: LocationPhoto[]
}

interface Script {
  id: string
  title: string
  scenes: SceneRef[]
}

interface LocationWorkspaceProps {
  script: Script
}

// Derive unique locations from scene headings
function extractLocations(scenes: SceneRef[]): string[] {
  const set = new Set<string>()
  scenes.forEach(s => { if (s.location) set.add(s.location) })
  return [...set].sort()
}

export function LocationWorkspace({ script }: { script: Script }) {
  const [scenes, setScenes] = useState<SceneRef[]>(script.scenes)
  const scriptLocations = useMemo(() => extractLocations(scenes), [scenes])

  // Local state: location scouting entries (persisted in-memory for now)
  const [entries, setEntries] = useState<Record<string, LocationEntry>>(() => {
    const init: Record<string, LocationEntry> = {}
    scriptLocations.forEach(loc => {
      // Guess INT/EXT from scenes
      const matchingScene = script.scenes.find(s => s.location === loc)
      const heading = matchingScene?.heading?.toUpperCase() || ""
      const type = heading.startsWith("EXT") ? "EXT" : heading.startsWith("INT/EXT") ? "INT/EXT" : "INT"
      init[loc] = { name: loc, type, photos: [] }
    })
    return init
  })
  const [selectedLoc, setSelectedLoc] = useState<string | null>(scriptLocations[0] ?? null)
  const [addingLoc, setAddingLoc] = useState(false)
  const [newLocName, setNewLocName] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false)

  const entry = selectedLoc ? entries[selectedLoc] : null
  const scenesForLoc = useMemo(() =>
    scenes.filter(s => s.location === selectedLoc),
    [scenes, selectedLoc]
  )

  // Refresh scenes from server
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`/api/scripts/${script.id}`)
      if (res.ok) {
        const data = await res.json()
        const newScenes: SceneRef[] = (data.script?.scenes || []).map((s: SceneRef) => ({
          id: s.id, episodeNum: s.episodeNum, sceneNum: s.sceneNum,
          heading: s.heading, location: s.location, timeOfDay: s.timeOfDay, mood: s.mood,
        }))
        setScenes(newScenes)
        // Re-init new locations if any
        const newLocs = extractLocations(newScenes)
        setEntries(prev => {
          const next = { ...prev }
          newLocs.forEach(loc => {
            if (!next[loc]) {
              const matchingScene = newScenes.find(s => s.location === loc)
              const heading = matchingScene?.heading?.toUpperCase() || ""
              const type = heading.startsWith("EXT") ? "EXT" : heading.startsWith("INT/EXT") ? "INT/EXT" : "INT"
              next[loc] = { name: loc, type, photos: [] }
            }
          })
          return next
        })
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [script.id])

  // AI generate location description
  const handleAIDescribe = useCallback(async (locName: string) => {
    setIsGeneratingDesc(true)
    try {
      const locScenes = scenes.filter(s => s.location === locName)
      const res = await fetch("/api/ai/describe-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: locName,
          scenes: locScenes.map(s => ({
            heading: s.heading,
            timeOfDay: s.timeOfDay,
            mood: s.mood,
          })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.description) {
          updateEntry(locName, { notes: data.description })
        }
      }
    } finally {
      setIsGeneratingDesc(false)
    }
  }, [scenes])

  function updateEntry(loc: string, patch: Partial<LocationEntry>) {
    setEntries(prev => ({ ...prev, [loc]: { ...prev[loc], ...patch } }))
  }

  function addLocation() {
    const name = newLocName.trim()
    if (!name || entries[name]) return
    setEntries(prev => ({ ...prev, [name]: { name, type: "INT", photos: [] } }))
    setSelectedLoc(name)
    setNewLocName("")
    setAddingLoc(false)
  }

  const allLocs = Object.keys(entries).sort()

  return (
    <div className="h-full flex" style={{ background: "#E8E8E8" }}>
      {/* ── Left sidebar: location list ── */}
      <div className="w-64 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Locations · {allLocs.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-[10px] disabled:opacity-50"
              style={{ color: "#888" }}
              title="Refresh from script"
            >
              {isRefreshing ? "..." : "↻"}
            </button>
            <button onClick={() => setAddingLoc(v => !v)} className="text-[10px]" style={{ color: "#4F46E5" }}>+ Add</button>
          </div>
        </div>

        {addingLoc && (
          <div className="px-3 py-2" style={{ background: "#E4E4E4", borderBottom: "1px solid #C8C8C8" }}>
            <input type="text" value={newLocName} onChange={e => setNewLocName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addLocation()}
              placeholder="Location name..."
              className="w-full h-7 px-2 text-[11px] rounded focus:outline-none mb-1.5"
              style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} autoFocus />
            <button onClick={addLocation} className="text-[10px] px-2.5 py-1 rounded" style={{ background: "#4F46E5", color: "#fff" }}>Add</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto dev-scrollbar py-1">
          {allLocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ color: "#BBB" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-50">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <p className="text-[11px]">No locations in script</p>
            </div>
          ) : (
            allLocs.map(loc => {
              const isSelected = loc === selectedLoc
              const e = entries[loc]
              const photoCount = e?.photos?.length ?? 0
              const sceneCount = script.scenes.filter(s => s.location === loc).length
              return (
                <button key={loc} onClick={() => setSelectedLoc(loc)}
                  className="w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors"
                  style={{ background: isSelected ? "#DCE0F5" : "transparent", borderLeft: isSelected ? "2px solid #4F46E5" : "2px solid transparent" }}>
                  <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold" style={{ background: isSelected ? "#4F46E5" : "#D0D0D0", color: isSelected ? "#fff" : "#888" }}>
                    {e?.type?.substring(0, 3) || "INT"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: isSelected ? "#1A1A1A" : "#333" }}>{loc}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px]" style={{ color: "#AAA" }}>{sceneCount} scene{sceneCount !== 1 ? "s" : ""}</span>
                      {photoCount > 0 && <span className="text-[9px]" style={{ color: "#4F46E5" }}>📷 {photoCount}</span>}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right: location detail ── */}
      <div className="flex-1 overflow-y-auto dev-scrollbar">
        {!entry ? (
          <div className="h-full flex flex-col items-center justify-center" style={{ color: "#CCC" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-30">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <p className="text-sm">Select a location</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>{entry.name}</h2>
                <p className="text-[11px]" style={{ color: "#999" }}>{scenesForLoc.length} scene{scenesForLoc.length !== 1 ? "s" : ""} in script</p>
              </div>
            </div>

            {/* Location info */}
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Type</label>
                  <select value={entry.type}
                    onChange={e => updateEntry(selectedLoc!, { type: e.target.value })}
                    className="w-full h-8 px-2 text-sm rounded focus:outline-none"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}>
                    <option value="INT">INT — Interior</option>
                    <option value="EXT">EXT — Exterior</option>
                    <option value="INT/EXT">INT/EXT — Both</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Contact Person</label>
                  <input type="text" value={entry.contact || ""}
                    onChange={e => updateEntry(selectedLoc!, { contact: e.target.value })}
                    placeholder="Location manager name & phone"
                    className="w-full h-8 px-2.5 text-sm rounded focus:outline-none"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Address</label>
                <input type="text" value={entry.address || ""}
                  onChange={e => updateEntry(selectedLoc!, { address: e.target.value })}
                  placeholder="Full address or GPS coordinates"
                  className="w-full h-8 px-2.5 text-sm rounded focus:outline-none"
                  style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>Scout Notes</label>
                  <button
                    onClick={() => selectedLoc && handleAIDescribe(selectedLoc)}
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
                <textarea value={entry.notes || ""}
                  onChange={e => updateEntry(selectedLoc!, { notes: e.target.value })}
                  rows={4}
                  placeholder="Lighting conditions, access restrictions, permit required, parking, power availability...\n\nUse ✦ AI Describe to auto-generate from scene content."
                  className="w-full px-2.5 py-2 text-sm rounded focus:outline-none resize-none leading-relaxed"
                  style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
              </div>
            </div>

            {/* Scenes using this location */}
            {scenesForLoc.length > 0 && (
              <div className="mb-6">
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#999" }}>Scenes at this Location</label>
                <div className="space-y-1">
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
            )}

            {/* Location photos */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>
                  Scout Photos ({entry.photos?.length ?? 0})
                </label>
                <label className="text-[11px] px-2.5 py-1 rounded cursor-pointer" style={{ background: "#4F46E5", color: "#fff" }}>
                  ↑ Upload
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file || !selectedLoc) return
                    const fd = new FormData()
                    fd.append("file", file)
                    try {
                      const res = await fetch("/api/upload/role-image", { method: "POST", body: fd })
                      if (res.ok) {
                        const { url } = await res.json()
                        const newPhotos = [...(entry.photos || []), { url, isApproved: false }]
                        updateEntry(selectedLoc, { photos: newPhotos })
                      }
                    } catch { /* silent */ }
                    e.target.value = ""
                  }} />
                </label>
              </div>

              {(entry.photos?.length ?? 0) === 0 ? (
                <div className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-12"
                  style={{ borderColor: "#C8C8C8", background: "#F5F5F5" }}>
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
                            updateEntry(selectedLoc!, { photos: newPhotos })
                          }}
                          className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: photo.isApproved ? "#10B981" : "rgba(0,0,0,0.5)", color: "#fff" }}>
                          {photo.isApproved ? "✓ Approved" : "Approve"}
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          const newPhotos = entry.photos.filter((_, j) => j !== i)
                          updateEntry(selectedLoc!, { photos: newPhotos })
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
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
        )}
      </div>
    </div>
  )
}
