"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, Sparkles, Loader2, Play, Zap,
  CheckCircle, XIcon, Coins, ChevronDown, ChevronUp, ImageIcon,
} from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"
import { MODEL_PRICING } from "@/lib/tokens"

interface Script {
  id: string
  title: string
  genre: string
  language: string
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
  segmentIndex: number
  durationSec: number
  prompt: string
  shotType: string | null
  cameraMove: string | null
  model: string | null
  resolution: string | null
  status: string
  videoUrl: string | null
  thumbnailUrl: string | null
  tokenCost: number | null
  errorMessage: string | null
}

interface GeneratedSegment {
  segmentIndex: number
  durationSec: number
  prompt: string
  shotType: string
  cameraMove: string
}

const MODELS = [
  { id: "seedance_2_0", name: "Seedance 2.0", resolutions: ["1080p", "720p"] },
  { id: "seedance_1_5_pro", name: "Seedance 1.5 Pro", resolutions: ["1080p", "720p"] },
  { id: "jimeng_3_0_pro", name: "Jimeng 3.0 Pro", resolutions: ["1080p"] },
  { id: "jimeng_3_0", name: "Jimeng 3.0", resolutions: ["1080p", "720p"] },
  { id: "jimeng_s2_pro", name: "Jimeng S2 Pro", resolutions: ["720p"] },
]

