"use client"

import { useState, useRef, useMemo, useCallback } from "react"
import { t } from "@/lib/i18n"
import { PromptToolbar } from "@/components/dev/prompt-toolbar"
import { resolveImageUrl } from "@/lib/storage"
import type { VideoSegment, ScriptRole, ScriptLocation, ScriptProp, Scene } from "../lib/editing-helpers"

type ComposerMode = "replace" | "insert" | "append"

interface PromptComposerProps {
  mode: ComposerMode
  scriptId: string
  episodeNum: number
  segment?: VideoSegment | null    // for replace mode
  afterIndex: number               // for insert/append
  sceneNum: number
  scenes: Scene[]
  roles: ScriptRole[]
  locations: ScriptLocation[]
  props: ScriptProp[]
  nearbySegments: VideoSegment[]   // nearby done segments for reference
  onClose: () => void
  onSubmitReplace: (segId: string, prompt: string, durationSec: number, shotType: string, cameraMove: string) => void
  onSubmitInsert: (afterIndex: number, prompt: string, durationSec: number, shotType: string, cameraMove: string, sceneNum: number) => void
}

const DURATIONS = [3, 5, 8, 10, 15]
const SHOT_TYPES = ["", "wide", "medium", "close-up", "extreme-close-up", "over-shoulder", "two-shot"]
const CAMERA_MOVES = ["", "static", "pan", "tilt", "dolly", "tracking", "orbit", "zoom-in", "zoom-out"]

