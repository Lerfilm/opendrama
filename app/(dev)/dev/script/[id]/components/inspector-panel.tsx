"use client"

import { useState } from "react"

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

interface VideoSegment {
  id: string
  segmentIndex: number
  sceneNum: number
  durationSec: number
  prompt: string
  shotType?: string | null
  cameraMove?: string | null
  model?: string | null
  resolution?: string | null
  status: string
}

interface Role {
  id: string
  name: string
  role: string
  description?: string | null
  referenceImages?: string[]
}

interface Script {
  id: string
  title: string
  genre: string
  format: string
  language: string
  logline?: string | null
  synopsis?: string | null
  targetEpisodes: number
  status: string
  scenes: Scene[]
  roles: Role[]
}

interface InspectorPanelProps {
  script: Script
  selectedScene: Scene | null
  selectedSegment: VideoSegment | null
  editingScenes: Record<string, Partial<Scene>>
  getSceneValue: (scene: Scene, field: keyof Scene) => string
  onUpdateField: (sceneId: string, field: string, value: string) => void
  roles: Role[]
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-[10px] w-20 flex-shrink-0 pt-0.5" style={{ color: "#AAA" }}>{label}</span>
      <div className="flex-1 min-w-0 text-xs" style={{ color: "#444" }}>{children}</div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider pt-4 pb-1.5 first:pt-0" style={{ color: "#AAA" }}>
      {children}
    </div>
  )
}

const roleColorStyles: Record<string, { background: string; color: string }> = {
  protagonist: { background: "#DBEAFE", color: "#1D4ED8" },
  antagonist: { background: "#FEE2E2", color: "#991B1B" },
  supporting: { background: "#D1FAE5", color: "#065F46" },
  minor: { background: "#F3F4F6", color: "#6B7280" },
}

const GENRE_OPTIONS = ["drama", "comedy", "thriller", "romance", "scifi", "fantasy", "action", "horror", "mystery"]
const FORMAT_OPTIONS = ["shortdrama", "series", "movie", "animation", "stageplay"]

