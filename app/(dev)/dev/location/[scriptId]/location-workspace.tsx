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
  action?: string | null
}

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

interface Script {
  id: string
  title: string
  scenes: SceneRef[]
}

// Derive unique locations from scene headings
function extractLocations(scenes: SceneRef[]): string[] {
  const set = new Set<string>()
  scenes.forEach(s => { if (s.location) set.add(s.location) })
  return [...set].sort()
}

// Build scene text for AI (heading + first 300 chars of action)
function buildSceneText(scene: SceneRef): string {
  let text = `Scene E${scene.episodeNum}S${scene.sceneNum}: ${scene.heading || ""}`
  if (scene.action) {
    const raw = scene.action.trim()
    let actionText = raw
    if (raw.startsWith("[")) {
      try {
        const blocks = JSON.parse(raw) as Array<{ text?: string; line?: string }>
        actionText = blocks.map(b => b.text || b.line || "").filter(Boolean).join(" ")
      } catch { /* keep raw */ }
    }
    text += `\n${actionText.substring(0, 300)}`
  }
  return text
}

export function LocationWorkspace({ script }: { script: Script }) {
  const [scenes, setScenes] = useState<SceneRef[]>(script.scenes)
  const scriptLocations = useMemo(() => extractLocations(scenes), [scenes])

  // Local state: location scouting entries (persisted in-memory for now)
  const [entries, setEntries] = useState<Record<string, LocationEntry>>(() => {
    const init: Record<string, LocationEntry> = {}
    scriptLocations.forEach(loc => {
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
  const [isAIExtracting, setIsAIExtracting] = useState(false)

  const entry = selectedLoc ? entries[selectedLoc] : null
  const scenesForLoc = useMemo(() =>
    scenes.filter(s => s.location === selectedLoc),
    [scenes, selectedLoc]
  )

  // Group scenes by time-of-day for the selected location
  const scenesByTime = useMemo(() => {
    const map: Record<string, SceneRef[]> = {}
    scenesForLoc.forEach(s => {
      const key = s.timeOfDay || "Unspecified"
      if (!map[key]) map[key] = []
      map[key].push(s)
    })
    return map
  }, [scenesForLoc])

  // Refresh scenes from server
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`/api/scripts/${script.id}`)
      if (res.ok) {
        const data = await res.json()
        const newScenes: SceneRef[] = (data.script?.scenes || []).map((s: SceneRef) => ({
          id: s.id, episodeNum: s.episodeNum, sceneNum: s.sceneNum,
          heading: s.heading, location: s.location, timeOfDay: s.timeOfDay, mood: s.mood, action: s.action,
        }))
        setScenes(newScenes)
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

  // AI Extract locations from entire script
  const extractLocationsFromScript = useCallback(async () => {
    setIsAIExtracting(true)
    try {
      const sceneTexts = scenes.map(buildSceneText).join("\n\n---\n\n")
      const res = await fetch("/api/ai/extract-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, sceneTexts }),
      })
      if (!res.ok) throw new Error("Failed")
      const data = await res.json()
      const aiLocations: Array<{
        name: string
        type: string
        description?: string
        timeSlots?: TimeSlot[]
      }> = data.locations || []

      setEntries(prev => {
        const next = { ...prev }
        aiLocations.forEach(loc => {
          const existing = next[loc.name] || { name: loc.name, type: loc.type, photos: [] }
          next[loc.name] = {
            ...existing,
            type: loc.type || existing.type,
            description: loc.description || existing.description,
            timeSlots: loc.timeSlots || existing.timeSlots,
            notes: existing.notes || loc.description || "",
          }
        })
        return next
      })

      // Auto-select first extracted location
      if (aiLocations.length > 0 && !selectedLoc) {
        setSelectedLoc(aiLocations[0].name)
      }
    } catch {
      alert("AI extraction failed")
    } finally {
      setIsAIExtracting(false)
    }
  }, [scenes, script.id, selectedLoc])

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

        {/* AI Extract button */}
        <div className="px-3 py-2" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <button
            onClick={extractLocationsFromScript}
            disabled={isAIExtracting || scenes.length === 0}
            className="w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded disabled:opacity-50 transition-colors"
            style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
          >
            {isAIExtracting ? (
              <><div className="w-2.5 h-2.5 rounded-full border border-indigo-400 border-t-transparent animate-spin" /> Extracting...</>
            ) : (
              <>✦ AI Extract from Script</>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto dev-scrollbar py-1">
          {allLocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ color: "#BBB" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-50">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <p className="text-[11px] text-center px-3">No locations yet.<br />Use ✦ AI Extract or add manually.</p>
            </div>
          ) : (
            allLocs.map(loc => {
              const isSelected = loc === selectedLoc
              const e = entries[loc]
              const photoCount = e?.photos?.length ?? 0
              const sceneCount = scenes.filter(s => s.location === loc).length
              const timeSlotCount = e?.timeSlots?.length ?? 0
              return (
                <button key={loc} onClick={() => setSelectedLoc(loc)}
                  className="w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors"
                  style={{ background: isSelected ? "#DCE0F5" : "transparent", borderLeft: isSelected ? "2px solid #4F46E5" : "2px solid transparent" }}>
                  <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold" style={{ background: isSelected ? "#4F46E5" : "#D0D0D0", color: isSelected ? "#fff" : "#888" }}>
                    {e?.type?.substring(0, 3) || "INT"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: isSelected ? "#1A1A1A" : "#333" }}>{loc}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[9px]" style={{ color: "#AAA" }}>{sceneCount} scene{sceneCount !== 1 ? "s" : ""}</span>
                      {timeSlotCount > 0 && <span className="text-[9px]" style={{ color: "#7C3AED" }}>🕐 {timeSlotCount} slots</span>}
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
            {allLocs.length === 0 && scenes.length > 0 && (
              <p className="text-[11px] mt-2 px-8 text-center">Click ✦ AI Extract to pull locations from your script</p>
            )}
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

            {/* Time-of-Day Shooting Schedule — AI-extracted or derived from scenes */}
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
                      <div className="space-y-1 ml-1">
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
            ) : null}

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
