"use client"

import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { LocationSidebar } from "./components/location-sidebar"
import { LocationDetail } from "./components/location-detail"
import { useUnsavedWarning } from "@/lib/use-unsaved-warning"

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
  const { markDirty, markClean } = useUnsavedWarning()
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
  const [extractProgress, setExtractProgress] = useState(0)
  const extractTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isGeneratingAllPhotos, setIsGeneratingAllPhotos] = useState(false)
  const [genAllTotal, setGenAllTotal] = useState(0)
  const [genAllDone, setGenAllDone] = useState(0)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isLoadedRef = useRef(false)
  const locJobIdRef = useRef<string | null>(null)
  // Always-current entries reference for use inside async runners
  const entriesRef = useRef(entries)

  // Keep entriesRef in sync with latest entries state
  useEffect(() => { entriesRef.current = entries }, [entries])

  // Runner: generate photos for remaining locations (supports both fresh start and resume)
  async function runGenerateAllLocationPhotos(locIds: string[], completedLocIds: string[], jobId: string) {
    const remaining = locIds.filter(id => !completedLocIds.includes(id))
    setGenAllTotal(locIds.length)
    setGenAllDone(locIds.length - remaining.length)
    setIsGeneratingAllPhotos(true)
    let doneCount = locIds.length - remaining.length

    for (const locId of remaining) {
      const e = entriesRef.current[locId]
      try {
        const res = await fetch("/api/ai/generate-location-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locName: e?.name || locId,
            type: e?.type || "INT",
            description: e?.notes?.trim() || "",
          }),
        })
        const data = await res.json()
        if (data.url) {
          setEntries(prev => ({
            ...prev,
            [locId]: { ...prev[locId], photos: [...(prev[locId]?.photos || []), { url: data.url, isApproved: false }] },
          }))
        }
      } catch { /* skip failed location */ }

      doneCount++
      setGenAllDone(doneCount)

      // Persist progress to DB job
      await fetch("/api/casting/bulk-job", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          completedLocId: locId,
          progress: Math.round((doneCount / locIds.length) * 100),
        }),
      }).catch(() => {})
    }

    // Mark job complete
    await fetch(`/api/casting/bulk-job?jobId=${jobId}`, { method: "DELETE" }).catch(() => {})
    locJobIdRef.current = null
    setIsGeneratingAllPhotos(false)
    setGenAllTotal(0)
    setGenAllDone(0)
  }

  // Start a fresh generate-all-photos job
  async function handleGenerateAllPhotos() {
    const locIds = Object.keys(entries).sort()
    if (locIds.length === 0) return
    const res = await fetch("/api/casting/bulk-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptId: script.id, type: "generate_all_location_photos", locIds }),
    })
    const { job } = await res.json()
    locJobIdRef.current = job.id
    await runGenerateAllLocationPhotos(locIds, [], job.id)
  }

  // Load locations from DB on mount + resume any active job
  useEffect(() => {
    async function loadAndResume() {
      // 1. Load saved location data from DB
      try {
        const r = await fetch(`/api/scripts/${script.id}/locations`)
        const d = await r.json()
        const saved: LocationEntry[] = d.locations || []
        if (saved.length > 0) {
          setEntries(prev => {
            const next = { ...prev }
            saved.forEach(loc => { next[loc.name] = { ...next[loc.name], ...loc } })
            return next
          })
          setSelectedLoc(prev => prev ?? saved[0]?.name ?? null)
        }
      } catch {}
      isLoadedRef.current = true

      // 2. Check for an active location photo-generation job to resume
      try {
        const res = await fetch(`/api/casting/bulk-job?scriptId=${script.id}&type=generate_all_location_photos`)
        if (!res.ok) return
        const { jobs } = await res.json()
        if (!jobs?.length) return
        const job = jobs[0]
        let inputData: { locIds?: string[] } = {}
        let outputData: { completedLocIds?: string[] } = {}
        try { inputData = JSON.parse(job.input || "{}") } catch {}
        try { outputData = JSON.parse(job.output || "{}") } catch {}
        const locIds = inputData.locIds || []
        const completedLocIds = outputData.completedLocIds || []
        if (locIds.length > 0 && completedLocIds.length < locIds.length) {
          locJobIdRef.current = job.id
          runGenerateAllLocationPhotos(locIds, completedLocIds, job.id)
        }
      } catch {}
    }
    loadAndResume()
  }, [script.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
        markClean()
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
    markDirty()
    setEntries(prev => ({ ...prev, [loc]: { ...prev[loc], ...patch } }))
  }, [markDirty])

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
    setExtractProgress(5)
    // Animate progress bar from 5% → 85% while API call runs
    if (extractTimerRef.current) clearInterval(extractTimerRef.current)
    extractTimerRef.current = setInterval(() => {
      setExtractProgress(prev => (prev < 85 ? prev + 2 : prev))
    }, 400)
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
      if (extractTimerRef.current) { clearInterval(extractTimerRef.current); extractTimerRef.current = null }
      setExtractProgress(100)
      setTimeout(() => { setExtractProgress(0); setIsAIExtracting(false) }, 600)
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

  const allLocs = Object.keys(entries).sort()

  return (
    <div className="h-full flex flex-col" style={{ background: "#E8E8E8" }}>
      {/* AI Extract progress bar (only shown during extraction) */}
      {isAIExtracting && extractProgress > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0" style={{ background: "#DCDCDC", borderBottom: "1px solid #C0C0C0" }}>
          <div className="flex items-center gap-2">
            <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: "#D0D4E8" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${extractProgress}%`, background: "#7C3AED" }}
              />
            </div>
            <span className="text-[10px]" style={{ color: "#6B7280" }}>Extracting locations...</span>
          </div>
        </div>
      )}

      {/* Main content: sidebar + detail */}
      <div className="flex-1 flex min-h-0">
        <LocationSidebar
          allLocs={allLocs}
          entries={entries}
          scenes={scenes}
          selectedLoc={selectedLoc}
          isRefreshing={isRefreshing}
          isAIExtracting={isAIExtracting}
          saveStatus={saveStatus}
          onSelectLoc={setSelectedLoc}
          onRefresh={handleRefresh}
          onAIExtract={handleAIExtract}
          onAddLocation={handleAddLocation}
        />
        <LocationDetail
          entry={entry}
          selectedLoc={selectedLoc}
          allLocs={allLocs}
          scenes={scenes}
          scenesForLoc={scenesForLoc}
          scenesByTime={scenesByTime}
          isGeneratingDesc={isGeneratingDesc}
          isGeneratingAllPhotos={isGeneratingAllPhotos}
          genAllDone={genAllDone}
          genAllTotal={genAllTotal}
          onUpdateEntry={updateEntry}
          onAIDescribe={handleAIDescribe}
          onAIExtract={handleAIExtract}
          onGenerateAllPhotos={handleGenerateAllPhotos}
        />
      </div>
    </div>
  )
}
