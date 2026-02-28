"use client"

import { useState, useMemo } from "react"

interface Scene {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  action?: string | null
  dialogue?: string | null
  stageDirection?: string | null
  mood?: string | null
  location?: string | null
  timeOfDay?: string | null
}

interface VideoSegment {
  id: string
  episodeNum: number
  status: string
}

interface SceneListPanelProps {
  scenes: Scene[]
  episodes: number[]
  allScenes: Scene[]
  segments: VideoSegment[]
  selectedEpisode: number
  onSelectEpisode: (ep: number) => void
  selectedSceneId: string | null
  onSelectScene: (id: string) => void
  savingScenes: Set<string>
  editingScenes: Record<string, unknown>
  onAddEpisode: () => void
  onDeleteEpisode: (ep: number) => void
  onAddScene: () => void
  targetEpisodes: number
}

/** Mood-based color for storyboard visual indicator */
const MOOD_COLORS: Record<string, string> = {
  tense: "#EF4444",
  suspense: "#DC2626",
  romantic: "#EC4899",
  tender: "#F472B6",
  melancholic: "#6366F1",
  sad: "#818CF8",
  happy: "#F59E0B",
  joyful: "#FBBF24",
  mysterious: "#8B5CF6",
  dark: "#374151",
  calm: "#06B6D4",
  peaceful: "#22D3EE",
  comedic: "#F97316",
  dramatic: "#7C3AED",
  action: "#DC2626",
  horror: "#1F2937",
  angry: "#B91C1C",
  hopeful: "#10B981",
  neutral: "#9CA3AF",
}

