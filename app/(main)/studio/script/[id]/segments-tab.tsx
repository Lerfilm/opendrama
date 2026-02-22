"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Zap, Loader2, ChevronDown, ChevronUp, Coins,
  Save, ImageIcon, Sparkles, CheckCircle, Play,
} from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"
import { MODEL_PRICING } from "@/lib/model-pricing"

// ─── Types ────────────────────────────────────────

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

interface GeneratedSegment {
  segmentIndex: number
  sceneNum: number
  durationSec: number
  prompt: string
  shotType: string
  cameraMove: string
}

interface SegmentsTabProps {
  script: {
    id: string
    title: string
    genre: string
    language: string
    coverWide: string | null
    coverTall: string | null
    scenes: Scene[]
    roles: Role[]
    videoSegments: VideoSegment[]
  }
  selectedEpisode: number
  onDataChanged: () => void
}

// ─── Constants ────────────────────────────────────

const MODELS = [
  { id: "seedance_1_5_pro",      name: "Seedance 1.5 Pro",       resolutions: ["1080p", "720p"] },
  { id: "seedance_1_0_pro",      name: "Seedance 1.0 Pro",       resolutions: ["1080p", "720p"] },
  { id: "seedance_1_0_pro_fast", name: "Seedance 1.0 Pro Fast",  resolutions: ["1080p", "720p"] },
  { id: "jimeng_3_0_pro",        name: "Jimeng 3.0 Pro",         resolutions: ["1080p"] },
  { id: "jimeng_3_0",            name: "Jimeng 3.0",             resolutions: ["1080p", "720p"] },
  { id: "jimeng_s2_pro",         name: "Jimeng S2 Pro",          resolutions: ["720p"] },
]

const SHOT_TYPES = ["wide", "medium", "close-up", "extreme-close-up"]
const CAMERA_MOVES = ["static", "pan", "tilt", "dolly", "tracking", "orbit"]

// ─── Component ────────────────────────────────────

