"use client"

interface Scene {
  id: string
  sceneNum: number
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
  dialogue?: string | null
}

interface SceneHeaderProps {
  scene: Scene
  isSaving: boolean
  isEdited: boolean
}

export function SceneHeader({ scene, isSaving, isEdited }: SceneHeaderProps) {
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

  return (
    <div className="flex items-center gap-2 px-4 py-2 flex-wrap" style={{ background: "#E8E8E8", borderBottom: "1px solid #C8C8C8" }}>
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

      {/* Location */}
      {scene.location && (
        <span className="text-[11px]" style={{ color: "#666" }}>{scene.location}</span>
      )}

      {/* Time of day */}
      {scene.timeOfDay && (
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#E0E0E0", color: "#777" }}>
          {scene.timeOfDay}
        </span>
      )}

      {/* Mood */}
      {scene.mood && (
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#EDE9FE", color: "#7C3AED" }}>
          {scene.mood}
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
    </div>
  )
}
