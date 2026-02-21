"use client"

import { useState, useEffect, useCallback } from "react"
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
} from "@/components/icons"
import Link from "next/link"
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

export function GenerateWorkbench({
  script,
  episodeNum,
  balance: initialBalance,
}: {
  script: Script
  episodeNum: number
  balance: number
}) {
  const [existingSegments, setExistingSegments] = useState<VideoSegment[]>(script.videoSegments)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [balance, setBalance] = useState(initialBalance)
  const [pollingActive, setPollingActive] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Derived state
  const hasExistingSegments = existingSegments.length > 0
  const pendingSegments = existingSegments.filter(s => s.status === "pending")
  const hasPending = pendingSegments.length > 0
  const allDone = hasExistingSegments && existingSegments.every(s => s.status === "done")
  const hasGenerating = existingSegments.some(
    s => s.status === "generating" || s.status === "submitted" || s.status === "reserved"
  )

  // Calculate cost for pending segments (model/resolution from segment records)
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

  // Open confirmation dialog before submitting
  function handleRequestSubmit() {
    if (pendingSegments.length === 0) return
    if (totalCost > balance) return
    setShowConfirm(true)
  }

  // Submit all pending segments for video generation (after user confirms)
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

  // Submit single segment (retry)
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
            {t("studio.episode", { num: episodeNum })} — {t("theater.title")}
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Coins className="w-4 h-4 text-amber-500" />
          <span className="font-medium">{balance}</span>
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

            {/* Segment summary */}
            <div className="space-y-1">
              {pendingSegments.map(seg => (
                <div key={seg.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                  <span className="font-mono font-bold text-primary w-6">#{seg.segmentIndex + 1}</span>
                  <span className="flex-1 truncate">{seg.prompt.substring(0, 50)}...</span>
                  <span className="text-muted-foreground">{seg.durationSec}s</span>
                </div>
              ))}
            </div>

            {/* Cost info */}
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
          </CardContent>
        </Card>
      )}

      {/* Existing segments — progress view */}
      {hasExistingSegments && !hasPending && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("theater.videoSegments") || "Video Segments"} ({existingSegments.filter(s => s.status === "done").length}/{existingSegments.length})
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

                {/* Error message + retry */}
                {seg.status === "failed" && (
                  <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20">
                    {seg.errorMessage && (
                      <p className="text-xs text-red-600 mb-1">{seg.errorMessage}</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
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

                <div className="flex gap-2 justify-center pt-1">
                  <Link href={`/generate/${script.id}`}>
                    <Button size="sm" variant="outline">
                      {t("common.back")}
                    </Button>
                  </Link>
                  <Link href={`/studio/script/${script.id}`}>
                    <Button size="sm" variant="outline">
                      <PenTool className="w-3 h-3 mr-1" />
                      {t("common.edit")}
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