export function InspectorPanel({
  script, selectedScene, selectedSegment,
  editingScenes, getSceneValue, onUpdateField, roles,
}: InspectorPanelProps) {
  const [editTitle, setEditTitle] = useState(script.title)
  const [editGenre, setEditGenre] = useState(script.genre)
  const [editFormat, setEditFormat] = useState(script.format)
  const [isSavingMeta, setIsSavingMeta] = useState(false)
  const [metaSaved, setMetaSaved] = useState(false)

  async function saveScriptMeta() {
    setIsSavingMeta(true)
    try {
      await fetch(`/api/scripts/${script.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, genre: editGenre, format: editFormat }),
      })
      setMetaSaved(true)
      setTimeout(() => setMetaSaved(false), 2000)
    } finally {
      setIsSavingMeta(false)
    }
  }
  // === Segment Selected ===
  if (selectedSegment) {
    const segStatusStyle =
      selectedSegment.status === "done" ? { background: "#D1FAE5", color: "#065F46" } :
      selectedSegment.status === "failed" ? { background: "#FEE2E2", color: "#991B1B" } :
      { background: "#F3F4F6", color: "#6B7280" }
    return (
      <div className="h-full overflow-y-auto dev-scrollbar px-3 py-3" style={{ background: "#F0F0F0", borderLeft: "1px solid #C8C8C8" }}>
        <SectionHeader>Segment #{selectedSegment.segmentIndex + 1}</SectionHeader>
        <PropRow label="Scene">{selectedSegment.sceneNum}</PropRow>
        <PropRow label="Duration">{selectedSegment.durationSec}s</PropRow>
        <PropRow label="Shot">{selectedSegment.shotType || "—"}</PropRow>
        <PropRow label="Camera">{selectedSegment.cameraMove || "—"}</PropRow>
        <PropRow label="Model">{selectedSegment.model?.replace(/_/g, " ") || "—"}</PropRow>
        <PropRow label="Resolution">{selectedSegment.resolution || "—"}</PropRow>
        <PropRow label="Status">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={segStatusStyle}>
            {selectedSegment.status}
          </span>
        </PropRow>

        <SectionHeader>Prompt</SectionHeader>
        <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: "#777" }}>
          {selectedSegment.prompt}
        </p>
      </div>
    )
  }

  // === Scene Selected ===
  if (selectedScene) {
    // Characters from dialogue
    let characters: string[] = []
    try {
      if (selectedScene.dialogue) {
        const parsed = JSON.parse(selectedScene.dialogue)
        if (Array.isArray(parsed)) {
          characters = [...new Set(parsed.map((d: { character?: string }) => d.character).filter(Boolean))] as string[]
        }
      }
    } catch { /* not JSON */ }

    return (
      <div className="h-full overflow-y-auto dev-scrollbar px-3 py-3" style={{ background: "#F0F0F0", borderLeft: "1px solid #C8C8C8" }}>
        <SectionHeader>Scene Properties</SectionHeader>
        <PropRow label="Episode">{selectedScene.episodeNum}</PropRow>
        <PropRow label="Scene #">{selectedScene.sceneNum}</PropRow>
        <PropRow label="Heading">
          <span className="truncate block">{getSceneValue(selectedScene, "heading") || "—"}</span>
        </PropRow>
        <PropRow label="Location">{getSceneValue(selectedScene, "location") || "—"}</PropRow>
        <PropRow label="Time">{getSceneValue(selectedScene, "timeOfDay") || "—"}</PropRow>
        <PropRow label="Mood">{getSceneValue(selectedScene, "mood") || "—"}</PropRow>

        {characters.length > 0 && (
          <>
            <SectionHeader>Characters</SectionHeader>
            <div className="flex flex-wrap gap-1">
              {characters.map(name => {
                const role = roles.find(r => r.name === name)
                return (
                  <div key={name} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: "#E8E8E8" }}>
                    {role?.referenceImages?.[0] ? (
                      <img src={role.referenceImages[0]} alt="" className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px]" style={{ background: "#D0D0D0", color: "#888" }}>
                        {name[0]}
                      </div>
                    )}
                    <span className="text-[10px]" style={{ color: "#666" }}>{name}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {getSceneValue(selectedScene, "promptHint") && (
          <>
            <SectionHeader>Prompt Hint</SectionHeader>
            <p className="text-[11px] leading-relaxed" style={{ color: "#888" }}>
              {getSceneValue(selectedScene, "promptHint")}
            </p>
          </>
        )}
      </div>
    )
  }

  // === Nothing Selected: Script Overview ===
  const scriptStatusStyle =
    script.status === "published" ? { background: "#E0E7FF", color: "#3730A3" } :
    script.status === "ready" ? { background: "#D1FAE5", color: "#065F46" } :
    { background: "#F3F4F6", color: "#6B7280" }

  return (
    <div className="h-full overflow-y-auto dev-scrollbar px-3 py-3" style={{ background: "#F0F0F0", borderLeft: "1px solid #C8C8C8" }}>
      <div className="flex items-center justify-between pt-0 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#AAA" }}>Script</span>
        <button
          onClick={saveScriptMeta}
          disabled={isSavingMeta}
          className="text-[9px] px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
          style={{ background: metaSaved ? "#D1FAE5" : "#E0E4F8", color: metaSaved ? "#065F46" : "#4F46E5" }}
        >
          {isSavingMeta ? "Saving..." : metaSaved ? "✓ Saved" : "Save"}
        </button>
      </div>
      <div className="space-y-2 mb-2">
        <div>
          <label className="text-[9px] uppercase tracking-wider" style={{ color: "#AAA" }}>Title 剧名</label>
          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="w-full h-7 px-2 text-xs rounded mt-0.5 focus:outline-none"
            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }}
          />
        </div>
        <div>
          <label className="text-[9px] uppercase tracking-wider" style={{ color: "#AAA" }}>Genre</label>
          <select
            value={editGenre}
            onChange={e => setEditGenre(e.target.value)}
            className="w-full h-7 px-2 text-xs rounded mt-0.5 focus:outline-none"
            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }}
          >
            {GENRE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] uppercase tracking-wider" style={{ color: "#AAA" }}>Format</label>
          <select
            value={editFormat}
            onChange={e => setEditFormat(e.target.value)}
            className="w-full h-7 px-2 text-xs rounded mt-0.5 focus:outline-none"
            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }}
          >
            {FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      <PropRow label="Language">{script.language}</PropRow>
      <PropRow label="Episodes">{script.targetEpisodes}</PropRow>
      <PropRow label="Status">
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={scriptStatusStyle}>
          {script.status}
        </span>
      </PropRow>

      {script.logline && (
        <>
          <SectionHeader>Logline</SectionHeader>
          <p className="text-[11px] leading-relaxed" style={{ color: "#888" }}>{script.logline}</p>
        </>
      )}

      {script.synopsis && (
        <>
          <SectionHeader>Synopsis</SectionHeader>
          <p className="text-[11px] leading-relaxed line-clamp-6" style={{ color: "#888" }}>{script.synopsis}</p>
        </>
      )}

      {/* Roles */}
      {roles.length > 0 && (
        <>
          <SectionHeader>Cast ({roles.length})</SectionHeader>
          <div className="space-y-2">
            {roles.map(role => {
              const rs = roleColorStyles[role.role] || roleColorStyles.minor
              return (
                <div key={role.id} className="p-2 rounded" style={{ background: "#E8E8E8", border: "1px solid #D8D8D8" }}>
                  <div className="flex items-center gap-2">
                    {role.referenceImages?.[0] ? (
                      <img src={role.referenceImages[0]} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-medium" style={{ background: "#D0D0D0", color: "#888" }}>
                        {role.name[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: "#1A1A1A" }}>{role.name}</p>
                      <span className="text-[9px] px-1 py-0.5 rounded" style={rs}>
                        {role.role}
                      </span>
                    </div>
                  </div>
                  {role.description && (
                    <p className="text-[10px] mt-1.5 line-clamp-2" style={{ color: "#AAA" }}>{role.description}</p>
                  )}
                  {role.referenceImages && role.referenceImages.length > 1 && (
                    <div className="flex gap-1 mt-1.5">
                      {role.referenceImages.slice(0, 4).map((img, i) => (
                        <img key={i} src={img} alt="" className="w-10 h-10 rounded object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
