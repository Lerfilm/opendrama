"use client"

import { useState, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, Plus, Sparkles, Trash2, Loader2,
  ChevronDown, ChevronUp, Wand2, Lightbulb,
  Play, Save, Zap, CheckCircle, PenTool, Users,
} from "@/components/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { t } from "@/lib/i18n"
import { SegmentsTab } from "./segments-tab"

interface VideoSegment {
  id: string
  episodeNum: number
  segmentIndex: number
  durationSec: number
  prompt: string
  shotType: string | null
  cameraMove: string | null
  model: string | null
  resolution: string | null
  status: string
}

interface Script {
  id: string
  title: string
  genre: string
  format: string
  language: string
  logline: string | null
  synopsis: string | null
  coverWide: string | null
  coverTall: string | null
  targetEpisodes: number
  status: string
  scenes: Scene[]
  roles: Role[]
  videoSegments: VideoSegment[]
}

interface Scene {
  id: string
  episodeNum: number
  sceneNum: number
  heading: string | null
  action: string | null
  dialogue: string | null
  stageDirection: string | null
  mood: string | null
  location: string | null
  timeOfDay: string | null
  promptHint: string | null
}

interface Role {
  id: string
  name: string
  role: string
  description: string | null
  referenceImages?: string[]
}

interface Suggestion {
  type: "pacing" | "camera" | "emotion" | "dialogue"
  message: string
  sceneNumber?: number
}

interface PolishResult {
  original: Partial<Scene>
  polished: Partial<Scene>
}