export function PromptComposer({
  mode,
  scriptId,
  episodeNum,
  segment,
  afterIndex,
  sceneNum,
  scenes,
  roles,
  locations,
  props,
  nearbySegments,
  onClose,
  onSubmitReplace,
  onSubmitInsert,
}: PromptComposerProps) {
  const [prompt, setPrompt] = useState(mode === "replace" && segment ? segment.prompt : "")
  const [duration, setDuration] = useState(mode === "replace" && segment ? segment.durationSec : 5)
  const [shotType, setShotType] = useState(mode === "replace" && segment ? (segment.shotType || "") : "")
  const [cameraMove, setCameraMove] = useState(mode === "replace" && segment ? (segment.cameraMove || "") : "")
  const [selectedScene, setSelectedScene] = useState(sceneNum)
  const [assetTab, setAssetTab] = useState<"characters" | "locations" | "props" | "materials">("characters")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const dropPosRef = useRef(0)

  // @mention highlighting
  const mentionLookup = useMemo(() => {
    const map = new Map<string, "char" | "loc" | "prop">()
    for (const r of roles) map.set(r.name.toLowerCase(), "char")
    for (const l of locations) map.set(l.name.toLowerCase(), "loc")
    for (const p of props) map.set(p.name.toLowerCase(), "prop")
    return map
  }, [roles, locations, props])

  const mentionRegex = useMemo(() => {
    const names = [
      ...roles.map(r => r.name),
      ...locations.map(l => l.name),
      ...props.map(p => p.name),
    ].filter(Boolean).sort((a, b) => b.length - a.length)
    const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    if (escaped.length === 0) return /\[Ref Seg#\d+\]/g
    return new RegExp(`(@(?:${escaped.join("|")}))|(\\[Ref Seg#\\d+\\])`, "gi")
  }, [roles, locations, props])

  function renderHighlighted(text: string) {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let key = 0
    mentionRegex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
      }
      const token = match[0]
      if (match[1]) {
        const name = token.slice(1)
        const type = mentionLookup.get(name.toLowerCase())
        const color = type === "char" ? "#6366F1" : type === "loc" ? "#10B981" : "#F59E0B"
        const bg = type === "char" ? "rgba(99,102,241,0.15)" : type === "loc" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)"
        parts.push(
          <span key={key++} style={{ color, background: bg, borderRadius: 3, padding: "0 2px", fontWeight: 600 }}>
            {token}
          </span>
        )
      } else {
        parts.push(
          <span key={key++} style={{ color: "#F97316", background: "rgba(249,115,22,0.15)", borderRadius: 3, padding: "0 2px", fontWeight: 600 }}>
            {token}
          </span>
        )
      }
      lastIndex = match.index + token.length
    }
    if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
    parts.push(<br key="tail" />)
    return parts
  }

  function insertAtCursor(text: string) {
    const textarea = promptRef.current
    if (textarea && document.activeElement === textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = prompt.substring(0, start)
      const after = prompt.substring(end)
      setPrompt(before + text + " " + after)
      setTimeout(() => {
        if (promptRef.current) {
          const pos = start + text.length + 1
          promptRef.current.selectionStart = pos
          promptRef.current.selectionEnd = pos
          promptRef.current.focus()
        }
      }, 0)
    } else {
      setPrompt(prev => prev + (prev ? " " : "") + text)
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      if (mode === "replace" && segment) {
        onSubmitReplace(segment.id, prompt, duration, shotType, cameraMove)
      } else {
        onSubmitInsert(afterIndex, prompt, duration, shotType, cameraMove, selectedScene)
      }
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }, [mode, segment, prompt, duration, shotType, cameraMove, afterIndex, selectedScene, isSubmitting, onSubmitReplace, onSubmitInsert, onClose])

  const scene = scenes.find(s => s.sceneNum === selectedScene)
  const title = mode === "replace"
    ? t("dev.editing.replaceShot")
    : t("dev.editing.insertShot")
  const submitLabel = mode === "replace"
    ? t("dev.editing.generateReplace")
    : t("dev.editing.createGenerate")

  // Find scene-relevant roles
  const sceneRoles = useMemo(() => {
    const sc = scenes.find(s => s.sceneNum === selectedScene)
    if (!sc) return roles
    // Filter roles that appear in this scene's characters
    const relevant = roles.filter(r => {
      const heading = sc.heading || ""
      return heading.toLowerCase().includes(r.name.toLowerCase())
    })
    if (relevant.length > 0) return [...relevant, ...roles.filter(r => !relevant.includes(r))]
    return roles
  }, [scenes, selectedScene, roles])

  // Scene-relevant locations
  const sceneLocations = useMemo(() => {
    const sc = scenes.find(s => s.sceneNum === selectedScene)
    if (!sc) return locations
    return locations
  }, [scenes, selectedScene, locations])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "#1A1A2E", border: "1px solid #2C2C40", width: 720, maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #2C2C40" }}>
          <div>
            <h2 className="text-[13px] font-bold" style={{ color: "#E0E0FF" }}>{title}</h2>
            {segment && (
              <p className="text-[10px]" style={{ color: "#666" }}>
                SC{String(segment.sceneNum).padStart(2, "0")} / #{segment.segmentIndex + 1}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[14px] px-2 py-0.5 rounded hover:bg-white/10" style={{ color: "#999" }}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Prompt + Settings */}
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto dev-scrollbar" style={{ borderRight: "1px solid #2C2C40" }}>
            {/* Prompt toolbar */}
            <PromptToolbar
              value={prompt}
              onValueChange={(v) => setPrompt(v)}
              theme="dark"
              className="mb-1"
            />

            {/* Dual-layer textarea */}
            <div className="relative rounded-lg overflow-hidden" style={{ border: "1px solid #3A3A50", background: "#0D0D1A" }}>
              <div
                aria-hidden
                className="absolute inset-0 p-3 text-[12px] leading-relaxed overflow-hidden whitespace-pre-wrap break-words pointer-events-none"
                style={{ color: "#CCC", fontFamily: "inherit" }}
              >
                {renderHighlighted(prompt)}
              </div>
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onDragOver={e => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "copy"
                  if (promptRef.current) dropPosRef.current = promptRef.current.selectionStart
                }}
                onDrop={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  const data = e.dataTransfer.getData("text/plain")
                  if (data) {
                    const pos = dropPosRef.current
                    const before = prompt.substring(0, pos)
                    const after = prompt.substring(pos)
                    setPrompt(before + data + " " + after)
                    requestAnimationFrame(() => {
                      if (promptRef.current) {
                        const np = pos + data.length + 1
                        promptRef.current.focus()
                        promptRef.current.selectionStart = np
                        promptRef.current.selectionEnd = np
                      }
                    })
                  }
                }}
                rows={6}
                className="relative z-10 w-full resize-none text-[12px] leading-relaxed p-3 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                style={{ background: "transparent", color: "transparent", caretColor: "#A5B4FC" }}
                placeholder={t("dev.editing.promptPlaceholder")}
              />
            </div>

            {/* Settings row */}
            <div className="flex flex-wrap gap-3 items-center">
              {/* Duration */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>
                  {t("dev.editing.duration")}
                </span>
                <div className="flex gap-0.5">
                  {DURATIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      style={{
                        background: duration === d ? "#4F46E5" : "#2C2C40",
                        color: duration === d ? "#fff" : "#888",
                      }}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Shot type */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>
                  {t("dev.editing.shotType")}
                </span>
                <select
                  value={shotType}
                  onChange={e => setShotType(e.target.value)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: "#2C2C40", color: "#CCC", border: "1px solid #3A3A50" }}
                >
                  <option value="">Auto</option>
                  {SHOT_TYPES.filter(s => s).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Camera */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>
                  {t("dev.editing.cameraMove")}
                </span>
                <select
                  value={cameraMove}
                  onChange={e => setCameraMove(e.target.value)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: "#2C2C40", color: "#CCC", border: "1px solid #3A3A50" }}
                >
                  <option value="">Auto</option>
                  {CAMERA_MOVES.filter(s => s).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Scene selector (for insert/append) */}
              {mode !== "replace" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>Scene</span>
                  <select
                    value={selectedScene}
                    onChange={e => setSelectedScene(Number(e.target.value))}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ background: "#2C2C40", color: "#CCC", border: "1px solid #3A3A50" }}
                  >
                    {scenes.filter(s => s.episodeNum === episodeNum).map(s => (
                      <option key={s.sceneNum} value={s.sceneNum}>
                        SC{String(s.sceneNum).padStart(2, "0")} {s.heading ? `- ${s.heading.slice(0, 20)}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {scene && (
              <p className="text-[9px]" style={{ color: "#555" }}>
                Scene {scene.sceneNum}: {scene.heading || "—"} {scene.mood ? `· ${scene.mood}` : ""}
              </p>
            )}
          </div>

          {/* Right: Asset tray */}
          <div className="w-52 flex flex-col flex-shrink-0" style={{ background: "#151525" }}>
            {/* Tabs */}
            <div className="flex" style={{ borderBottom: "1px solid #2C2C40" }}>
              {([
                { id: "characters" as const, icon: "👤", label: t("dev.editing.composerCharacters") },
                { id: "locations" as const, icon: "📍", label: t("dev.editing.composerLocations") },
                { id: "props" as const, icon: "🎬", label: t("dev.editing.composerProps") },
                { id: "materials" as const, icon: "📦", label: t("dev.editing.composerMaterials") },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setAssetTab(tab.id)}
                  className="flex-1 py-2 text-[9px] font-medium transition-colors"
                  style={{ color: assetTab === tab.id ? "#A5B4FC" : "#666" }}
                  title={tab.label}
                >
                  <span className="block text-center">{tab.icon}</span>
                </button>
              ))}
            </div>

            {/* Asset list */}
            <div className="flex-1 overflow-y-auto dev-scrollbar p-1.5">
              {assetTab === "characters" && (
                <div className="grid grid-cols-2 gap-1">
                  {sceneRoles.map(role => (
                    <div
                      key={role.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData("text/plain", `@${role.name}`)
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      onClick={() => insertAtCursor(`@${role.name}`)}
                      className="relative rounded overflow-hidden cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-indigo-400/50 transition-all select-none"
                    >
                      {(role.avatarUrl || role.referenceImages?.[0]) ? (
                        <img src={resolveImageUrl((role.avatarUrl || role.referenceImages?.[0])!)} alt={role.name} className="w-full h-14 object-cover" />
                      ) : (
                        <div className="w-full h-14 flex items-center justify-center text-sm font-bold" style={{ background: "#2C2C40", color: "#6366F1" }}>
                          {role.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
                        <span className="text-[7px] font-semibold text-white truncate block">{role.name}</span>
                      </div>
                    </div>
                  ))}
                  {sceneRoles.length === 0 && (
                    <p className="col-span-2 text-[9px] text-center py-4" style={{ color: "#555" }}>No characters</p>
                  )}
                </div>
              )}

              {assetTab === "locations" && (
                <div className="grid grid-cols-1 gap-1">
                  {sceneLocations.map(loc => (
                    <div
                      key={loc.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData("text/plain", `@${loc.name}`)
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      onClick={() => insertAtCursor(`@${loc.name}`)}
                      className="relative rounded overflow-hidden cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-emerald-400/50 transition-all select-none"
                    >
                      {loc.photoUrl ? (
                        <img src={resolveImageUrl(loc.photoUrl)} alt={loc.name} className="w-full h-12 object-cover" />
                      ) : (
                        <div className="w-full h-12 flex items-center justify-center text-sm" style={{ background: "#1A2E1A", color: "#10B981" }}>
                          📍
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
                        <span className="text-[7px] font-semibold text-white truncate block">{loc.name}</span>
                      </div>
                    </div>
                  ))}
                  {sceneLocations.length === 0 && (
                    <p className="text-[9px] text-center py-4" style={{ color: "#555" }}>No locations</p>
                  )}
                </div>
              )}

              {assetTab === "props" && (
                <div className="grid grid-cols-2 gap-1">
                  {props.map(prop => (
                    <div
                      key={prop.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData("text/plain", `@${prop.name}`)
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      onClick={() => insertAtCursor(`@${prop.name}`)}
                      className="relative rounded overflow-hidden cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-amber-400/50 transition-all select-none"
                    >
                      {prop.photoUrl ? (
                        <img src={resolveImageUrl(prop.photoUrl)} alt={prop.name} className="w-full h-14 object-cover" />
                      ) : (
                        <div className="w-full h-14 flex items-center justify-center text-sm" style={{ background: "#2E2A1A", color: "#F59E0B" }}>
                          🎬
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
                        <span className="text-[7px] font-semibold text-white truncate block">{prop.name}</span>
                      </div>
                    </div>
                  ))}
                  {props.length === 0 && (
                    <p className="col-span-2 text-[9px] text-center py-4" style={{ color: "#555" }}>No props</p>
                  )}
                </div>
              )}

              {assetTab === "materials" && (
                <div className="grid grid-cols-2 gap-1">
                  {nearbySegments.filter(s => s.status === "done" && s.thumbnailUrl).map(seg => (
                    <div
                      key={seg.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData("text/plain", `[Ref Seg#${seg.segmentIndex + 1}]`)
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      onClick={() => insertAtCursor(`[Ref Seg#${seg.segmentIndex + 1}]`)}
                      className="relative rounded overflow-hidden cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-orange-400/50 transition-all select-none"
                    >
                      <img src={seg.thumbnailUrl!} alt="" className="w-full h-14 object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
                        <span className="text-[7px] font-semibold text-white block">
                          #{seg.segmentIndex + 1} · {seg.durationSec}s
                        </span>
                      </div>
                    </div>
                  ))}
                  {nearbySegments.filter(s => s.status === "done" && s.thumbnailUrl).length === 0 && (
                    <p className="col-span-2 text-[9px] text-center py-4" style={{ color: "#555" }}>No materials</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid #2C2C40" }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[11px] font-medium"
            style={{ background: "#2C2C40", color: "#999" }}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isSubmitting}
            className="px-4 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-40"
            style={{ background: "#4F46E5", color: "#fff" }}
          >
            {isSubmitting ? "..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