export function GenerateWorkbench({
  script,
  episodeNum,
  balance: initialBalance,
}: {
  script: Script
  episodeNum: number
  balance: number
}) {
  const [selectedModel, setSelectedModel] = useState("seedance_2_0")
  const [selectedResolution, setSelectedResolution] = useState("720p")
  const [isSplitting, setIsSplitting] = useState(false)
  const [segments, setSegments] = useState<GeneratedSegment[]>([])
  const [existingSegments, setExistingSegments] = useState<VideoSegment[]>(script.videoSegments)
  const [expandedSegment, setExpandedSegment] = useState<number | null>(null)
  const [editingPrompts, setEditingPrompts] = useState<Record<number, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [balance, setBalance] = useState(initialBalance)
  const [pollingActive, setPollingActive] = useState(false)
  const [coverStatus, setCoverStatus] = useState<"idle" | "generating" | "done" | "failed">("idle")
  const [coverWide, setCoverWide] = useState<string | null>(null)
  const [coverTall, setCoverTall] = useState<string | null>(null)

  // Check if we already have segments from DB
  const hasExistingSegments = existingSegments.length > 0
  const allDone = hasExistingSegments && existingSegments.every(s => s.status === "done")
  const hasGenerating = existingSegments.some(s => s.status === "generating" || s.status === "submitted" || s.status === "reserved")

  // Available resolutions for selected model
  const modelInfo = MODELS.find(m => m.id === selectedModel)
  const availableResolutions = modelInfo?.resolutions || ["720p"]

  // Calculate cost
  const calculateTotalCost = useCallback(() => {
    const segs = segments.length > 0 ? segments : existingSegments.filter(s => s.status === "pending")
    const costPerSec = MODEL_PRICING[selectedModel]?.[selectedResolution] || 0
    const totalDuration = segs.reduce((sum, s) => sum + (s.durationSec || 15), 0)
    const apiCostCents = costPerSec * totalDuration
    const userCostCents = apiCostCents * 2
    return Math.ceil(userCostCents / 100)
  }, [segments, existingSegments, selectedModel, selectedResolution])

  const totalCost = calculateTotalCost()

  // Poll for status updates
  useEffect(() => {
    if (!hasGenerating) {
      setPollingActive(false)
      return
    }

    setPollingActive(true)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status?scriptId=${script.id}&episodeNum=${episodeNum}`)
        if (res.ok) {
          const data = await res.json()
          setExistingSegments(data.segments || [])

          // Check if all done
          const allComplete = (data.segments || []).every(
            (s: VideoSegment) => s.status === "done" || s.status === "failed"
          )
          if (allComplete) {
            setPollingActive(false)
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [hasGenerating, script.id, episodeNum])

  // Auto-generate cover when all segments are done (episode 1 only for script cover)
  useEffect(() => {
    if (allDone && coverStatus === "idle" && !coverWide) {
      handleGenerateCover()
    }
  }, [allDone]) // eslint-disable-line react-hooks/exhaustive-deps

  // Generate cover poster
  async function handleGenerateCover() {
    setCoverStatus("generating")
    try {
      const res = await fetch("/api/cover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, episodeNum }),
      })

      if (!res.ok) throw new Error("Cover generation failed")

      const data = await res.json()
      // For now the cover generation is async (TODO stubs), so set status
      // In production this would poll for completion
      setCoverStatus("done")
      if (data.coverWide) setCoverWide(data.coverWide)
      if (data.coverTall) setCoverTall(data.coverTall)
    } catch {
      setCoverStatus("failed")
    }
  }

  // AI Split — generate segments from scenes
  async function handleSplit() {
    setIsSplitting(true)
    try {
      const res = await fetch("/api/ai/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum,
          model: selectedModel,
          resolution: selectedResolution,
        }),
      })

      if (!res.ok) throw new Error("Split failed")

      const data = await res.json()
      setSegments(data.segments || [])
    } catch {
      alert("Split failed")
    } finally {
      setIsSplitting(false)
    }
  }

  // Submit all segments for video generation
  async function handleSubmitAll() {
    if (totalCost > balance) {
      alert(t("episode.insufficientCoins"))
      return
    }

    setIsSubmitting(true)
    try {
      // Create video segments in DB
      const segsToCreate = segments.map((seg, i) => ({
        ...seg,
        prompt: editingPrompts[i] || seg.prompt,
      }))

      // Batch submit
      const res = await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum,
          model: selectedModel,
          resolution: selectedResolution,
          segments: segsToCreate,
          mode: "batch",
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Submit failed")
        return
      }

      const data = await res.json()
      setExistingSegments(data.segments || [])
      setSegments([])
      setBalance(prev => prev - totalCost)
    } catch {
      alert("Submit failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Submit single segment
  async function handleSubmitSingle(segmentId: string) {
    try {
      const res = await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId }),
      })

      if (res.ok) {
        const data = await res.json()
        setExistingSegments(prev =>
          prev.map(s => s.id === segmentId ? { ...s, ...data.segment } : s)
        )
      }
    } catch {
      // silent fail
    }
  }

  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    reserved: "bg-yellow-100 text-yellow-700",
    submitted: "bg-blue-100 text-blue-700",
    generating: "bg-amber-100 text-amber-700",
    done: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/generate/${script.id}`}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{script.title}</h1>
          <p className="text-xs text-muted-foreground">
            {t("studio.episode", { num: episodeNum })} — {t("studio.goToTheater")}
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Coins className="w-4 h-4 text-amber-500" />
          <span className="font-medium">{balance}</span>
        </div>
      </div>

      {/* Model + Resolution selection */}
      {!hasExistingSegments && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                {t("t2v.style")} / Model
              </label>
              <div className="flex flex-wrap gap-2">
                {MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id)
                      if (!m.resolutions.includes(selectedResolution)) {
                        setSelectedResolution(m.resolutions[0])
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedModel === m.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                {t("t2v.resolution")}
              </label>
              <div className="flex gap-2">
                {availableResolutions.map(res => (
                  <button
                    key={res}
                    onClick={() => setSelectedResolution(res)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedResolution === res
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Split scenes into segments */}
      {!hasExistingSegments && segments.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Zap className="w-8 h-8 text-amber-500 mx-auto" />
            <h2 className="font-semibold">{t("studio.goToTheater")}</h2>
            <p className="text-xs text-muted-foreground">
              {script.scenes.length} {t("studio.scenes").toLowerCase()} → AI splits into video segments
            </p>
            <Button
              onClick={handleSplit}
              disabled={isSplitting}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white"
            >
              {isSplitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isSplitting ? t("studio.suggesting") : "AI Split into Segments"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review generated segments */}
      {segments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Generated Segments ({segments.length})
            </h2>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-500" />
              {t("t2v.cost", { coins: totalCost })}
            </div>
          </div>

          {segments.map((seg, i) => {
            const isExpanded = expandedSegment === i

            return (
              <Card key={i}>
                <CardContent className="p-0">
                  <button
                    onClick={() => setExpandedSegment(isExpanded ? null : i)}
                    className="w-full flex items-center gap-2 p-3 text-left"
                  >
                    <span className="text-xs font-mono font-bold text-primary w-6">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{editingPrompts[i] || seg.prompt}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1">
                      {seg.durationSec}s
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1">
                      {seg.shotType}
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t">
                      <div className="pt-2">
                        <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                          Prompt
                        </label>
                        <textarea
                          value={editingPrompts[i] ?? seg.prompt}
                          onChange={e => setEditingPrompts(prev => ({ ...prev, [i]: e.target.value }))}
                          rows={4}
                          className="w-full text-xs px-2 py-1.5 rounded-md border bg-background resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {seg.shotType} / {seg.cameraMove}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {seg.durationSec}s
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Submit all button */}
          <Card className="border-2 border-primary/20">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Total cost</span>
                <span className="flex items-center gap-1 font-bold text-amber-600">
                  <Coins className="w-4 h-4" />
                  {totalCost} coins
                </span>
              </div>
              {totalCost > balance && (
                <p className="text-xs text-red-500">{t("episode.insufficientCoins")}</p>
              )}
              <Button
                onClick={handleSubmitAll}
                disabled={isSubmitting || totalCost > balance}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {isSubmitting ? t("common.processing") : `Generate All (${segments.length} segments)`}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Existing segments — progress view */}
      {hasExistingSegments && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Video Segments ({existingSegments.filter(s => s.status === "done").length}/{existingSegments.length})
            </h2>
            {pollingActive && (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("t2v.generating")}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-gradient-to-r from-green-400 to-green-500 h-2 rounded-full transition-all duration-500"
              style={{
                width: `${existingSegments.length > 0
                  ? (existingSegments.filter(s => s.status === "done").length / existingSegments.length) * 100
                  : 0}%`,
              }}
            />
          </div>

          {existingSegments.map((seg) => (
            <Card key={seg.id} className={seg.status === "done" ? "border-green-200 dark:border-green-800" : ""}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-primary w-6">
                    #{seg.segmentIndex + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{seg.prompt.substring(0, 60)}...</p>
                  </div>
                  <Badge className={`text-[10px] ${statusColors[seg.status] || ""}`}>
                    {seg.status === "done" && <CheckCircle className="w-3 h-3 mr-0.5" />}
                    {(seg.status === "generating" || seg.status === "submitted") && (
                      <Loader2 className="w-3 h-3 mr-0.5 animate-spin" />
                    )}
                    {seg.status === "failed" && <XIcon className="w-3 h-3 mr-0.5" />}
                    {seg.status}
                  </Badge>
                </div>

                {/* Video preview */}
                {seg.status === "done" && seg.videoUrl && (
                  <div className="mt-2 rounded-lg overflow-hidden bg-black">
                    <video
                      src={seg.videoUrl}
                      controls
                      className="w-full"
                      poster={seg.thumbnailUrl || undefined}
                    />
                  </div>
                )}

                {/* Error message */}
                {seg.status === "failed" && seg.errorMessage && (
                  <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20">
                    <p className="text-xs text-red-600">{seg.errorMessage}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 text-xs"
                      onClick={() => handleSubmitSingle(seg.id)}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                )}

                {/* Cost info */}
                {seg.tokenCost && (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                    <Coins className="w-3 h-3" />
                    {seg.tokenCost} coins
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {/* All done celebration */}
          {allDone && (
            <Card className="border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="p-4 text-center space-y-3">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto" />
                <h3 className="font-bold text-green-700 dark:text-green-300">
                  {t("generate.allDone")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("generate.segmentsReady", { count: existingSegments.length })}
                </p>

                {/* Cover generation */}
                <div className="border-t pt-3 space-y-2">
                  {coverStatus === "generating" && (
                    <div className="flex items-center justify-center gap-2 text-xs text-amber-600">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t("cover.autoGenerate")}
                    </div>
                  )}
                  {coverStatus === "done" && (coverWide || coverTall) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-1 text-xs text-green-600">
                        <ImageIcon className="w-3 h-3" />
                        {t("cover.generated")}
                      </div>
                      <div className="flex gap-2 justify-center">
                        {coverWide && (
                          <img src={coverWide} alt="Wide cover" className="h-20 rounded-md border object-cover" />
                        )}
                        {coverTall && (
                          <img src={coverTall} alt="Tall cover" className="h-20 rounded-md border object-cover" />
                        )}
                      </div>
                    </div>
                  )}
                  {(coverStatus === "failed" || coverStatus === "done") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateCover}
                      className="text-xs"
                    >
                      <ImageIcon className="w-3 h-3 mr-1" />
                      {t("cover.regenerate")}
                      <Badge variant="secondary" className="ml-1 text-[10px]">{t("cover.free")}</Badge>
                    </Button>
                  )}
                </div>

                <div className="flex gap-2 justify-center pt-1">
                  <Link href={`/generate/${script.id}`}>
                    <Button size="sm" variant="outline">
                      {t("common.back")}
                    </Button>
                  </Link>
                  <Link href={`/studio/script/${script.id}`}>
                    <Button size="sm" variant="outline">
                      {t("common.edit")} Script
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Characters panel */}
      {script.roles.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              {t("studio.roles")} ({script.roles.length})
            </h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar">
              {script.roles.map(role => (
                <div key={role.id} className="flex-shrink-0 text-center">
                  {role.referenceImages && role.referenceImages.length > 0 ? (
                    <img
                      src={role.referenceImages[0]}
                      alt={role.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-primary/20 mx-auto"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold mx-auto">
                      {role.name.charAt(0)}
                    </div>
                  )}
                  <p className="text-[10px] mt-0.5 truncate max-w-[60px]">{role.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
