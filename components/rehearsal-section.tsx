"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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

interface AssetRole {
  id: string
  name: string
  role: string
  referenceImages: string[]
}

interface AssetLocation {
  name: string
  photoUrl: string | null
  photos: { url: string; note?: string }[]
}

interface RehearsalSectionProps {
  assets?: {
    roles: AssetRole[]
    locations: AssetLocation[]
  }
}

export function RehearsalSection({ assets }: RehearsalSectionProps = {}) {
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

  // Drag & drop state (only used when assets are provided)
  const [isDragOver, setIsDragOver] = useState(false)
  const [assetTab, setAssetTab] = useState<"characters" | "locations">("characters")
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const dropPosRef = useRef<number>(0)

  // Insert text at cursor position in draft prompt
  function insertAtCursor(text: string) {
    const textarea = promptRef.current
    if (!textarea) {
      setDraftPrompt(prev => prev + text + " ")
      return
    }
    const pos = textarea.selectionStart
    const before = draftPrompt.substring(0, pos)
    const after = draftPrompt.substring(pos)
    const newValue = before + text + " " + after
    setDraftPrompt(newValue)
    const newPos = pos + text.length + 1
    requestAnimationFrame(() => {
      if (promptRef.current) {
        promptRef.current.selectionStart = newPos
        promptRef.current.selectionEnd = newPos
        promptRef.current.focus()
      }
    })
  }

  // Render prompt with colored @mentions
  function renderHighlightedPrompt(text: string) {
    if (!assets) return text
    const parts: React.ReactNode[] = []
    const regex = /@[\w\u4e00-\u9fff]+(?:\s[\w\u4e00-\u9fff]+)*/g
    let lastIdx = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
      const name = match[0].slice(1)
      const isRole = assets.roles.some(r => r.name === name || r.name.toUpperCase() === name.toUpperCase())
      const isLoc = assets.locations.some(l => l.name === name || l.name.toUpperCase() === name.toUpperCase())
      parts.push(
        <span key={match.index} style={{
          color: isRole ? "#7C3AED" : isLoc ? "#059669" : "#4F46E5",
          fontWeight: 600,
        }}>
          {match[0]}
        </span>
      )
      lastIdx = match.index + match[0].length
    }
    if (lastIdx < text.length) parts.push(text.slice(lastIdx))
    return parts.length > 0 ? parts : text
  }

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
                      {/* Prompt textarea with optional drag & drop */}
                      {isEditing ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div
                            className="relative rounded-lg transition-all"
                            style={{
                              border: isDragOver && assets ? "2px dashed #4F46E5" : "1px solid var(--border, #D0D0D0)",
                              background: isDragOver && assets ? "#EEF2FF" : "var(--muted, #F5F5F5)",
                            }}
                          >
                            {isDragOver && assets && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-lg z-20 pointer-events-none"
                                style={{ background: "rgba(79,70,229,0.08)" }}>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg"
                                  style={{ background: "#4F46E5", color: "#fff" }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path d="M12 5v14M5 12h14"/>
                                  </svg>
                                  <span className="text-[11px] font-medium">Drop here to insert</span>
                                </div>
                              </div>
                            )}
                            {/* Highlight overlay for @mentions */}
                            {assets && (
                              <div
                                aria-hidden
                                className="absolute inset-0 p-2.5 text-sm leading-relaxed overflow-hidden whitespace-pre-wrap break-words pointer-events-none"
                                style={{ color: "#333", fontFamily: "inherit" }}
                              >
                                {renderHighlightedPrompt(draftPrompt)}
                              </div>
                            )}
                            <textarea
                              ref={promptRef}
                              className="relative z-10 w-full resize-none text-sm leading-relaxed p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                              rows={assets ? 6 : 4}
                              value={draftPrompt}
                              onChange={(e) => setDraftPrompt(e.target.value)}
                              placeholder={t("rehearsal.placeholder")}
                              style={assets ? { background: "transparent", color: "transparent", caretColor: "#333" } : { background: "transparent" }}
                              onDragOver={assets ? (e) => {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = "copy"
                                setIsDragOver(true)
                                if (promptRef.current) dropPosRef.current = promptRef.current.selectionStart
                              } : undefined}
                              onDragLeave={assets ? () => setIsDragOver(false) : undefined}
                              onDrop={assets ? (e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setIsDragOver(false)
                                const data = e.dataTransfer.getData("text/plain")
                                if (data) {
                                  const pos = dropPosRef.current
                                  const before = draftPrompt.substring(0, pos)
                                  const after = draftPrompt.substring(pos)
                                  const newValue = before + data + " " + after
                                  setDraftPrompt(newValue)
                                  const newPos = pos + data.length + 1
                                  requestAnimationFrame(() => {
                                    if (promptRef.current) {
                                      promptRef.current.focus()
                                      promptRef.current.selectionStart = newPos
                                      promptRef.current.selectionEnd = newPos
                                    }
                                  })
                                }
                              } : undefined}
                            />
                          </div>

                          {/* ── Asset Tray: Draggable Elements ── */}
                          {assets && assets.roles.length + assets.locations.length > 0 && (
                            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #D8D8D8", background: "#fff" }}>
                              {/* Tab headers */}
                              <div className="flex" style={{ borderBottom: "1px solid #E8E8E8", background: "#F8F8F8" }}>
                                {([
                                  { id: "characters" as const, icon: "👤", label: "Characters" },
                                  { id: "locations" as const, icon: "🏞", label: "Locations" },
                                ]).map(tab => (
                                  <button
                                    key={tab.id}
                                    onClick={() => setAssetTab(tab.id)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors relative"
                                    style={{ color: assetTab === tab.id ? "#4F46E5" : "#999" }}
                                  >
                                    <span>{tab.icon}</span>
                                    <span>{tab.label}</span>
                                    {assetTab === tab.id && (
                                      <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t" style={{ background: "#4F46E5" }} />
                                    )}
                                  </button>
                                ))}
                              </div>

                              {/* Asset cards */}
                              <div className="p-2 max-h-[220px] overflow-y-auto">
                                {/* Characters */}
                                {assetTab === "characters" && (
                                  assets.roles.length > 0 ? (
                                    <div className="grid grid-cols-4 gap-1.5">
                                      {assets.roles.map(role => (
                                        <div
                                          key={role.id}
                                          draggable
                                          onDragStart={e => {
                                            e.dataTransfer.setData("text/plain", `@${role.name}`)
                                            e.dataTransfer.effectAllowed = "copy"
                                          }}
                                          onClick={() => insertAtCursor(`@${role.name}`)}
                                          className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-lg transition-all select-none group"
                                          style={{ border: "2px solid transparent" }}
                                          title={`Drag or click to insert @${role.name}`}
                                        >
                                          {role.referenceImages?.[0] ? (
                                            <img src={role.referenceImages[0]} alt={role.name}
                                              className="w-full h-16 object-cover pointer-events-none group-hover:scale-105 transition-transform duration-200" />
                                          ) : (
                                            <div className="w-full h-16 flex items-center justify-center text-lg font-bold pointer-events-none"
                                              style={{ background: "#E8E4FF", color: "#4F46E5" }}>
                                              {role.name[0]?.toUpperCase()}
                                            </div>
                                          )}
                                          <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 pointer-events-none"
                                            style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                                            <span className="text-[8px] font-semibold text-white truncate block leading-tight">
                                              {role.name}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <div className="py-3 text-center text-[10px]" style={{ color: "#CCC" }}>No character data</div>
                                )}

                                {/* Locations */}
                                {assetTab === "locations" && (
                                  assets.locations.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {assets.locations.map(loc => {
                                        const photoUrl = loc.photos?.[0]?.url || loc.photoUrl
                                        return (
                                          <div
                                            key={loc.name}
                                            draggable
                                            onDragStart={e => {
                                              e.dataTransfer.setData("text/plain", `@${loc.name}`)
                                              e.dataTransfer.effectAllowed = "copy"
                                            }}
                                            onClick={() => insertAtCursor(`@${loc.name}`)}
                                            className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-lg transition-all select-none group"
                                            style={{ border: "2px solid transparent" }}
                                            title={`Drag or click to insert @${loc.name}`}
                                          >
                                            {photoUrl ? (
                                              <img src={photoUrl} alt={loc.name}
                                                className="w-full h-24 object-cover pointer-events-none group-hover:scale-105 transition-transform duration-200" />
                                            ) : (
                                              <div className="w-full h-24 flex items-center justify-center pointer-events-none"
                                                style={{ background: "#FEE2E2" }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2}>
                                                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                                                  <circle cx="12" cy="10" r="3"/>
                                                </svg>
                                              </div>
                                            )}
                                            <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 pointer-events-none"
                                              style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                                              <span className="text-[9px] font-semibold text-white truncate block leading-tight">
                                                {loc.name}
                                              </span>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : <div className="py-3 text-center text-[10px]" style={{ color: "#CCC" }}>No location data</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : isDraft || isFailed ? (
                        <div
                          className="w-full rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={(e) => { e.stopPropagation(); startEdit(r) }}
                        >
                          {assets ? renderHighlightedPrompt(r.prompt) : r.prompt}
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
