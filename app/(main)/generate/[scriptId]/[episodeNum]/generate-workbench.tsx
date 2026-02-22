"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft, Loader2, Zap,
  CheckCircle, XIcon, Coins, PenTool,
  Play, RefreshCw, ChevronDown, ChevronUp,
  Upload, Trash2, Link2, Download,
} from "@/components/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { t } from "@/lib/i18n"
import { MODEL_PRICING } from "@/lib/model-pricing"

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
  sceneNum: number
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
  chainMode: boolean
  seedImageUrl: string | null
}

export function GenerateWorkbench({
  script,
  episodeNum,
  balance: initialBalance,
}: {
  script: Script
  episodeNum: number
  balance: number
}) {
  const router = useRouter()
  const [existingSegments, setExistingSegments] = useState<VideoSegment[]>(script.videoSegments)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [balance, setBalance] = useState(initialBalance)
  const [showConfirm, setShowConfirm] = useState(false)
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set())
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [resettingSegment, setResettingSegment] = useState<string | null>(null)
  const [isResettingAll, setIsResettingAll] = useState(false)
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false)
  const autoStartedRef = useRef(false)
  const [showChainConfirm, setShowChainConfirm] = useState(false)

  // Derived state
  const hasExistingSegments = existingSegments.length > 0
  const pendingSegments = existingSegments.filter(s => s.status === "pending")
  const hasPending = pendingSegments.length > 0
  const allDone = hasExistingSegments && existingSegments.every(s => s.status === "done")
  const hasGenerating = existingSegments.some(
    s => s.status === "generating" || s.status === "submitted" || s.status === "reserved"
  )
  const doneCount = existingSegments.filter(s => s.status === "done").length
  const failedCount = existingSegments.filter(s => s.status === "failed").length
  const generatingCount = existingSegments.filter(
    s => s.status === "generating" || s.status === "submitted" || s.status === "reserved"
  ).length
  const total = existingSegments.length
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const isWorking = generatingCount > 0
  const isChainMode = existingSegments.some(s => s.chainMode)
  const chainCurrentIdx = isChainMode
    ? existingSegments.findIndex(s => s.chainMode && (s.status === "submitted" || s.status === "generating"))
    : -1

  // Calculate cost for pending segments
  const calculateTotalCost = useCallback(() => {
    if (pendingSegments.length === 0) return 0
    const firstSeg = pendingSegments[0]
    const model = firstSeg.model || "seedance_2_0"
    const resolution = firstSeg.resolution || "720p"
    const costPerSec = MODEL_PRICING[model]?.[resolution] || 0
    const totalDuration = pendingSegments.reduce((sum, s) => sum + (s.durationSec || 15), 0)
    return Math.ceil(costPerSec * totalDuration * 2 / 100)
  }, [pendingSegments])

  const totalCost = calculateTotalCost()

  // Auto-trigger on first entry: if only pending segments exist, auto-show confirm dialog
  useEffect(() => {
    if (autoStartedRef.current) return
    if (hasPending && !hasGenerating && !allDone) {
      autoStartedRef.current = true
      setShowConfirm(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for status updates when generating
  useEffect(() => {
    if (!hasGenerating) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status?scriptId=${script.id}&episodeNum=${episodeNum}`)
        if (res.ok) {
          const data = await res.json()
          setExistingSegments(data.segments || [])
          const allComplete = (data.segments || []).every(
            (s: VideoSegment) => s.status === "done" || s.status === "failed"
          )
          if (allComplete) clearInterval(interval)
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [hasGenerating, script.id, episodeNum])

  // Open confirmation dialog before submitting
  function handleRequestSubmit() {
    if (pendingSegments.length === 0) return
    if (totalCost > balance) return
    setShowConfirm(true)
  }

  // Submit all pending segments for video generation
  async function handleConfirmSubmit() {
    setShowConfirm(false)
    if (pendingSegments.length === 0) return

    setIsSubmitting(true)
    try {
      const firstSeg = pendingSegments[0]
      const model = firstSeg.model || "seedance_2_0"
      const resolution = firstSeg.resolution || "720p"

      const segsToSubmit = pendingSegments.map(seg => ({
        segmentIndex: seg.segmentIndex,
        durationSec: seg.durationSec,
        prompt: seg.prompt,
        shotType: seg.shotType || "medium",
        cameraMove: seg.cameraMove || "static",
      }))

      const res = await fetch("/api/video/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum,
          model,
          resolution,
          segments: segsToSubmit,
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
      setBalance(prev => prev - totalCost)
    } catch {
      alert("Submit failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Chain mode submit
  async function handleConfirmChainSubmit() {
    setShowChainConfirm(false)
    if (pendingSegments.length === 0) return

    setIsSubmitting(true)
    try {
      const firstSeg = pendingSegments[0]
      const model = firstSeg.model || "seedance_2_0"
      const resolution = firstSeg.resolution || "720p"

      const res = await fetch("/api/video/chain-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          episodeNum,
          model,
          resolution,
          segments: pendingSegments.map(seg => ({
            segmentIndex: seg.segmentIndex,
            sceneNum: seg.sceneNum ?? 0,
            durationSec: seg.durationSec,
            prompt: seg.prompt,
            shotType: seg.shotType || "medium",
            cameraMove: seg.cameraMove || "static",
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Chain submit failed")
        return
      }

      const data = await res.json()
      setExistingSegments(data.segments || [])
      setBalance(prev => prev - totalCost)
    } catch {
      alert("Chain submit failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Submit single segment (retry/re-generate)
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

  // Toggle segment prompt expansion
  function toggleExpand(segId: string) {
    setExpandedSegments(prev => {
      const next = new Set(prev)
      if (next.has(segId)) next.delete(segId)
      else next.add(segId)
      return next
    })
  }

  // Reset single segment (delete it so it can be re-prepared in Studio)
  async function handleResetSegment(segmentId: string) {
    setResettingSegment(segmentId)
    try {
      const res = await fetch("/api/video/reset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId }),
      })
      if (res.ok) {
        setExistingSegments(prev => prev.filter(s => s.id !== segmentId))
      } else {
        const data = await res.json()
        alert(data.error || "Reset failed")
      }
    } catch {
      alert("Reset failed")
    } finally {
      setResettingSegment(null)
    }
  }

  // Reset all segments for this episode
  async function handleResetAll() {
    setShowResetAllConfirm(false)
    setIsResettingAll(true)
    try {
      const res = await fetch("/api/video/reset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, episodeNum }),
      })
      if (res.ok) {
        setExistingSegments([])
      } else {
        const data = await res.json()
        alert(data.error || "Reset failed")
      }
    } catch {
      alert("Reset failed")
    } finally {
      setIsResettingAll(false)
    }
  }

  // Publish script → Series
  async function handlePublish() {
    setIsPublishing(true)
    try {
      const res = await fetch(`/api/scripts/${script.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/series/${data.seriesId}`)
      } else {
        const data = await res.json()
        if (res.status === 409 && data.publishedId) {
          alert(t("generate.alreadyPublished"))
        } else {
          alert(data.error || "Publish failed")
        }
      }
    } catch {
      alert("Publish failed")
    } finally {
      setIsPublishing(false)
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

  // Status hint text for floating card
  let statusHint = ""
  if (allDone) {
    statusHint = t("generate.allDone")
  } else if (failedCount > 0 && generatingCount === 0) {
    statusHint = t("generate.progressFailed", { count: failedCount })
  } else if (generatingCount > 0 && doneCount === 0) {
    statusHint = t("generate.progressSubmitting")
  } else if (doneCount > 0 && doneCount < total) {
    statusHint = t("generate.progressWorking", { done: doneCount, total })
  } else if (doneCount === 0) {
    statusHint = t("generate.progressWaiting")
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
            {t("studio.episode", { num: episodeNum })} — {t("theater.title")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm">
            <Coins className="w-4 h-4 text-amber-500" />
            <span className="font-medium">{balance}</span>
          </div>
          {hasExistingSegments && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowResetAllConfirm(true)}
              disabled={isResettingAll}
            >
              {isResettingAll
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />
              }
              <span className="ml-1 text-xs">{t("generate.resetAll")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* No segments — redirect to Studio */}
      {!hasExistingSegments && (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <PenTool className="w-8 h-8 text-muted-foreground mx-auto" />
            <h2 className="font-semibold">{t("generate.noSegments")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("generate.noSegmentsHint")}
            </p>
            <Link href={`/studio/script/${script.id}`}>
              <Button variant="outline">
                <PenTool className="w-4 h-4 mr-1" />
                {t("generate.goToStudio") || "Go to Studio"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Pending segments — cost confirmation + generate button */}
      {hasPending && !hasGenerating && (
        <Card className="border-2 border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div className="text-center">
              <Zap className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <h2 className="font-semibold">{t("generate.startGenerate")}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingSegments.length} {t("studio.segments").toLowerCase()} · {pendingSegments[0]?.model || "seedance_2_0"} · {pendingSegments[0]?.resolution || "720p"}
              </p>
            </div>

            <div className="space-y-1">
              {pendingSegments.map(seg => (
                <div key={seg.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                  <span className="font-mono font-bold text-primary w-6">#{seg.segmentIndex + 1}</span>
                  <span className="flex-1 truncate">{seg.prompt.substring(0, 50)}...</span>
                  <span className="text-muted-foreground">{seg.durationSec}s</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <span className="text-sm font-medium">{t("generate.costSummary")}</span>
              <span className="flex items-center gap-1 font-bold text-amber-600">
                <Coins className="w-4 h-4" />
                {totalCost} coins
              </span>
            </div>

            {totalCost > balance && (
              <p className="text-xs text-red-500 text-center">{t("episode.insufficientCoins")}</p>
            )}

            <Button
              onClick={handleRequestSubmit}
              disabled={isSubmitting || totalCost > balance}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              {isSubmitting ? t("common.processing") : t("generate.startGenerate")}
            </Button>

            {/* Chain Mode button */}
            <Button
              variant="outline"
              onClick={() => setShowChainConfirm(true)}
              disabled={isSubmitting || totalCost > balance}
              className="w-full border-purple-400 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20"
            >
              <Link2 className="w-4 h-4 mr-2" />
              {t("generate.chainMode")}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground -mt-1">
              {t("generate.chainModeHint")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Existing segments list */}
      {hasExistingSegments && !hasPending && (
        <div className="space-y-3">

          {/* ── Progress bar (visible while generating) ── */}
          {isWorking && (
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="p-3 space-y-2">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {t("generate.progressTitle")}
                    </span>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-blue-700 dark:text-blue-300">
                    {doneCount} / {total}
                  </span>
                </div>

                {/* Progress bar track */}
                <div className="w-full bg-blue-100 dark:bg-blue-900/40 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(percent, total > 0 ? 3 : 0)}%` }}
                  />
                </div>

                {/* Current segment indicator (sequential mode) */}
                {(() => {
                  const activeIdx = existingSegments.findIndex(
                    s => s.status === "submitted" || s.status === "generating"
                  )
                  const reservedCount = existingSegments.filter(s => s.status === "reserved").length
                  if (activeIdx >= 0) {
                    return (
                      <p className="text-[11px] text-blue-600 dark:text-blue-400">
                        {t("generate.progressWorking", { done: doneCount, total })}
                        {reservedCount > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            · {t("generate.progressQueued", { count: reservedCount })}
                          </span>
                        )}
                      </p>
                    )
                  }
                  return null
                })()}

                {/* Failed count warning */}
                {failedCount > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {t("generate.progressFailed", { count: failedCount })}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Re-generate all button (when failures exist and not working) */}
          {failedCount > 0 && !isWorking && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => {
                // Re-submit all failed as single requests
                existingSegments
                  .filter(s => s.status === "failed")
                  .forEach(s => handleSubmitSingle(s.id))
              }}
            >
              <RefreshCw className="w-3 h-3 mr-1.5" />
              {t("generate.retryAll")} ({failedCount})
            </Button>
          )}

          {/* Segment cards */}
          {existingSegments.map((seg) => {
            const isExpanded = expandedSegments.has(seg.id)
            const isDone = seg.status === "done"
            const isFailed = seg.status === "failed"
            const isSegGenerating = seg.status === "generating" || seg.status === "submitted" || seg.status === "reserved"

            return (
              <Card
                key={seg.id}
                className={`transition-all duration-200 ${
                  isDone
                    ? "border-green-200 dark:border-green-800"
                    : isFailed
                      ? "border-red-200 dark:border-red-800"
                      : isSegGenerating
                        ? "border-amber-200 dark:border-amber-800"
                        : ""
                }`}
              >
                <CardContent className="p-3 space-y-2">
                  {/* Top row: index + prompt + status + expand toggle */}
                  <div
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => toggleExpand(seg.id)}
                  >
                    <span className="text-xs font-mono font-bold text-primary w-6 shrink-0 mt-0.5">
                      #{seg.segmentIndex + 1}
                    </span>

                    {/* Prompt (1 line collapsed, full when expanded) */}
                    <p className={`flex-1 text-xs text-muted-foreground min-w-0 ${isExpanded ? "whitespace-pre-wrap break-words" : "line-clamp-1"}`}>
                      {seg.prompt}
                    </p>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className={`text-[10px] px-1.5 py-0.5 ${statusColors[seg.status] || ""}`}>
                        {isDone && <CheckCircle className="w-3 h-3 mr-0.5" />}
                        {isSegGenerating && <Loader2 className="w-3 h-3 mr-0.5 animate-spin" />}
                        {isFailed && <XIcon className="w-3 h-3 mr-0.5" />}
                        {seg.status}
                      </Badge>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      }
                    </div>
                  </div>

                  {/* Thumbnail + duration (done state) */}
                  {isDone && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-11 rounded overflow-hidden bg-black shrink-0">
                        {seg.thumbnailUrl ? (
                          <img
                            src={seg.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-4 h-4 text-white/60" />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {seg.durationSec}s
                        {seg.tokenCost ? ` · ${seg.tokenCost} coins` : ""}
                      </p>
                    </div>
                  )}

                  {/* Error message (failed state) */}
                  {isFailed && seg.errorMessage && (
                    <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
                      {seg.errorMessage}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    {/* Re-generate — always visible */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => handleSubmitSingle(seg.id)}
                      disabled={isSegGenerating}
                    >
                      {isSegGenerating
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RefreshCw className="w-3 h-3" />
                      }
                      <span className="ml-1">{t("generate.regenerate")}</span>
                    </Button>

                    {/* Preview + Download — done state only */}
                    {isDone && seg.videoUrl && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="text-xs h-7 px-2 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setPreviewVideo({
                            url: seg.videoUrl!,
                            title: `${t("studio.segment")} #${seg.segmentIndex + 1}`,
                          })}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          {t("generate.preview")}
                        </Button>
                        <a
                          href={`/api/video/download?segmentId=${seg.id}`}
                          download
                          className="inline-flex items-center justify-center h-7 px-2 rounded-md text-xs font-medium
                                     border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          {t("generate.download")}
                        </a>
                      </>
                    )}

                    {/* Reset — always visible, pushes to right */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleResetSegment(seg.id)}
                      disabled={resettingSegment === seg.id}
                    >
                      {resettingSegment === seg.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Publish button — show when at least some segments are done and nothing is running */}
          {doneCount > 0 && !isWorking && (
            <Card className={allDone
              ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
              : "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
            }>
              <CardContent className="p-4 text-center space-y-3">
                <CheckCircle className={`w-8 h-8 mx-auto ${allDone ? "text-green-500" : "text-amber-500"}`} />
                <h3 className={`font-bold ${allDone ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
                  {allDone ? t("generate.allDone") : t("generate.partialDone", { done: doneCount, total })}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("generate.segmentsReady", { count: doneCount })}
                </p>
                <div className="flex gap-2 justify-center pt-1">
                  <Link href={`/generate/${script.id}`}>
                    <Button size="sm" variant="outline">
                      {t("common.back")}
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    onClick={handlePublish}
                    disabled={isPublishing}
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                  >
                    {isPublishing
                      ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      : <Upload className="w-3 h-3 mr-1" />
                    }
                    {isPublishing ? t("common.processing") : t("generate.mergePublish")}
                  </Button>
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

      {/* ── Floating failure badge (bottom-right) — only shown when there are failures and nothing is running ── */}
      {hasExistingSegments && !hasPending && !allDone && failedCount > 0 && !isWorking && (
        <div className="fixed bottom-24 right-4 z-40 w-44">
          <Card className="shadow-xl border-2 border-red-300 dark:border-red-700">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-medium">
                  {t("generate.progressTitle")}
                </span>
                <span className="text-xs font-bold">
                  {doneCount}/{total}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full transition-all duration-700 bg-red-500"
                  style={{ width: `${Math.max(percent, 3)}%` }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <XIcon className="w-3 h-3 text-red-500 shrink-0" />
                <span className="text-[10px] text-muted-foreground line-clamp-2">{statusHint}</span>
              </div>
              {/* Chain mode progress */}
              {isChainMode && chainCurrentIdx >= 0 && (
                <div className="flex items-center gap-1 text-[10px] text-purple-600 font-medium">
                  <Link2 className="w-3 h-3 shrink-0" />
                  <span>{t("generate.chainProcessing", { current: chainCurrentIdx + 1, total })}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Bottom sheet video preview ── */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setPreviewVideo(null)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full bg-background rounded-t-2xl overflow-hidden max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            {/* Title + close */}
            <div className="flex items-center justify-between px-4 pb-3">
              <h3 className="font-semibold text-sm">{previewVideo.title}</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPreviewVideo(null)}
              >
                <XIcon className="w-4 h-4" />
              </Button>
            </div>
            {/* Video player */}
            <div className="px-4 pb-8">
              <video
                src={previewVideo.url}
                controls
                autoPlay
                className="w-full rounded-xl bg-black"
                style={{ maxHeight: "60vh" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Reset All confirmation dialog ── */}
      <Dialog open={showResetAllConfirm} onOpenChange={setShowResetAllConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              {t("generate.resetAllTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("generate.resetAllDesc", { count: existingSegments.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowResetAllConfirm(false)} className="flex-1">
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetAll}
              className="flex-1"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {t("generate.resetAllConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Chain Mode confirmation dialog ── */}
      <Dialog open={showChainConfirm} onOpenChange={setShowChainConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-purple-500" />
              {t("generate.chainMode")}
            </DialogTitle>
            <DialogDescription>
              {t("generate.chainModeHint")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("generate.confirmCost")}</span>
              <span className="font-bold text-amber-600 flex items-center gap-1">
                <Coins className="w-4 h-4" /> -{totalCost}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("generate.confirmBalance")}</span>
              <span className="font-medium">{balance}</span>
            </div>
            <div className="border-t pt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("generate.confirmBalanceAfter")}</span>
              <span className="font-bold text-green-600">{balance - totalCost}</span>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowChainConfirm(false)} className="flex-1">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmChainSubmit}
              className="flex-1 border-purple-400 bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Link2 className="w-4 h-4 mr-1" />
              {t("generate.confirmProceed")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Coin confirmation dialog ── */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              {t("generate.confirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("generate.confirmDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("generate.confirmCost")}</span>
              <span className="font-bold text-amber-600 flex items-center gap-1">
                <Coins className="w-4 h-4" /> -{totalCost}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("generate.confirmBalance")}</span>
              <span className="font-medium">{balance}</span>
            </div>
            <div className="border-t pt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("generate.confirmBalanceAfter")}</span>
              <span className="font-bold text-green-600">{balance - totalCost}</span>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmSubmit}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
            >
              <Zap className="w-4 h-4 mr-1" />
              {t("generate.confirmProceed")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
