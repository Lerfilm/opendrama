"use client"

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
  promptHint?: string | null
  duration?: number | null
  sortOrder: number
}

interface SceneHeaderProps {
  scene: Scene
  isSaving: boolean
  isEdited: boolean
  // Editable metadata
  getSceneValue?: (scene: Scene, field: keyof Scene) => string
  onUpdateField?: (sceneId: string, field: string, value: string) => void
  // Actions
  onAddScene?: (afterId: string) => void
  onDeleteScene?: (id: string) => void
}

export function SceneHeader({ scene, isSaving, isEdited, getSceneValue, onUpdateField, onAddScene, onDeleteScene }: SceneHeaderProps) {
  // Parse INT/EXT from heading
  const heading = scene.heading || ""
  const isInt = heading.toUpperCase().startsWith("INT")
  const isExt = heading.toUpperCase().startsWith("EXT")
  const intExt = isInt ? "INT" : isExt ? "EXT" : null

  // Extract characters from dialogue JSON
  let characters: string[] = []
  try {
    if (scene.dialogue) {
      const parsed = JSON.parse(scene.dialogue)
      if (Array.isArray(parsed)) {
        characters = [...new Set(parsed.map((d: { character?: string }) => d.character).filter(Boolean))] as string[]
      }
    }
  } catch { /* not JSON */ }

  const locationValue = getSceneValue ? getSceneValue(scene, "location") : (scene.location || "")
  const timeValue = getSceneValue ? getSceneValue(scene, "timeOfDay") : (scene.timeOfDay || "")
  const moodValue = getSceneValue ? getSceneValue(scene, "mood") : (scene.mood || "")

  return (
    <div className="flex-shrink-0 px-4 py-2" style={{ background: "#E8E8E8", borderBottom: "1px solid #C8C8C8" }}>
      {/* Row 1: Scene number + INT/EXT + characters + status + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Scene number */}
        <span className="text-[11px] font-mono font-bold" style={{ color: "#4F46E5" }}>
          S{scene.sceneNum}
        </span>

        {/* INT/EXT badge */}
        {intExt && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={isInt ? { background: "#DBEAFE", color: "#1D4ED8" } : { background: "#FFEDD5", color: "#C2410C" }}
          >
            {intExt}
          </span>
        )}

        {/* Characters */}
        {characters.map(name => (
          <span key={name} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#D1FAE5", color: "#065F46" }}>
            {name}
          </span>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status */}
        {isSaving && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: "#AAA" }}>
            <div className="w-2 h-2 rounded-full border border-t-transparent animate-spin" style={{ borderColor: "#AAA" }} />
            <span>Saving</span>
          </div>
        )}
        {isEdited && !isSaving && (
          <span className="text-[10px]" style={{ color: "#D97706" }}>Unsaved</span>
        )}

        {/* Scene actions */}
        {onAddScene && (
          <button onClick={() => onAddScene(scene.id)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#E0E0E0", color: "#666" }}>
            + Scene
          </button>
        )}
        {onDeleteScene && (
          <button onClick={() => onDeleteScene(scene.id)} className="text-[10px] px-2 py-0.5 rounded" style={{ color: "#EF4444" }}>
            Delete
          </button>
        )}
      </div>

      {/* Row 2: Editable metadata fields (Loc / Time / Mood) */}
      {onUpdateField && (
        <div className="flex items-center gap-3 mt-1.5 flex-wrap" style={{ fontFamily: "sans-serif" }}>
          {([
            { field: "location" as keyof Scene, label: "Loc", placeholder: "Office", width: "w-28" },
            { field: "timeOfDay" as keyof Scene, label: "Time", placeholder: "Night", width: "w-16" },
            { field: "mood" as keyof Scene, label: "Mood", placeholder: "tense", width: "w-16" },
          ] as const).map(({ field, label, placeholder, width }) => (
            <div key={field} className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: "#AAA" }}>{label}</span>
              <input type="text"
                value={field === "location" ? locationValue : field === "timeOfDay" ? timeValue : moodValue}
                onChange={e => onUpdateField(scene.id, field, e.target.value)}
                placeholder={placeholder}
                className={`text-[11px] focus:outline-none bg-transparent ${width}`}
                style={{ color: "#555", borderBottom: "1px solid #C8C8C8" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