export function SegmentsTab({ script, selectedEpisode, onDataChanged }: SegmentsTabProps) {
  // Model & resolution
  const [selectedModel, setSelectedModel] = useState("seedance_1_5_pro")
  const [selectedResolution, setSelectedResolution] = useState("720p")

  // AI Split state
  const [isSplitting, setIsSplitting] = useState(false)
  const [generatedSegments, setGeneratedSegments] = useState<GeneratedSegment[]>([])

  // Editing state
  const [editingPrompts, setEditingPrompts] = useState<Record<number, string>>({})
  const [editingShotTypes, setEditingShotTypes] = useState<Record<number, string>>({})
  const [editingCameraMoves, setEditingCameraMoves] = useState<Record<number, string>>({})
  const [editingDurations, setEditingDurations] = useState<Record<number, number>>({})
  const [expandedSegment, setExpandedSegment] = useState<number | null>(null)

  // Save state
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Cover state
  const [coverStatus, setCoverStatus] = useState<"idle" | "generating" | "done" | "failed">("idle")
  const [coverTallTaskId, setCoverTallTaskId] = useState<string | null>(null)
  const [coverTall, setCoverTall] = useState<string | null>(script.coverTall)
  const coverPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Cover polling effect ─────────────────────
  useEffect(() => {
    if (coverStatus !== "generating" || !coverTallTaskId) return

    if (coverPollRef.current) clearInterval(coverPollRef.current)

    coverPollRef.current = setInterval(async () => {
      try {
        const params = new URLSearchParams({ scriptId: script.id, tallTaskId: coverTallTaskId })

        const res = await fetch(`/api/cover/status?${params}`)
        if (!res.ok) return
        const data = await res.json()

        if (data.status === "done") {
          clearInterval(coverPollRef.current!)
          coverPollRef.current = null
          setCoverStatus("done")
          if (data.coverTall) setCoverTall(data.coverTall)
          onDataChanged()
        } else if (data.status === "failed") {
          clearInterval(coverPollRef.current!)
          coverPollRef.current = null
          setCoverStatus("failed")
        }
      } catch {
        // ignore transient poll errors
      }
    }, 5000)

    return () => {
      if (coverPollRef.current) clearInterval(coverPollRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverTallTaskId, coverStatus])

  // ─── Derived data ─────────────────────────────

  // Existing saved segments for this episode
  const existingSegments = useMemo(
    () => script.videoSegments.filter(s => s.episodeNum === selectedEpisode),
    [script.videoSegments, selectedEpisode]
  )

  // Scenes for current episode
  const currentScenes = useMemo(
    () => script.scenes.filter(s => s.episodeNum === selectedEpisode),
    [script.scenes, selectedEpisode]
  )

  // Active model info
  const modelInfo = MODELS.find(m => m.id === selectedModel)
  const availableResolutions = modelInfo?.resolutions || ["720p"]

  // Are we working with generated (unsaved) or existing (saved) segments?
  const activeSegments = generatedSegments.length > 0 ? generatedSegments : []
  const hasExistingPending = existingSegments.some(s => s.status === "pending")
  const hasUnsavedSegments = generatedSegments.length > 0

  // Cost estimation
  const segmentsForCost = hasUnsavedSegments
    ? generatedSegments
    : existingSegments.filter(s => s.status === "pending")

  const estimatedCost = useMemo(() => {
    const pricing = MODEL_PRICING[selectedModel]?.[selectedResolution]
    if (!pricing || segmentsForCost.length === 0) return 0
    const totalDuration = segmentsForCost.reduce((sum, seg) => {
      const dur = editingDurations[seg.segmentIndex] ?? seg.durationSec
      return sum + dur
    }, 0)
    // API cost per second (in cents) × duration × 2 (markup) / 100 → coins
    return Math.ceil(pricing * totalDuration * 2 / 100)
  }, [selectedModel, selectedResolution, segmentsForCost, editingDurations])

  // ─── Handlers ─────────────────────────────────

  // AI Split: generate segments from scenes
  async function handleSplit() {
    if (isSplitting || currentScenes.length === 0) return
    setIsSplitting(true)
    setGeneratedSegments([])
    setEditingPrompts({})
    setEditingShotTypes({})
    setEditingCameraMoves({})
    setEditingDurations({})
    setSaveSuccess(false)

    try {
      const res = await fetch("/api/ai/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum: selectedEpisode,
          model: selectedModel,
          resolution: selectedResolution,
        }),
      })

      if (!res.ok) throw new Error("Split failed")

      const data = await res.json()
      const segs: GeneratedSegment[] = (data.segments || []).map(
        (seg: GeneratedSegment, i: number) => ({
          segmentIndex: seg.segmentIndex ?? i,
          sceneNum: seg.sceneNum ?? 1,
          durationSec: seg.durationSec || 15,
          prompt: seg.prompt || "",
          shotType: seg.shotType || "medium",
          cameraMove: seg.cameraMove || "static",
        })
      )
      setGeneratedSegments(segs)
      if (segs.length > 0) setExpandedSegment(0)
    } catch {
      alert(t("studio.splitFailed") || "Split failed")
    } finally {
      setIsSplitting(false)
    }
  }

  // Save segments to DB
  async function handleSave() {
    if (isSaving) return
    const segsToSave = generatedSegments.map(seg => ({
      segmentIndex: seg.segmentIndex,
      sceneNum: seg.sceneNum,
      durationSec: editingDurations[seg.segmentIndex] ?? seg.durationSec,
      prompt: editingPrompts[seg.segmentIndex] ?? seg.prompt,
      shotType: editingShotTypes[seg.segmentIndex] ?? seg.shotType,
      cameraMove: editingCameraMoves[seg.segmentIndex] ?? seg.cameraMove,
    }))

    if (segsToSave.length === 0) return

    setIsSaving(true)
    setSaveSuccess(false)

    try {
      const res = await fetch("/api/segments/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum: selectedEpisode,
          model: selectedModel,
          resolution: selectedResolution,
          segments: segsToSave,
        }),
      })

      if (!res.ok) throw new Error("Save failed")

      setSaveSuccess(true)
      setGeneratedSegments([])
      setEditingPrompts({})
      setEditingShotTypes({})
      setEditingCameraMoves({})
      setEditingDurations({})
      onDataChanged()

      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      alert(t("studio.saveFailed") || "Save failed")
    } finally {
      setIsSaving(false)
    }
  }

  // Generate cover
  async function handleGenerateCover() {
    setCoverStatus("generating")
    setCoverTallTaskId(null)
    try {
      const res = await fetch("/api/cover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum: selectedEpisode,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Cover generation failed")
      }
      const data = await res.json()
      // Save task ID to start polling
      setCoverTallTaskId(data.tallTaskId)
      // coverStatus stays "generating" — polling effect handles done/failed
    } catch (err) {
      console.error("[Cover] Submit error:", err)
      setCoverStatus("failed")
    }
  }

  // Get segment display value (with editing override)
  function getPrompt(seg: GeneratedSegment | VideoSegment): string {
    return editingPrompts[seg.segmentIndex] ?? seg.prompt
  }

  function getShotType(seg: GeneratedSegment | VideoSegment): string {
    return editingShotTypes[seg.segmentIndex] ?? seg.shotType ?? "medium"
  }

  function getCameraMove(seg: GeneratedSegment | VideoSegment): string {
    return editingCameraMoves[seg.segmentIndex] ?? seg.cameraMove ?? "static"
  }

  function getDuration(seg: GeneratedSegment | VideoSegment): number {
    return editingDurations[seg.segmentIndex] ?? seg.durationSec
  }

  // ─── Render helpers ───────────────────────────

  function renderSegmentCard(seg: GeneratedSegment | VideoSegment, isExisting: boolean) {
    const idx = seg.segmentIndex
    const isExpanded = expandedSegment === idx
    const prompt = getPrompt(seg)
    const shotType = getShotType(seg)
    const cameraMove = getCameraMove(seg)
    const duration = getDuration(seg)
    const isEditable = isExisting ? (seg as VideoSegment).status === "pending" : true

    return (
      <Card key={idx} className={isExpanded ? "ring-1 ring-primary/20" : ""}>
        <CardContent className="p-0">
          {/* Collapsed header */}
          <button
            onClick={() => setExpandedSegment(isExpanded ? null : idx)}
            className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/50 transition-colors"
          >
            <span className="text-xs font-mono font-bold text-primary w-6 flex-shrink-0">
              #{idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{prompt.substring(0, 80) || "..."}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {duration}s
              </Badge>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {shotType}
              </Badge>
              {isExisting && (
                <Badge
                  variant={(seg as VideoSegment).status === "pending" ? "outline" : "secondary"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {(seg as VideoSegment).status}
                </Badge>
              )}
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {/* Expanded editor */}
          {isExpanded && (
            <div className="px-3 pb-3 space-y-3 border-t">
              {/* Prompt */}
              <div className="pt-3">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("studio.segmentPrompt")}
                </label>
                <textarea
                  value={prompt}
                  onChange={e => isEditable && setEditingPrompts(prev => ({ ...prev, [idx]: e.target.value }))}
                  readOnly={!isEditable}
                  rows={5}
                  className="w-full text-sm px-2 py-1.5 rounded-md border bg-background resize-none"
                />
              </div>

              {/* Shot type + Camera move + Duration */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                    {t("studio.shotType")}
                  </label>
                  <select
                    value={shotType}
                    onChange={e => isEditable && setEditingShotTypes(prev => ({ ...prev, [idx]: e.target.value }))}
                    disabled={!isEditable}
                    className="w-full text-xs px-2 py-1.5 rounded-md border bg-background"
                  >
                    {SHOT_TYPES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                    {t("studio.cameraMove")}
                  </label>
                  <select
                    value={cameraMove}
                    onChange={e => isEditable && setEditingCameraMoves(prev => ({ ...prev, [idx]: e.target.value }))}
                    disabled={!isEditable}
                    className="w-full text-xs px-2 py-1.5 rounded-md border bg-background"
                  >
                    {CAMERA_MOVES.map(cm => (
                      <option key={cm} value={cm}>{cm}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                    {t("studio.duration")}
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={e => isEditable && setEditingDurations(prev => ({ ...prev, [idx]: parseInt(e.target.value) || 15 }))}
                    readOnly={!isEditable}
                    min={5}
                    max={60}
                    className="w-full text-xs px-2 py-1.5 rounded-md border bg-background"
                  />
                </div>
              </div>

              {/* Corresponding scene info */}
              {currentScenes.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                  <p className="font-medium mb-1">{t("studio.relatedScenes") || "Related Scenes"}:</p>
                  {currentScenes.map(scene => (
                    <p key={scene.id} className="truncate">
                      S{scene.sceneNum}: {scene.heading || scene.action?.substring(0, 60) || "—"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Main render ──────────────────────────────

  return (
    <div className="space-y-4">
      {/* A. Model & Resolution selector */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t("studio.selectModel")}
              </label>
              <select
                value={selectedModel}
                onChange={e => {
                  const m = e.target.value
                  setSelectedModel(m)
                  const info = MODELS.find(x => x.id === m)
                  if (info && !info.resolutions.includes(selectedResolution)) {
                    setSelectedResolution(info.resolutions[0])
                  }
                }}
                className="w-full text-sm px-2 py-1.5 rounded-md border bg-background"
              >
                {MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t("studio.selectResolution")}
              </label>
              <select
                value={selectedResolution}
                onChange={e => setSelectedResolution(e.target.value)}
                className="w-full text-sm px-2 py-1.5 rounded-md border bg-background"
              >
                {availableResolutions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* B. AI Split action */}
      <Card className="border-dashed">
        <CardContent className="p-4 text-center">
          <Zap className="w-8 h-8 mx-auto mb-2 text-primary/60" />
          <h3 className="text-sm font-bold mb-1">{t("studio.aiSplit")}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t("studio.splitDesc")}
          </p>
          <Button
            onClick={handleSplit}
            disabled={isSplitting || currentScenes.length === 0}
            className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
          >
            {isSplitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {t("studio.splitting")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                {hasExistingPending ? t("studio.resplit") : t("studio.aiSplit")}
              </>
            )}
          </Button>
          {currentScenes.length === 0 && (
            <p className="text-xs text-destructive mt-2">
              {t("studio.noScenesForSplit") || "Add scenes to this episode first"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* C. Generated (unsaved) segments */}
      {hasUnsavedSegments && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {t("studio.segmentsTab")} ({generatedSegments.length})
            </h3>
            <Badge variant="outline" className="text-[10px]">
              {t("studio.unsaved") || "Unsaved"}
            </Badge>
          </div>
          {generatedSegments.map(seg => renderSegmentCard(seg, false))}

          {/* Cost estimate */}
          {estimatedCost > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-1.5 text-sm">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="font-semibold">{t("studio.estimatedCost")}: {estimatedCost}</span>
                <span className="text-xs text-muted-foreground">coins</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {t("studio.estimatedCostNote")}
              </span>
            </div>
          )}

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {t("studio.savingSegments")}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" />
                {t("studio.saveSegments")}
              </>
            )}
          </Button>

          {saveSuccess && (
            <p className="text-xs text-green-600 text-center">{t("studio.segmentsSaved")}</p>
          )}
        </div>
      )}

      {/* D. Existing saved segments */}
      {!hasUnsavedSegments && existingSegments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {t("studio.segmentsTab")} ({existingSegments.length})
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              {t("studio.saved") || "Saved"}
            </Badge>
          </div>
          {existingSegments.map(seg => renderSegmentCard(seg, true))}

          {/* Cost estimate for pending segments */}
          {estimatedCost > 0 && hasExistingPending && (
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-1.5 text-sm">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="font-semibold">{t("studio.estimatedCost")}: {estimatedCost}</span>
                <span className="text-xs text-muted-foreground">coins</span>
              </div>
            </div>
          )}

          {/* Go to Theater prompt */}
          <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
              <p className="text-sm font-semibold mb-1">{t("studio.segmentsReadyTitle")}</p>
              <p className="text-xs text-muted-foreground mb-3">{t("studio.segmentsReadyDesc")}</p>
              <Link href={`/generate/${script.id}/${selectedEpisode}`}>
                <Button size="sm" className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                  <Play className="w-4 h-4 mr-1" />
                  {t("studio.goToTheater")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* E. Empty state */}
      {!hasUnsavedSegments && existingSegments.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Zap className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-semibold mb-1">{t("studio.emptySegmentTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {currentScenes.length > 0
                ? t("studio.emptySegmentReady")
                : t("studio.emptySegmentNeedScenes")
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* F. Cover generation section */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold flex-1">{t("studio.coverSection")}</h3>
            {coverStatus === "done" && (
              <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                <CheckCircle className="w-3 h-3" />
                {t("common.done")}
              </span>
            )}
          </div>

          {/* Generating: progress bar + status */}
          {coverStatus === "generating" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500 shrink-0" />
                <p className="text-xs text-muted-foreground">{t("studio.generatingCover")}</p>
              </div>
              {/* Animated indeterminate bar */}
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-400 to-pink-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
                  style={{ width: "60%", animation: "pulse 1.5s ease-in-out infinite" }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t("studio.coverGeneratingHint")}
              </p>
            </div>
          )}

          {/* Cover preview — 9:16 vertical */}
          {coverTall && coverStatus !== "generating" && (
            <div className="flex justify-center">
              <div className="w-32">
                <p className="text-[10px] text-muted-foreground mb-1 text-center">9:16</p>
                <img
                  src={coverTall}
                  alt="Tall cover"
                  className="w-full rounded-md border object-cover aspect-[9/16]"
                />
              </div>
            </div>
          )}

          {/* Generate button */}
          <Button
            variant={coverTall ? "outline" : "default"}
            size="sm"
            onClick={handleGenerateCover}
            disabled={coverStatus === "generating"}
            className="w-full"
          >
            {coverStatus === "generating" ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                {t("studio.generatingCover")}
              </>
            ) : (
              <>
                <ImageIcon className="w-3 h-3 mr-1" />
                {coverTall ? t("studio.regenerateCover") : t("studio.generateCover")}
              </>
            )}
          </Button>

          {coverStatus === "failed" && (
            <p className="text-xs text-destructive text-center">
              {t("studio.coverFailed")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
