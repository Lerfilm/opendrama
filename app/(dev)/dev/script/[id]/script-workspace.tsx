"use client"

import { useState, useCallback, useRef } from "react"
import { t } from "@/lib/i18n"
import { AIConfirmModal } from "@/components/dev/ai-confirm-modal"
import { SceneListPanel } from "./components/scene-list-panel"
import { SceneDetailPanel } from "./components/scene-detail-panel"
import { InspectorPanel } from "./components/inspector-panel"

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

interface Role {
  id: string
  name: string
  role: string
  description?: string | null
  referenceImages?: string[]
}

interface VideoSegment {
  id: string
  episodeNum: number
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

interface PolishResult {
  original: Partial<Scene>
  polished: Partial<Scene>
}

interface Suggestion {
  type: string
  message: string
  sceneNumber?: number
}

interface Script {
  id: string
  title: string
  genre: string
  format: string
  language: string
  logline?: string | null
  synopsis?: string | null
  coverWide?: string | null
  coverTall?: string | null
  targetEpisodes: number
  status: string
  scenes: Scene[]
  roles: Role[]
  videoSegments: VideoSegment[]
}

export function ScriptWorkspace({ script: initial }: { script: Script }) {
  // === State ===
  const [script, setScript] = useState(initial)
  const [selectedEpisode, setSelectedEpisode] = useState(1)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"script-text" | "breakdown">("script-text")
  const [editingScenes, setEditingScenes] = useState<Record<string, Partial<Scene>>>({})
  const [savingScenes, setSavingScenes] = useState<Set<string>>(new Set())
  const [isPolishing, setIsPolishing] = useState<string | null>(null)
  const [polishResult, setPolishResult] = useState<{ sceneId: string; data: PolishResult } | null>(null)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ featureKey: string; featureLabel: string; action: () => void } | null>(null)
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})

  // === Derived ===
  const episodeMap: Record<number, Scene[]> = {}
  for (const scene of script.scenes) {
    if (!episodeMap[scene.episodeNum]) episodeMap[scene.episodeNum] = []
    episodeMap[scene.episodeNum].push(scene)
  }
  const episodes = Object.keys(episodeMap).map(Number).sort((a, b) => a - b)
  const currentScenes = episodeMap[selectedEpisode] || []
  const selectedScene = currentScenes.find(s => s.id === selectedSceneId) || null
  const currentSegments = script.videoSegments.filter(s => s.episodeNum === selectedEpisode)
  const selectedSegment = currentSegments.find(s => s.id === selectedSegmentId) || null

  // === Scene navigation ===
  function handleNavigateScene(delta: 1 | -1) {
    const currentScenesSorted = currentScenes.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.sceneNum - b.sceneNum)
    const idx = currentScenesSorted.findIndex(s => s.id === selectedSceneId)
    const nextIdx = idx + delta
    if (nextIdx >= 0 && nextIdx < currentScenesSorted.length) {
      setSelectedSceneId(currentScenesSorted[nextIdx].id)
    }
  }

  // === Business Logic (extracted from script-editor.tsx) ===

  const updateSceneField = useCallback((sceneId: string, field: string, value: string) => {
    setEditingScenes(prev => ({
      ...prev,
      [sceneId]: { ...prev[sceneId], [field]: value },
    }))
    if (saveTimeoutRef.current[sceneId]) {
      clearTimeout(saveTimeoutRef.current[sceneId])
    }
    saveTimeoutRef.current[sceneId] = setTimeout(() => {
      saveScene(sceneId)
    }, 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getSceneValue = useCallback((scene: Scene, field: keyof Scene): string => {
    const editing = editingScenes[scene.id]
    if (editing && field in editing) {
      return (editing[field] as string) || ""
    }
    return (scene[field] as string) || ""
  }, [editingScenes])

  const saveScene = useCallback(async (sceneId: string) => {
    let edits: Partial<Scene> | undefined
    setEditingScenes(prev => {
      edits = prev[sceneId]
      return prev
    })
    if (!edits) return
    const editsSnapshot = { ...edits }
    setSavingScenes(prev => new Set(prev).add(sceneId))

    try {
      const res = await fetch("/api/scenes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sceneId, ...editsSnapshot }),
      })
      if (res.ok) {
        const { scene: updated } = await res.json()
        setEditingScenes(prev => {
          const current = prev[sceneId]
          if (!current) return prev
          const remaining = Object.fromEntries(
            Object.entries(current).filter(([k]) => !(k in editsSnapshot))
          )
          const next = { ...prev }
          if (Object.keys(remaining).length === 0) {
            delete next[sceneId]
          } else {
            next[sceneId] = remaining
          }
          return next
        })
        setScript(p => ({
          ...p,
          scenes: p.scenes.map(s => s.id === sceneId ? { ...s, ...updated } : s),
        }))
      }
    } catch { /* silent */ } finally {
      setSavingScenes(prev => {
        const next = new Set(prev)
        next.delete(sceneId)
        return next
      })
    }
  }, [])

  const saveAllScenes = useCallback(async () => {
    for (const key of Object.keys(saveTimeoutRef.current)) {
      clearTimeout(saveTimeoutRef.current[key])
      delete saveTimeoutRef.current[key]
    }
    const sceneIds = Object.keys(editingScenes)
    if (sceneIds.length > 0) {
      await Promise.all(sceneIds.map(id => saveScene(id)))
    }
  }, [editingScenes, saveScene])

  async function refreshScript() {
    try {
      const res = await fetch(`/api/scripts/${script.id}`)
      if (res.ok) {
        const data = await res.json()
        setScript(data.script)
      }
    } catch { /* silent */ }
  }

  async function handleAIGenerate(generateAll = false) {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const res = await fetch("/api/ai/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, generateAll }),
      })
      if (res.status === 402) { alert("Insufficient balance"); return }
      if (!res.ok) throw new Error("Failed")
      const result = await res.json()
      if (result.episodeNum) setSelectedEpisode(result.episodeNum)
      await refreshScript()
    } catch {
      alert("Generation failed")
    } finally {
      setIsGenerating(false)
    }
  }

  async function handlePolish(sceneId: string) {
    setIsPolishing(sceneId)
    setPolishResult(null)
    try {
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId }),
      })
      if (!res.ok) throw new Error("Failed")
      const data = await res.json()
      setPolishResult({ sceneId, data })
    } catch {
      alert("Polish failed")
    } finally {
      setIsPolishing(null)
    }
  }

  function acceptPolish() {
    if (!polishResult) return
    const { sceneId, data } = polishResult
    const updates: Record<string, string> = {}
    const polished = data.polished as Record<string, unknown>
    if (polished.heading) updates.heading = polished.heading as string
    if (polished.action) updates.action = polished.action as string
    if (polished.dialogue) updates.dialogue = typeof polished.dialogue === "string" ? polished.dialogue : JSON.stringify(polished.dialogue)
    if (polished.stageDirection) updates.stageDirection = polished.stageDirection as string
    if (polished.mood) updates.mood = polished.mood as string
    if (polished.promptHint) updates.promptHint = polished.promptHint as string
    setScript(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s),
    }))
    fetch("/api/scenes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sceneId, ...updates }),
    })
    setPolishResult(null)
  }

  async function handleSuggest() {
    setIsSuggesting(true)
    setSuggestions(null)
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, episodeNum: selectedEpisode }),
      })
      if (!res.ok) throw new Error("Failed")
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch {
      alert("Suggest failed")
    } finally {
      setIsSuggesting(false)
    }
  }

  async function handleAddEpisode() {
    const maxEp = episodes.length > 0 ? Math.max(...episodes) : 0
    const nextEp = maxEp + 1
    if (nextEp > (script.targetEpisodes || 10)) {
      alert("Max episodes reached")
      return
    }
    try {
      const res = await fetch("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, episodeNum: nextEp }),
      })
      if (res.ok) {
        const { scene } = await res.json()
        setScript(prev => ({
          ...prev,
          scenes: [...prev.scenes, scene].sort((a, b) => a.episodeNum - b.episodeNum || a.sceneNum - b.sceneNum),
        }))
        setSelectedEpisode(nextEp)
      }
    } catch { /* silent */ }
  }

  async function handleAddScene(afterSceneId?: string) {
    try {
      const res = await fetch("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, episodeNum: selectedEpisode, afterSceneId }),
      })
      if (res.ok) {
        const { scene } = await res.json()
        setScript(prev => ({
          ...prev,
          scenes: [...prev.scenes, scene].sort((a, b) => a.episodeNum - b.episodeNum || a.sceneNum - b.sceneNum),
        }))
        setSelectedSceneId(scene.id)
      }
    } catch { /* silent */ }
  }

  async function handleDeleteScene(sceneId: string) {
    if (!confirm("Delete this scene?")) return
    try {
      const res = await fetch(`/api/scenes?id=${sceneId}`, { method: "DELETE" })
      if (res.ok) {
        setScript(prev => ({
          ...prev,
          scenes: prev.scenes.filter(s => s.id !== sceneId),
        }))
        if (selectedSceneId === sceneId) setSelectedSceneId(null)
      }
    } catch { /* silent */ }
  }

  // === Render ===
  function confirmThen(featureKey: string, featureLabel: string, action: () => void) {
    setPendingConfirm({ featureKey, featureLabel, action })
  }

  return (
    <>
    <div className="h-full grid grid-rows-[1fr] grid-cols-[280px_1fr_300px]">
      {/* Left: Scene List */}
      <SceneListPanel
        scenes={currentScenes}
        episodes={episodes}
        allScenes={script.scenes}
        segments={script.videoSegments}
        selectedEpisode={selectedEpisode}
        onSelectEpisode={setSelectedEpisode}
        selectedSceneId={selectedSceneId}
        onSelectScene={setSelectedSceneId}
        savingScenes={savingScenes}
        editingScenes={editingScenes}
        onAddEpisode={handleAddEpisode}
        onAddScene={() => handleAddScene()}
        targetEpisodes={script.targetEpisodes}
      />

      {/* Center: Scene Detail */}
      <SceneDetailPanel
        scene={selectedScene}
        scenes={currentScenes}
        segments={currentSegments}
        editingScenes={editingScenes}
        savingScenes={savingScenes}
        getSceneValue={getSceneValue}
        onUpdateField={updateSceneField}
        onSaveAll={saveAllScenes}
        isPolishing={isPolishing}
        onPolish={(sceneId) => confirmThen("ai_polish", "AI Polish", () => handlePolish(sceneId))}
        polishResult={polishResult}
        onAcceptPolish={acceptPolish}
        onDismissPolish={() => setPolishResult(null)}
        isSuggesting={isSuggesting}
        suggestions={suggestions}
        onSuggest={() => confirmThen("ai_suggest", "AI Suggest", handleSuggest)}
        onDismissSuggestions={() => setSuggestions(null)}
        isGenerating={isGenerating}
        onGenerate={(all) => confirmThen("generate_script", all ? "AI Generate All Episodes" : "AI Generate Episode", () => handleAIGenerate(all))}
        onAddScene={handleAddScene}
        onDeleteScene={handleDeleteScene}
        selectedSceneId={selectedSceneId}
        onSelectScene={setSelectedSceneId}
        activeTab={activeTab}
        onSetActiveTab={setActiveTab}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={setSelectedSegmentId}
        scriptId={script.id}
        selectedEpisode={selectedEpisode}
        roles={script.roles}
        onRefreshScript={refreshScript}
        onNavigateScene={handleNavigateScene}
      />

      {/* Right: Inspector */}
      <InspectorPanel
        script={script}
        selectedScene={selectedScene}
        selectedSegment={selectedSegment}
        editingScenes={editingScenes}
        getSceneValue={getSceneValue}
        onUpdateField={updateSceneField}
        roles={script.roles}
      />
    </div>

    {pendingConfirm && (
      <AIConfirmModal
        featureKey={pendingConfirm.featureKey}
        featureLabel={pendingConfirm.featureLabel}
        onConfirm={() => { const fn = pendingConfirm.action; setPendingConfirm(null); fn() }}
        onCancel={() => setPendingConfirm(null)}
      />
    )}
    </>
  )
}