function getMoodColor(mood?: string | null): string {
  if (!mood) return "#D1D5DB"
  const key = mood.toLowerCase().trim()
  for (const [k, v] of Object.entries(MOOD_COLORS)) {
    if (key.includes(k)) return v
  }
  // Generate a consistent color from mood string
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 60%, 55%)`
}

/** Count characters in a scene's text content (action + dialogue + stageDirection) */
function countSceneChars(scene: Scene): number {
  let count = 0
  // action blocks (JSON array or plain text)
  if (scene.action) {
    const raw = scene.action.trim()
    if (raw.startsWith("[")) {
      try {
        const blocks = JSON.parse(raw) as Array<{ text?: string; line?: string; character?: string }>
        for (const b of blocks) {
          count += (b.text || "").length + (b.line || "").length + (b.character || "").length
        }
      } catch {
        count += raw.length
      }
    } else {
      count += raw.length
    }
  }
  if (scene.dialogue) count += scene.dialogue.length
  if (scene.stageDirection) count += scene.stageDirection.length
  return count
}

export function SceneListPanel({
  scenes, episodes, allScenes, segments, selectedEpisode, onSelectEpisode,
  selectedSceneId, onSelectScene, savingScenes, editingScenes,
  onAddEpisode, onDeleteEpisode, onAddScene, targetEpisodes,
}: SceneListPanelProps) {
  const [filterLocation, setFilterLocation] = useState("")
  const [filterMood, setFilterMood] = useState("")
  const [searchText, setSearchText] = useState("")

  // Get unique locations and moods for filters
  const locations = useMemo(() => {
    const set = new Set<string>()
    scenes.forEach(s => { if (s.location) set.add(s.location) })
    return [...set].sort()
  }, [scenes])

  const moods = useMemo(() => {
    const set = new Set<string>()
    scenes.forEach(s => { if (s.mood) set.add(s.mood) })
    return [...set].sort()
  }, [scenes])

  // Filter scenes
  const filteredScenes = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return scenes.filter(s => {
      if (filterLocation && s.location !== filterLocation) return false
      if (filterMood && s.mood !== filterMood) return false
      if (query && !(s.heading || "").toLowerCase().includes(query)) return false
      return true
    })
  }, [scenes, filterLocation, filterMood, searchText])

  // Episode total character count
  const episodeTotalChars = useMemo(() => countSceneChars({ id: "", episodeNum: 0, sceneNum: 0,
    action: scenes.map(s => s.action || "").join(""),
    dialogue: scenes.map(s => s.dialogue || "").join(""),
    stageDirection: scenes.map(s => s.stageDirection || "").join(""),
  }), [scenes])

  const canAddEpisode = episodes.length < targetEpisodes

  return (
    <div className="h-full flex flex-col" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
      {/* Episodes Header */}
      <div className="flex-shrink-0 px-3 py-2" style={{ borderBottom: "1px solid #C8C8C8" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Episodes</span>
        </div>

        {/* Episode Tabs */}
        <div className="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto dev-scrollbar py-1">
          {episodes.map(ep => {
            const epScenes = allScenes.filter(s => s.episodeNum === ep)
            const epSegments = segments.filter(s => s.episodeNum === ep)
            const hasScenes = epScenes.length > 0
            const hasSegments = epSegments.length > 0
            const isActive = selectedEpisode === ep
            return (
              <div key={ep} className="group/ep w-full flex items-center gap-0.5">
                <button
                  onClick={() => onSelectEpisode(ep)}
                  className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors"
                  style={{ background: isActive ? "#4F46E5" : "transparent", color: isActive ? "#fff" : "#666" }}
                >
                  <span>E{ep}</span>
                  <div className="flex gap-0.5 ml-1">
                    <div className="w-1 h-1 rounded-full" style={{ background: hasScenes ? "#10B981" : isActive ? "rgba(255,255,255,0.3)" : "#CCC" }} />
                    <div className="w-1 h-1 rounded-full" style={{ background: hasSegments ? "#3B82F6" : isActive ? "rgba(255,255,255,0.3)" : "#CCC" }} />
                  </div>
                </button>
                <button
                  onClick={() => onDeleteEpisode(ep)}
                  className="w-5 h-5 flex items-center justify-center rounded text-[10px] opacity-0 group-hover/ep:opacity-50 hover:!opacity-100 transition-opacity flex-shrink-0"
                  style={{ color: isActive ? "#EF4444" : "#EF4444" }}
                  title={`Delete Episode ${ep}`}
                >
                  ×
                </button>
              </div>
            )
          })}
          {canAddEpisode && (
            <button
              onClick={onAddEpisode}
              className="w-full h-7 flex items-center justify-center rounded transition-colors"
              style={{ color: "#AAA" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="12" x2="12" y1="5" y2="19" />
                <line x1="5" x2="19" y1="12" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scenes Header */}
      <div className="flex-shrink-0 px-3 pt-2 pb-1" style={{ borderBottom: "1px solid #D0D0D0" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Scenes</span>
            {episodeTotalChars > 0 && (
              <span className="text-[9px] px-1 py-0.5 rounded font-mono" style={{ background: "#E0E0E0", color: "#888" }}>
                {episodeTotalChars.toLocaleString()} chars
              </span>
            )}
          </div>
          <button onClick={onAddScene} className="text-[10px] transition-colors" style={{ color: "#4F46E5" }}>
            + Add
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-3 pt-1.5 pb-0">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search scenes..."
          className="w-full text-[10px] rounded px-2 py-1 focus:outline-none focus:ring-1"
          style={{ background: "#E0E0E0", border: "1px solid #C0C0C0", color: "#555" }}
        />
      </div>
      {(locations.length > 0 || moods.length > 0) && (
        <div className="flex-shrink-0 px-3 py-1.5 flex gap-1.5" style={{ borderBottom: "1px solid #D0D0D0" }}>
          {locations.length > 0 && (
            <select
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
              className="text-[10px] rounded px-1.5 py-0.5 appearance-none cursor-pointer focus:outline-none"
              style={{ background: "#E0E0E0", border: "1px solid #C0C0C0", color: "#555" }}
            >
              <option value="">All locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {moods.length > 0 && (
            <select
              value={filterMood}
              onChange={e => setFilterMood(e.target.value)}
              className="text-[10px] rounded px-1.5 py-0.5 appearance-none cursor-pointer focus:outline-none"
              style={{ background: "#E0E0E0", border: "1px solid #C0C0C0", color: "#555" }}
            >
              <option value="">All moods</option>
              {moods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Scene List */}
      <div className="flex-1 overflow-y-auto dev-scrollbar">
        {filteredScenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: "#BBB" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-50">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="text-[11px]">No scenes</span>
          </div>
        ) : (
          <div className="py-1">
            {filteredScenes.map(scene => {
              const isSelected = scene.id === selectedSceneId
              const isSaving = savingScenes.has(scene.id)
              const isEdited = scene.id in editingScenes
              const charCount = countSceneChars(scene)
              return (
                <button
                  key={scene.id}
                  onClick={() => onSelectScene(scene.id)}
                  className="w-full text-left px-3 py-2 flex items-start gap-2 transition-colors"
                  style={{
                    background: isSelected ? "#DCE0F5" : "transparent",
                    borderLeft: isSelected ? "3px solid #4F46E5" : "3px solid transparent",
                  }}
                >
                  {/* Mood color strip (storyboard indicator) */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                    <div
                      className="w-2 h-8 rounded-full"
                      style={{ background: getMoodColor(scene.mood), opacity: 0.8 }}
                      title={scene.mood || "No mood set"}
                    />
                    <span className="text-[9px] font-mono" style={{ color: "#AAA" }}>
                      {scene.sceneNum}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Heading */}
                    <p className="text-xs truncate" style={{ color: isSelected ? "#1A1A1A" : "#444" }}>
                      {scene.heading || "Untitled scene"}
                    </p>

                    {/* Meta line: location + time */}
                    {(scene.location || scene.timeOfDay) && (
                      <p className="text-[9px] truncate mt-0.5" style={{ color: "#999" }}>
                        {scene.location}{scene.location && scene.timeOfDay ? " · " : ""}{scene.timeOfDay}
                      </p>
                    )}

                    {/* Badges + word count */}
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {scene.mood && (
                        <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: `${getMoodColor(scene.mood)}22`, color: getMoodColor(scene.mood) }}>
                          {scene.mood}
                        </span>
                      )}
                      {charCount > 0 && (
                        <span className="text-[9px] font-mono" style={{ color: "#BBB" }}>
                          {charCount}c
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status indicators */}
                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    {isSaving && (
                      <div className="w-2 h-2 rounded-full border border-t-transparent animate-spin" style={{ borderColor: "#AAA" }} />
                    )}
                    {isEdited && !isSaving && (
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
