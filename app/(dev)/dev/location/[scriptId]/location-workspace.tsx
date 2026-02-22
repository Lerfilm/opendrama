"use client"

import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { LocationSidebar } from "./components/location-sidebar"
import { LocationDetail } from "./components/location-detail"

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

function extractLocations(scenes: SceneRef[]): string[] {
  const set = new Set<string>()
  scenes.forEach(s => { if (s.location) set.add(s.location) })
  return [...set].sort()
}

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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false)
  const [isAIExtracting, setIsAIExtracting] = useState(false)
  const [isGeneratingAllPhotos, setIsGeneratingAllPhotos] = useState(false)
  const [generateAllPhotosProgress, setGenerateAllPhotosProgress] = useState(0)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isLoadedRef = useRef(false)

  // Load locations from DB on mount
  useEffect(() => {
    fetch(`/api/scripts/${script.id}/locations`)
      .then(r => r.json())
      .then(d => {
        const saved: LocationEntry[] = d.locations || []
        if (saved.length > 0) {
          setEntries(prev => {
            const next = { ...prev }
            saved.forEach(loc => {
              next[loc.name] = { ...next[loc.name], ...loc }
            })
            return next
          })
          setSelectedLoc(prev => prev ?? saved[0]?.name ?? null)
        }
        isLoadedRef.current = true
      })
      .catch(() => { isLoadedRef.current = true })
  }, [script.id])

  // Auto-save locations when entries change
  useEffect(() => {
    if (!isLoadedRef.current) return
    const locationList = Object.values(entries)
    if (locationList.length === 0) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setSaveStatus("saving")
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/scripts/${script.id}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locations: locationList }),
        })
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch { setSaveStatus("idle") }
    }, 800)
  }, [entries, script.id])

  const entry = selectedLoc ? entries[selectedLoc] : null

  const scenesForLoc = useMemo(() =>
    scenes.filter(s => s.location === selectedLoc),
    [scenes, selectedLoc]
  )

  const scenesByTime = useMemo(() => {
    const map: Record<string, SceneRef[]> = {}
    scenesForLoc.forEach(s => {
      const key = s.timeOfDay || "Unspecified"
      if (!map[key]) map[key] = []
      map[key].push(s)
    })
    return map
  }, [scenesForLoc])

  const updateEntry = useCallback((loc: string, patch: Partial<LocationEntry>) => {
    setEntries(prev => ({ ...prev, [loc]: { ...prev[loc], ...patch } }))
  }, [])

  const handleAddLocation = useCallback((name: string) => {
    if (!name || entries[name]) return
    setEntries(prev => ({ ...prev, [name]: { name, type: "INT", photos: [] } }))
    setSelectedLoc(name)
  }, [entries])

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

  const handleAIExtract = useCallback(async () => {
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

      if (aiLocations.length > 0 && !selectedLoc) {
        setSelectedLoc(aiLocations[0].name)
      }
    } catch {
      alert("AI extraction failed")
    } finally {
      setIsAIExtracting(false)
    }
  }, [scenes, script.id, selectedLoc])

  const handleAIDescribe = useCallback(async (locName: string) => {
    setIsGeneratingDesc(true)
    try {
      const locScenes = scenes.filter(s => s.location === locName)
      const res = await fetch("/api/ai/describe-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: locName,
          scenes: locScenes.map(s => ({ heading: s.heading, timeOfDay: s.timeOfDay, mood: s.mood })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.description) updateEntry(locName, { notes: data.description })
      }
    } finally {
      setIsGeneratingDesc(false)
    }
  }, [scenes, updateEntry])

  const handleGenerateAllPhotos = useCallback(async () => {
    const locs = Object.keys(entries).sort()
    if (locs.length === 0) return
    setIsGeneratingAllPhotos(true)
    setGenerateAllPhotosProgress(0)
    for (let i = 0; i < locs.length; i++) {
      const loc = locs[i]
      const e = entries[loc]
      try {
        const res = await fetch("/api/ai/generate-location-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locName: e?.name || loc,
            type: e?.type || "INT",
            description: e?.notes?.trim() || "",
          }),
        })
        const data = await res.json()
        if (data.url) {
          setEntries(prev => ({
            ...prev,
            [loc]: {
              ...prev[loc],
              photos: [...(prev[loc]?.photos || []), { url: data.url, isApproved: false }],
            },
          }))
        }
      } catch { /* skip failed location */ }
      setGenerateAllPhotosProgress(Math.round(((i + 1) / locs.length) * 100))
    }
    setIsGeneratingAllPhotos(false)
    setGenerateAllPhotosProgress(0)
  }, [entries])

  const allLocs = Object.keys(entries).sort()

  return (
    <div className="h-full flex" style={{ background: "#E8E8E8" }}>
      <LocationSidebar
        allLocs={allLocs}
        entries={entries}
        scenes={scenes}
        selectedLoc={selectedLoc}
        isRefreshing={isRefreshing}
        isAIExtracting={isAIExtracting}
        isGeneratingAllPhotos={isGeneratingAllPhotos}
        generateAllPhotosProgress={generateAllPhotosProgress}
        saveStatus={saveStatus}
        onSelectLoc={setSelectedLoc}
        onRefresh={handleRefresh}
        onAIExtract={handleAIExtract}
        onAddLocation={handleAddLocation}
        onGenerateAllPhotos={handleGenerateAllPhotos}
      />
      <LocationDetail
        entry={entry}
        selectedLoc={selectedLoc}
        allLocs={allLocs}
        scenes={scenes}
        scenesForLoc={scenesForLoc}
        scenesByTime={scenesByTime}
        isGeneratingDesc={isGeneratingDesc}
        onUpdateEntry={updateEntry}
        onAIDescribe={handleAIDescribe}
        onAIExtract={handleAIExtract}
      />
    </div>
  )
}