export function ScriptEditor({ script: initial }: { script: Script }) {
  const [script, setScript] = useState(initial)
  const [activeTab, setActiveTab] = useState<"scenes" | "roles" | "segments">("scenes")
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedEpisode, setSelectedEpisode] = useState(1)
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set())
  const [editingScenes, setEditingScenes] = useState<Record<string, Partial<Scene>>>({})
  const [savingScenes, setSavingScenes] = useState<Set<string>>(new Set())
  const [isPolishing, setIsPolishing] = useState<string | null>(null)
  const [polishResult, setPolishResult] = useState<{ sceneId: string; data: PolishResult } | null>(null)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const router = useRouter()
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})

  // Group scenes by episode
  const episodeMap: Record<number, Scene[]> = {}
  for (const scene of script.scenes) {
    if (!episodeMap[scene.episodeNum]) episodeMap[scene.episodeNum] = []
    episodeMap[scene.episodeNum].push(scene)
  }
  const episodes = Object.keys(episodeMap).map(Number).sort((a, b) => a - b)
  const currentScenes = episodeMap[selectedEpisode] || []

  // Toggle scene expand/collapse
  const toggleScene = useCallback((sceneId: string) => {
    setExpandedScenes(prev => {
      const next = new Set(prev)
      if (next.has(sceneId)) {
        next.delete(sceneId)
      } else {
        next.add(sceneId)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedScenes(new Set(currentScenes.map(s => s.id)))
  }, [currentScenes])

  const collapseAll = useCallback(() => {
    setExpandedScenes(new Set())
  }, [])

  // Scene field editing with auto-save
  const updateSceneField = useCallback((sceneId: string, field: string, value: string) => {
    setEditingScenes(prev => ({
      ...prev,
      [sceneId]: { ...prev[sceneId], [field]: value },
    }))

    // Debounced auto-save
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

  // Save scene to server
  const saveScene = useCallback(async (sceneId: string) => {
    // Snapshot the current edits WITHOUT clearing them yet.
    // We only clear editingScenes AFTER the API call succeeds, so that
    // a concurrent refreshScript() can't overwrite input the user is still typing.
    let edits: Partial<Scene> | undefined
    setEditingScenes(prev => {
      edits = prev[sceneId]
      return prev // ← do NOT clear yet
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
        // Only remove the fields we just saved from editingScenes;
        // any new edits the user typed while the request was in-flight are preserved.
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
    } catch {
      // silent fail — keep edits in editingScenes so user doesn't lose input
    } finally {
      setSavingScenes(prev => {
        const next = new Set(prev)
        next.delete(sceneId)
        return next
      })
    }
  }, [])

  // Force save all editing scenes (clears debounce timers first)
  const saveAllScenes = useCallback(async () => {
    // Clear all pending debounce timers
    for (const key of Object.keys(saveTimeoutRef.current)) {
      clearTimeout(saveTimeoutRef.current[key])
      delete saveTimeoutRef.current[key]
    }
    const sceneIds = Object.keys(editingScenes)
    if (sceneIds.length > 0) {
      await Promise.all(sceneIds.map(id => saveScene(id)))
    }
  }, [editingScenes, saveScene])

  // Refresh script data from server (used by SegmentsTab after save)
  async function refreshScript() {
    try {
      const res = await fetch(`/api/scripts/${script.id}`)
      if (res.ok) {
        const data = await res.json()
        setScript(data.script)
      }
    } catch {
      // silent fail
    }
  }

  // Segment count for current episode
  const episodeSegmentCount = script.videoSegments?.filter(
    s => s.episodeNum === selectedEpisode
  ).length || 0

  // Workflow completion flags
  const scenesComplete = currentScenes.length > 0
  const segmentsComplete = episodeSegmentCount > 0

  // Compute next episode to generate
  const nextEpisodeToGenerate = episodes.length > 0 ? Math.max(...episodes) + 1 : 1
  const allEpisodesGenerated = nextEpisodeToGenerate > script.targetEpisodes

  // AI Generate script
  async function handleAIGenerate() {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const res = await fetch("/api/ai/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id }),
      })

      if (res.status === 402) {
        alert(t("studio.insufficientBalance"))
        return
      }
      if (res.status === 400) {
        const data = await res.json()
        alert(data.error || t("studio.saveFailed"))
        return
      }
      if (!res.ok) throw new Error("Failed")

      const result = await res.json()
      // Auto-switch to the newly generated episode
      if (result.episodeNum) {
        setSelectedEpisode(result.episodeNum)
      }

      const scriptRes = await fetch(`/api/scripts/${script.id}`)
      if (scriptRes.ok) {
        const data = await scriptRes.json()
        setScript(data.script)
      }
    } catch {
      alert(t("studio.saveFailed"))
    } finally {
      setIsGenerating(false)
    }
  }

  // AI Polish scene
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
      alert(t("studio.saveFailed"))
    } finally {
      setIsPolishing(null)
    }
  }

  // Accept polish result
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

    // Update local state immediately
    setScript(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s),
    }))

    // Save to server
    fetch("/api/scenes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sceneId, ...updates }),
    })

    setPolishResult(null)
  }

  // AI Suggest for episode
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
      alert(t("studio.saveFailed"))
    } finally {
      setIsSuggesting(false)
    }
  }

  // Add new episode (creates first empty scene in next episodeNum)
  async function handleAddEpisode() {
    const maxEp = episodes.length > 0 ? Math.max(...episodes) : 0
    const nextEp = maxEp + 1
    const maxAllowed = script.targetEpisodes || 10
    if (nextEp > maxAllowed) {
      alert(t("studio.maxEpisodesReached", { max: maxAllowed }))
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
          scenes: [...prev.scenes, scene].sort((a, b) =>
            a.episodeNum - b.episodeNum || a.sceneNum - b.sceneNum
          ),
        }))
        setSelectedEpisode(nextEp)
        setExpandedScenes(prev => new Set(prev).add(scene.id))
      }
    } catch { /* silent */ }
  }

  // Add new scene
  async function handleAddScene(afterSceneId?: string) {
    try {
      const res = await fetch("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum: selectedEpisode,
          afterSceneId,
        }),
      })

      if (res.ok) {
        const { scene } = await res.json()
        setScript(prev => ({
          ...prev,
          scenes: [...prev.scenes, scene].sort((a, b) =>
            a.episodeNum - b.episodeNum || a.sceneNum - b.sceneNum
          ),
        }))
        setExpandedScenes(prev => new Set(prev).add(scene.id))
      }
    } catch {
      // silent fail
    }
  }

  // Delete scene
  async function handleDeleteScene(sceneId: string) {
    if (!confirm(t("studio.deleteSceneConfirm"))) return

    try {
      const res = await fetch(`/api/scenes?id=${sceneId}`, { method: "DELETE" })
      if (res.ok) {
        setScript(prev => ({
          ...prev,
          scenes: prev.scenes.filter(s => s.id !== sceneId),
        }))
        setExpandedScenes(prev => {
          const next = new Set(prev)
          next.delete(sceneId)
          return next
        })
      }
    } catch {
      // silent fail
    }
  }

  const roleColors: Record<string, string> = {
    protagonist: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    antagonist: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    supporting: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    minor: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  }

  const suggestionIcons: Record<string, string> = {
    pacing: "🎬",
    camera: "📷",
    emotion: "💭",
    dialogue: "💬",
  }

  const hasUnsavedChanges = Object.keys(editingScenes).length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/studio">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{script.title}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{t(`studio.${script.status}`)}</Badge>
            <span>{t(`discover.${script.genre}`)}</span>
            <span>{t("studio.episode", { num: script.targetEpisodes })}</span>
          </div>
        </div>
        {hasUnsavedChanges && (
          <Button size="sm" variant="outline" onClick={saveAllScenes}>
            <Save className="w-4 h-4 mr-1" />
            {t("common.save")}
          </Button>
        )}
        {/* Roles badge */}
        <button
          onClick={() => setActiveTab("roles")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            activeTab === "roles"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Users className="w-3 h-3" />
          {script.roles.length}
        </button>
        <Button
          size="sm"
          onClick={handleAIGenerate}
          disabled={isGenerating || allEpisodesGenerated}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-1" />
          )}
          {isGenerating
            ? t("studio.generating")
            : allEpisodesGenerated
              ? t("studio.allEpisodesGenerated")
              : t("studio.generateEpisode", { num: nextEpisodeToGenerate })}
        </Button>
      </div>

      {/* Synopsis card */}
      {(script.logline || script.synopsis) && (
        <Card>
          <CardContent className="p-3">
            {script.logline && (
              <p className="text-sm font-medium mb-1">{script.logline}</p>
            )}
            {script.synopsis && (
              <p className="text-xs text-muted-foreground line-clamp-3">{script.synopsis}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Episode selector with completeness dots + add episode */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto flex-1 no-scrollbar">
            {episodes.map((ep) => {
              const epHasScenes = (episodeMap[ep] || []).length > 0
              const epHasSegments = (script.videoSegments?.filter(s => s.episodeNum === ep) || []).length > 0
              return (
                <button
                  key={ep}
                  onClick={() => {
                    setSelectedEpisode(ep)
                    setSuggestions(null)
                    setPolishResult(null)
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedEpisode === ep
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t("studio.episode", { num: ep })}
                  <span className="inline-flex gap-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${epHasScenes ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${epHasSegments ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                  </span>
                </button>
              )
            })}
            {/* Add Episode "+" button */}
            <button
              onClick={handleAddEpisode}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-muted hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title={t("studio.addEpisode")}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

      {/* Workflow stepper: ① Scenes → ② Segments → ③ Theater */}
      <div className="flex items-center gap-0 py-3">
        {/* Step 1: Scenes */}
        <button
          onClick={() => setActiveTab("scenes")}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
            activeTab === "scenes"
              ? "bg-primary text-primary-foreground"
              : scenesComplete
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                : "bg-muted text-muted-foreground"
          }`}>
            {scenesComplete && activeTab !== "scenes" ? <CheckCircle className="w-3.5 h-3.5" /> : "1"}
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-medium truncate ${activeTab === "scenes" ? "text-primary" : "text-muted-foreground"}`}>
              {t("studio.workflowScenes")}
            </p>
            <p className="text-[10px] text-muted-foreground">{currentScenes.length}</p>
          </div>
        </button>
        <div className={`h-0.5 w-6 flex-shrink-0 ${scenesComplete ? "bg-green-400" : "bg-muted"}`} />

        {/* Step 2: Segments */}
        <button
          onClick={async () => {
            await saveAllScenes()
            setActiveTab("segments")
          }}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
            activeTab === "segments"
              ? "bg-primary text-primary-foreground"
              : segmentsComplete
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                : "bg-muted text-muted-foreground"
          }`}>
            {segmentsComplete && activeTab !== "segments" ? <CheckCircle className="w-3.5 h-3.5" /> : "2"}
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-medium truncate ${activeTab === "segments" ? "text-primary" : "text-muted-foreground"}`}>
              {t("studio.workflowSegments")}
            </p>
            <p className="text-[10px] text-muted-foreground">{episodeSegmentCount}</p>
          </div>
        </button>
        <div className={`h-0.5 w-6 flex-shrink-0 ${segmentsComplete ? "bg-green-400" : "bg-muted"}`} />

        {/* Step 3: Theater (link) */}
        <Link
          href={`/generate/${script.id}/${selectedEpisode}`}
          onClick={() => {
            fetch(`/api/scripts/${script.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "ready" }),
            })
          }}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
            segmentsComplete
              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              : "bg-muted text-muted-foreground"
          }`}>
            <Play className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-medium truncate ${segmentsComplete ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground"}`}>
              {t("studio.workflowTheater")}
            </p>
          </div>
        </Link>
      </div>

      {/* SCENES TAB */}
      {activeTab === "scenes" && (
        <div className="space-y-3">
          {/* Expand/collapse controls */}
          {currentScenes.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={expandedScenes.size === currentScenes.length ? collapseAll : expandAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {expandedScenes.size === currentScenes.length ? t("studio.collapseAll") : t("studio.expandAll")}
              </button>
            </div>
          )}

          {/* Scene cards */}
          {currentScenes.map((scene) => {
            const isExpanded = expandedScenes.has(scene.id)
            const isSaving = savingScenes.has(scene.id)
            const isThisPolishing = isPolishing === scene.id

            return (
              <Card key={scene.id} className={isExpanded ? "ring-1 ring-primary/20" : ""}>
                <CardContent className="p-0">
                  {/* Collapsed header */}
                  <button
                    onClick={() => toggleScene(scene.id)}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/50 transition-colors"
                  >
                    <span className="text-xs font-mono font-bold text-primary w-8 flex-shrink-0">
                      S{scene.sceneNum}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getSceneValue(scene, "heading") || t("studio.sceneHeading")}
                      </p>
                      {!isExpanded && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {getSceneValue(scene, "action")?.substring(0, 80) || "..."}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                      {scene.mood && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {scene.mood}
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t">
                      {/* Heading */}
                      <div className="pt-3">
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          {t("studio.sceneHeading")}
                        </label>
                        <input
                          type="text"
                          value={getSceneValue(scene, "heading")}
                          onChange={e => updateSceneField(scene.id, "heading", e.target.value)}
                          placeholder="INT./EXT. Location - Time"
                          className="w-full text-sm px-2 py-1.5 rounded-md border bg-background"
                        />
                      </div>

                      {/* Action */}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          {t("studio.action")}
                        </label>
                        <textarea
                          value={getSceneValue(scene, "action")}
                          onChange={e => updateSceneField(scene.id, "action", e.target.value)}
                          placeholder={t("studio.action")}
                          rows={3}
                          className="w-full text-sm px-2 py-1.5 rounded-md border bg-background resize-none"
                        />
                      </div>

                      {/* Dialogue display */}
                      {scene.dialogue && scene.dialogue !== "[]" && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">
                            {t("studio.dialogue")}
                          </label>
                          <div className="space-y-1 pl-2 border-l-2 border-primary/20">
                            {(() => {
                              try {
                                const lines = JSON.parse(getSceneValue(scene, "dialogue") || "[]")
                                return lines.map(
                                  (line: { character: string; line: string; direction?: string }, i: number) => (
                                    <div key={i}>
                                      <p className="text-xs font-bold uppercase text-primary">
                                        {line.character}
                                      </p>
                                      {line.direction && (
                                        <p className="text-xs text-muted-foreground italic">
                                          ({line.direction})
                                        </p>
                                      )}
                                      <p className="text-sm">{line.line}</p>
                                    </div>
                                  )
                                )
                              } catch {
                                return <p className="text-xs text-muted-foreground">—</p>
                              }
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Stage Direction */}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          {t("studio.stageDirection")}
                        </label>
                        <textarea
                          value={getSceneValue(scene, "stageDirection")}
                          onChange={e => updateSceneField(scene.id, "stageDirection", e.target.value)}
                          placeholder={t("studio.stageDirection")}
                          rows={2}
                          className="w-full text-sm px-2 py-1.5 rounded-md border bg-background resize-none"
                        />
                      </div>

                      {/* Metadata: mood, location, timeOfDay */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                            {t("studio.mood")}
                          </label>
                          <input
                            type="text"
                            value={getSceneValue(scene, "mood")}
                            onChange={e => updateSceneField(scene.id, "mood", e.target.value)}
                            placeholder={t("studio.moodPlaceholder")}
                            className="w-full text-xs px-2 py-1 rounded-md border bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                            {t("studio.location")}
                          </label>
                          <input
                            type="text"
                            value={getSceneValue(scene, "location")}
                            onChange={e => updateSceneField(scene.id, "location", e.target.value)}
                            placeholder={t("studio.locationPlaceholder")}
                            className="w-full text-xs px-2 py-1 rounded-md border bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                            {t("studio.timeOfDay")}
                          </label>
                          <input
                            type="text"
                            value={getSceneValue(scene, "timeOfDay")}
                            onChange={e => updateSceneField(scene.id, "timeOfDay", e.target.value)}
                            placeholder={t("studio.timePlaceholder")}
                            className="w-full text-xs px-2 py-1 rounded-md border bg-background"
                          />
                        </div>
                      </div>

                      {/* Prompt Hint */}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          {t("studio.promptHint")}
                          <span className="ml-1 text-[10px] font-normal">({t("studio.promptHintDesc")})</span>
                        </label>
                        <input
                          type="text"
                          value={getSceneValue(scene, "promptHint")}
                          onChange={e => updateSceneField(scene.id, "promptHint", e.target.value)}
                          placeholder={t("studio.promptHintPlaceholder")}
                          className="w-full text-sm px-2 py-1.5 rounded-md border bg-background"
                        />
                      </div>

                      {/* Scene action buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePolish(scene.id)}
                          disabled={isThisPolishing}
                          className="text-xs"
                        >
                          {isThisPolishing ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Wand2 className="w-3 h-3 mr-1" />
                          )}
                          {isThisPolishing ? t("studio.polishing") : t("studio.aiPolish")}
                        </Button>
                        <div className="flex-1" />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAddScene(scene.id)}
                          className="text-xs text-muted-foreground"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          {t("studio.addSceneAfter")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteScene(scene.id)}
                          className="text-xs text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Polish result panel */}
          {polishResult && (
            <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
              <CardContent className="p-3 space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-purple-500" />
                  {t("studio.polishResult")}
                </h3>

                {polishResult.data.polished.action && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{t("studio.action")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-xs p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <p className="text-[10px] text-red-500 mb-1">{t("studio.polishOriginal")}</p>
                        <p className="line-through opacity-60">{(polishResult.data.original.action as string) || "—"}</p>
                      </div>
                      <div className="text-xs p-2 rounded bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30">
                        <p className="text-[10px] text-green-500 mb-1">{t("studio.polishImproved")}</p>
                        <p>{polishResult.data.polished.action as string}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" onClick={acceptPolish} className="bg-purple-500 hover:bg-purple-600 text-white">
                    {t("studio.polishAccept")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPolishResult(null)}>
                    {t("studio.polishReject")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Suggestions panel */}
          {suggestions && (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    {t("studio.suggestions")}
                  </h3>
                  <button
                    onClick={() => setSuggestions(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("common.close")}
                  </button>
                </div>

                {suggestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("studio.noSuggestions")}</p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((s, i) => (
                      <div key={i} className="flex gap-2 items-start p-2 rounded-md bg-background border">
                        <span className="text-lg flex-shrink-0">{suggestionIcons[s.type] || "💡"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {t(`studio.suggestion${s.type.charAt(0).toUpperCase() + s.type.slice(1)}` as "studio.suggestionPacing")}
                            </Badge>
                            {s.sceneNumber && (
                              <span className="text-[10px] text-muted-foreground">
                                {t("studio.scene", { num: s.sceneNumber })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs">{s.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {script.scenes.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <PenTool className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-semibold mb-1">{t("studio.emptySceneTitle")}</p>
                <p className="text-xs text-muted-foreground mb-4">{t("studio.emptySceneDesc")}</p>
                <div className="flex flex-col gap-2 items-center">
                  <Button size="sm" onClick={handleAIGenerate} disabled={isGenerating || allEpisodesGenerated} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Sparkles className="w-4 h-4 mr-1" />
                    {allEpisodesGenerated ? t("studio.allEpisodesGenerated") : t("studio.generateEpisode", { num: nextEpisodeToGenerate })}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">{t("studio.orAddManually")}</span>
                  <Button size="sm" variant="outline" onClick={() => handleAddScene()}>
                    <Plus className="w-4 h-4 mr-1" />
                    {t("studio.addScene")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add scene button */}
          {currentScenes.length > 0 && (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => handleAddScene()}
            >
              <Plus className="w-4 h-4 mr-1" />
              {t("studio.addScene")}
            </Button>
          )}

          {/* Next-step prompt: go to Segments */}
          {currentScenes.length > 0 && episodeSegmentCount === 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 text-center">
                <Zap className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm font-semibold mb-1">{t("studio.nextStepSegments")}</p>
                <p className="text-xs text-muted-foreground mb-3">{t("studio.nextStepSegmentsDesc")}</p>
                <Button size="sm" onClick={async () => {
                  await saveAllScenes()
                  setActiveTab("segments")
                }}>
                  {t("studio.goToSegments")}
                  <ChevronDown className="w-4 h-4 ml-1 -rotate-90" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ROLES TAB */}
      {activeTab === "roles" && (
        <div className="space-y-3">
          {script.roles.map((role) => (
            <Card key={role.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{role.name}</span>
                  <Badge
                    variant="secondary"
                    className={roleColors[role.role] || ""}
                  >
                    {t(`studio.${role.role}` as "studio.protagonist")}
                  </Badge>
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground mb-2">{role.description}</p>
                )}
                {role.referenceImages && role.referenceImages.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {role.referenceImages.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`${role.name} ref ${i + 1}`}
                        className="w-12 h-12 rounded object-cover border"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {script.roles.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p className="mb-1">{t("studio.noRoles")}</p>
                <p className="text-xs">{t("studio.noRolesHint")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* SEGMENTS TAB */}
      {activeTab === "segments" && (
        <SegmentsTab
          script={script}
          selectedEpisode={selectedEpisode}
          onDataChanged={refreshScript}
        />
      )}

      {/* Contextual floating action bar */}
      {activeTab === "scenes" && currentScenes.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40">
          <div className="max-w-screen-md mx-auto">
            <Card className="shadow-lg border-2">
              <CardContent className="p-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSuggest}
                  disabled={isSuggesting}
                  className="flex-1 text-xs"
                >
                  {isSuggesting ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Lightbulb className="w-3 h-3 mr-1" />
                  )}
                  {isSuggesting ? t("studio.suggesting") : t("studio.aiSuggest")}
                </Button>
                {episodeSegmentCount === 0 ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      await saveAllScenes()
                      setActiveTab("segments")
                    }}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    {t("studio.goToSegments")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      fetch(`/api/scripts/${script.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "ready" }),
                      }).then(() => {
                        router.push(`/generate/${script.id}/${selectedEpisode}`)
                      })
                    }}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    {t("studio.goToTheater")}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {activeTab === "segments" && episodeSegmentCount > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40">
          <div className="max-w-screen-md mx-auto">
            <Card className="shadow-lg border-2">
              <CardContent className="p-2 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    fetch(`/api/scripts/${script.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "ready" }),
                    }).then(() => {
                      router.push(`/generate/${script.id}/${selectedEpisode}`)
                    })
                  }}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs"
                >
                  <Play className="w-3 h-3 mr-1" />
                  {t("studio.goToTheater")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {activeTab === "roles" && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40">
          <div className="max-w-screen-md mx-auto">
            <Card className="shadow-lg border-2">
              <CardContent className="p-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("scenes")}
                  className="flex-1 text-xs"
                >
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  {t("studio.backToScenes")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
