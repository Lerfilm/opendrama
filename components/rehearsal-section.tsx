"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Loader2, Play, Trash2, Zap,
  CheckCircle, XIcon, Coins, RefreshCw,
  ChevronDown, ChevronUp, FlaskConical,
} from "@/components/icons"
import { MODEL_PRICING } from "@/lib/model-pricing"
import { t } from "@/lib/i18n"

interface Rehearsal {
  id: string
  prompt: string
  model: string
  resolution: string
  durationSec: number
  status: string
  videoUrl: string | null
  thumbnailUrl: string | null
  tokenCost: number | null
  errorMessage: string | null
  createdAt: string
}

const MODELS = [
  { value: "seedance_2_0", label: "Seedance 2.0" },
  { value: "seedance_1_0_pro_fast", label: "Seedance 1.0 Fast" },
  { value: "jimeng_3_0", label: "Jimeng 3.0" },
]

const RESOLUTIONS: Record<string, string[]> = {
  seedance_2_0: ["720p", "480p"],
  seedance_1_0_pro_fast: ["1080p", "720p"],
  jimeng_3_0: ["1080p", "720p"],
}

const DURATIONS = [5, 10, 15]

export function RehearsalSection() {
  const [rehearsals, setRehearsals] = useState<Rehearsal[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewVideo, setPreviewVideo] = useState<{ url: string; prompt: string } | null>(null)

  // Draft state for new/editing rehearsals
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftPrompt, setDraftPrompt] = useState("")
  const [draftModel, setDraftModel] = useState("seedance_2_0")
  const [draftResolution, setDraftResolution] = useState("720p")
  const [draftDuration, setDraftDuration] = useState(5)

  // Fetch rehearsals
  const fetchRehearsals = useCallback(async () => {
    try {
      const res = await fetch("/api/rehearsal")
      if (res.ok) {
        const data = await res.json()
        setRehearsals(data.rehearsals || [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRehearsals() }, [fetchRehearsals])

  // Poll for active rehearsals
  const hasActive = rehearsals.some(
    (r) => r.status === "submitted" || r.status === "generating" || r.status === "reserved"
  )

  useEffect(() => {
    if (!hasActive) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/rehearsal/status")
        if (res.ok) {
          const data = await res.json()
          setRehearsals(data.rehearsals || [])
        }
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [hasActive])

  // Create new rehearsal
  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch("/api/rehearsal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "A cinematic shot of...",
          model: "seedance_2_0",
          resolution: "720p",
          durationSec: 5,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setRehearsals((prev) => [data.rehearsal, ...prev])
        // Auto-expand into edit mode
        setEditingId(data.rehearsal.id)
        setDraftPrompt(data.rehearsal.prompt)
        setDraftModel(data.rehearsal.model)
        setDraftResolution(data.rehearsal.resolution)
        setDraftDuration(data.rehearsal.durationSec)
        setExpandedId(data.rehearsal.id)
      }
    } catch { /* ignore */ }
    finally { setCreating(false) }
  }

  // Save draft edits
  async function handleSave(id: string) {
    if (!draftPrompt.trim()) return
    try {
      const res = await fetch("/api/rehearsal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          prompt: draftPrompt,
          model: draftModel,
          resolution: draftResolution,
          durationSec: draftDuration,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setRehearsals((prev) => prev.map((r) => (r.id === id ? data.rehearsal : r)))
        setEditingId(null)
      }
    } catch { /* ignore */ }
  }

  // Submit for generation
  async function handleSubmit(id: string) {
    // Save any pending edits first
    if (editingId === id && draftPrompt.trim()) {
      await handleSave(id)
    }
    setSubmittingId(id)
    try {
      const res = await fetch("/api/rehearsal/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        const data = await res.json()
        setRehearsals((prev) => prev.map((r) => (r.id === id ? data.rehearsal : r)))
      } else {
        const data = await res.json()
        alert(data.error || t("rehearsal.submitFailed"))
      }
    } catch { alert(t("rehearsal.submitFailed")) }
    finally { setSubmittingId(null) }
  }

  // Delete
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch("/api/rehearsal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setRehearsals((prev) => prev.filter((r) => r.id !== id))
        if (editingId === id) setEditingId(null)
      }
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }

  // Enter edit mode
  function startEdit(r: Rehearsal) {
    setEditingId(r.id)
    setDraftPrompt(r.prompt)
    setDraftModel(r.model)
    setDraftResolution(r.resolution)
    setDraftDuration(r.durationSec)
    setExpandedId(r.id)
  }

  // Calculate cost
  function calcCost(model: string, resolution: string, duration: number) {
    const costPerSec = MODEL_PRICING[model]?.[resolution] || 0
    return Math.ceil((costPerSec * duration * 2) / 100)
  }

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    reserved: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    generating: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  }

  const statusLabels: Record<string, string> = {
    draft: t("rehearsal.draft"),
    reserved: t("rehearsal.queued"),
    submitted: t("rehearsal.submitted"),
    generating: t("rehearsal.generating"),
    done: t("rehearsal.done"),
    failed: t("common.failed"),
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-semibold">{t("rehearsal.title")}</h2>
        </div>
        <div className="flex items-center justify-center p-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-semibold">{t("rehearsal.title")}</h2>
          <span className="text-[10px] text-muted-foreground">{t("rehearsal.subtitle")}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          <span className="ml-1">{t("rehearsal.new")}</span>
        </Button>
      </div>

      {/* Rehearsal list */}
      {rehearsals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center space-y-2">
            <FlaskConical className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {t("rehearsal.empty")}
            </p>
            <Button size="sm" variant="outline" onClick={handleCreate} disabled={creating}>
              <Plus className="w-3 h-3 mr-1" /> {t("rehearsal.createFirst")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rehearsals.map((r) => {
            const isExpanded = expandedId === r.id
            const isEditing = editingId === r.id
            const isActive = ["reserved", "submitted", "generating"].includes(r.status)
            const isDone = r.status === "done"
            const isFailed = r.status === "failed"
            const isDraft = r.status === "draft"
            const cost = calcCost(
              isEditing ? draftModel : r.model,
              isEditing ? draftResolution : r.resolution,
              isEditing ? draftDuration : r.durationSec,
            )

            return (
              <Card
                key={r.id}
                className={`transition-all duration-200 ${
                  isDone
                    ? "border-green-200 dark:border-green-800"
                    : isFailed
                      ? "border-red-200 dark:border-red-800"
                      : isActive
                        ? "border-amber-200 dark:border-amber-800"
                        : ""
                }`}
              >
                <CardContent className="p-3 space-y-2">
                  {/* Top row: prompt preview + status */}
                  <div
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedId(null)
                        if (isEditing) setEditingId(null)
                      } else {
                        setExpandedId(r.id)
                      }
                    }}
                  >
                    <p className={`flex-1 text-xs text-muted-foreground min-w-0 ${isExpanded ? "whitespace-pre-wrap break-words" : "line-clamp-1"}`}>
                      {isEditing && isExpanded ? draftPrompt : r.prompt}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className={`text-[10px] px-1.5 py-0.5 ${statusColors[r.status] || ""}`}>
                        {isDone && <CheckCircle className="w-3 h-3 mr-0.5" />}
                        {isActive && <Loader2 className="w-3 h-3 mr-0.5 animate-spin" />}
                        {isFailed && <XIcon className="w-3 h-3 mr-0.5" />}
                        {statusLabels[r.status] || r.status}
                      </Badge>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded: editing or detail view */}
                  {isExpanded && (
                    <div className="space-y-3 pt-1">
                      {/* Prompt textarea */}
                      {isEditing ? (
                        <textarea
                          className="w-full rounded-lg border border-border bg-muted/50 p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                          rows={4}
                          value={draftPrompt}
                          onChange={(e) => setDraftPrompt(e.target.value)}
                          placeholder={t("rehearsal.placeholder")}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : isDraft || isFailed ? (
                        <div
                          className="w-full rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={(e) => { e.stopPropagation(); startEdit(r) }}
                        >
                          {r.prompt}
                          <span className="text-[10px] ml-2 text-primary">{t("rehearsal.clickToEdit")}</span>
                        </div>
                      ) : null}

                      {/* Model / Resolution / Duration — only when editing */}
                      {isEditing && (
                        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Model selector */}
                          <select
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            value={draftModel}
                            onChange={(e) => {
                              const m = e.target.value
                              setDraftModel(m)
                              const resolutions = RESOLUTIONS[m] || ["720p"]
                              if (!resolutions.includes(draftResolution)) {
                                setDraftResolution(resolutions[0])
                              }
                            }}
                          >
                            {MODELS.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>

                          {/* Resolution selector */}
                          <select
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            value={draftResolution}
                            onChange={(e) => setDraftResolution(e.target.value)}
                          >
                            {(RESOLUTIONS[draftModel] || ["720p"]).map((res) => (
                              <option key={res} value={res}>{res}</option>
                            ))}
                          </select>

                          {/* Duration selector */}
                          <select
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            value={draftDuration}
                            onChange={(e) => setDraftDuration(Number(e.target.value))}
                          >
                            {DURATIONS.map((d) => (
                              <option key={d} value={d}>{d}s</option>
                            ))}
                          </select>

                          {/* Cost indicator */}
                          <div className="flex items-center gap-1 text-xs text-amber-600 ml-auto">
                            <Coins className="w-3 h-3" />
                            <span className="font-medium">{cost} {t("common.coins")}</span>
                          </div>
                        </div>
                      )}

                      {/* Info row (non-editing, non-active) */}
                      {!isEditing && !isActive && (
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>{r.model.replace(/_/g, " ")}</span>
                          <span>{r.resolution}</span>
                          <span>{r.durationSec}s</span>
                          {r.tokenCost && <span>{r.tokenCost} {t("common.coins")}</span>}
                        </div>
                      )}

                      {/* Video preview — done state */}
                      {isDone && r.videoUrl && (
                        <div
                          className="relative w-full aspect-video rounded-lg overflow-hidden bg-black cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewVideo({
                              url: r.videoUrl!,
                              prompt: r.prompt.substring(0, 60),
                            })
                          }}
                        >
                          {r.thumbnailUrl ? (
                            <img src={r.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play className="w-10 h-10 text-white/60" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors">
                            <Play className="w-8 h-8 text-white" />
                          </div>
                        </div>
                      )}

                      {/* Error message */}
                      {isFailed && r.errorMessage && (
                        <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
                          {r.errorMessage}
                        </p>
                      )}

                      {/* Generating progress indicator */}
                      {isActive && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            {t("rehearsal.generatingHint")}
                          </span>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {/* Save (editing only) */}
                        {isEditing && (
                          <Button
                            size="sm"
                            className="text-xs h-7 px-3 bg-primary text-primary-foreground"
                            onClick={() => handleSave(r.id)}
                          >
                            {t("common.save")}
                          </Button>
                        )}

                        {/* Edit (non-editing, non-active) */}
                        {!isEditing && (isDraft || isFailed || isDone) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-2"
                            onClick={() => startEdit(r)}
                          >
                            {t("common.edit")}
                          </Button>
                        )}

                        {/* Generate / Retry */}
                        {(isDraft || isFailed) && (
                          <Button
                            size="sm"
                            className="text-xs h-7 px-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                            onClick={() => handleSubmit(r.id)}
                            disabled={submittingId === r.id}
                          >
                            {submittingId === r.id ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : isFailed ? (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            ) : (
                              <Zap className="w-3 h-3 mr-1" />
                            )}
                            {isFailed ? t("common.retry") : t("rehearsal.generate")}{" "}
                            <span className="opacity-70 ml-0.5">({cost})</span>
                          </Button>
                        )}

                        {/* Re-generate (done state) */}
                        {isDone && (
                          <Button
                            size="sm"
                            className="text-xs h-7 px-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                            onClick={() => handleSubmit(r.id)}
                            disabled={submittingId === r.id}
                          >
                            {submittingId === r.id ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            {t("rehearsal.regenerate")} ({cost})
                          </Button>
                        )}

                        {/* Delete */}
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                          >
                            {deletingId === r.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Video preview modal */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setPreviewVideo(null)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full bg-background rounded-t-2xl overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between px-4 pb-3">
              <h3 className="font-semibold text-sm truncate flex-1">{previewVideo.prompt}</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => setPreviewVideo(null)}
              >
                <XIcon className="w-4 h-4" />
              </Button>
            </div>
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
    </div>
  )
}
