"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SceneHeader } from "./scene-header"
import { SegmentTimeline } from "./segment-timeline"
import { AIConfirmModal } from "@/components/dev/ai-confirm-modal"

// ─── Block system ────────────────────────────────────────────────────────────
export type Block =
  | { type: "action"; text: string }
  | { type: "dialogue"; character: string; parenthetical: string; line: string }
  | { type: "direction"; text: string }

function parseBlocks(raw: string | null | undefined): Block[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.length > 0 && "type" in parsed[0]) return parsed as Block[]
    } catch { /* fallthrough */ }
  }
  return [{ type: "action", text: trimmed }]
}

function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks)
}

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Scene {
  id: string; episodeNum: number; sceneNum: number
  heading?: string | null; action?: string | null; dialogue?: string | null
  stageDirection?: string | null; mood?: string | null; location?: string | null
  timeOfDay?: string | null; promptHint?: string | null; duration?: number | null
  sortOrder: number
}
interface VideoSegment {
  id: string; episodeNum: number; segmentIndex: number; sceneNum: number
  durationSec: number; prompt: string; shotType?: string | null
  cameraMove?: string | null; model?: string | null; resolution?: string | null; status: string
}
interface Role { id: string; name: string; role: string; referenceImages?: string[] }
interface PolishResult { original: Partial<Scene>; polished: Partial<Scene> }
interface Suggestion { type: string; message: string; sceneNumber?: number }

interface SceneDetailPanelProps {
  scene: Scene | null; scenes: Scene[]; segments: VideoSegment[]
  editingScenes: Record<string, Partial<Scene>>; savingScenes: Set<string>
  getSceneValue: (scene: Scene, field: keyof Scene) => string
  onUpdateField: (sceneId: string, field: string, value: string) => void
  onSaveAll: () => void
  isPolishing: string | null; onPolish: (sceneId: string) => void
  polishResult: { sceneId: string; data: PolishResult } | null
  onAcceptPolish: () => void; onDismissPolish: () => void
  isSuggesting: boolean; suggestions: Suggestion[] | null
  onSuggest: () => void; onDismissSuggestions: () => void
  isGenerating: boolean; onGenerate: (generateAll?: boolean) => void
  onAddScene: (afterId?: string) => void; onDeleteScene: (id: string) => void
  selectedSceneId: string | null; onSelectScene: (id: string | null) => void
  activeTab: "script-text" | "breakdown"; onSetActiveTab: (tab: "script-text" | "breakdown") => void
  selectedSegmentId: string | null; onSelectSegment: (id: string | null) => void
  scriptId: string; selectedEpisode: number; roles: Role[]; onRefreshScript: () => void
  // Scene navigation (up/down through scene list)
  onNavigateScene: (delta: 1 | -1) => void
}

// ─── Kbd pill ─────────────────────────────────────────────────────────────────
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center text-[9px] px-1 py-0.5 rounded font-mono"
      style={{ background: "#E8E4DC", color: "#888", border: "1px solid #D0C8C0" }}>
      {children}
    </kbd>
  )
}

// ─── Block adder menu ─────────────────────────────────────────────────────────
function AddBlockMenu({ onAdd, showHints }: { onAdd: (type: Block["type"]) => void; showHints?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex justify-center my-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-all opacity-30 hover:opacity-100"
        style={{ background: "#E0DDD8", color: "#666" }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        add
      </button>
      {open && (
        <div className="absolute top-6 z-10 rounded-lg shadow-lg overflow-hidden flex"
          style={{ background: "#fff", border: "1px solid #D8D0C0" }}
          onMouseLeave={() => setOpen(false)}>
          {([
            { type: "action"    as const, label: "Action",    icon: "A", hint: "⌥A", bg: "#E8F0FE", fg: "#2563EB" },
            { type: "dialogue"  as const, label: "Dialogue",  icon: "D", hint: "⌥D", bg: "#FEF9C3", fg: "#92400E" },
            { type: "direction" as const, label: "Direction", icon: "P", hint: "⌥P", bg: "#F0FDF4", fg: "#166534" },
          ]).map(btn => (
            <button key={btn.type}
              onClick={() => { onAdd(btn.type); setOpen(false) }}
              className="flex flex-col items-center gap-1 px-4 py-2.5 transition-colors hover:bg-gray-50 text-[10px]"
              style={{ color: "#555", borderRight: "1px solid #EEE" }}>
              <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold"
                style={{ background: btn.bg, color: btn.fg }}>{btn.icon}</span>
              <span>{btn.label}</span>
              {showHints && <Kbd>{btn.hint}</Kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Prompt Hint Field ────────────────────────────────────────────────────────
function PromptHintField({ sceneId, value, onChange, scriptId }: {
  sceneId: string; value: string; onChange: (v: string) => void; scriptId: string
}) {
  const [isAdapting, setIsAdapting] = useState(false)
  const [showAdaptConfirm, setShowAdaptConfirm] = useState(false)

  async function handleAIAdapt() {
    setIsAdapting(true)
    try {
      const res = await fetch("/api/ai/adapt-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId, existingHint: value }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.promptHint) onChange(data.promptHint)
      } else {
        alert("AI adapt failed")
      }
    } finally {
      setIsAdapting(false)
    }
  }

  return (
    <>
    <div className="mt-4 pt-3" style={{ borderTop: "1px dashed #E0D8D0", fontFamily: "sans-serif" }}>
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#AAA" }}>Prompt Hint</span>
          <span className="text-[9px]" style={{ color: "#CCC" }}>for video generation</span>
        </div>
        <button
          onClick={() => setShowAdaptConfirm(true)}
          disabled={isAdapting}
          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
          style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
        >
          {isAdapting ? (
            <><div className="w-2 h-2 rounded-full border border-indigo-400 border-t-transparent animate-spin" /> Adapting...</>
          ) : (
            <>✦ AI Adapt</>
          )}
        </button>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Camera: close-up on her face. Lighting: soft, backlit. Cinematic 16mm grain..."
        rows={2}
        className="w-full resize-none focus:outline-none text-[11px] leading-relaxed rounded px-2 py-1.5"
        style={{ background: "#F0EDE8", color: "#777", border: "1px solid #E0D8D0" }}
      />
    </div>

    {showAdaptConfirm && (
      <AIConfirmModal
        featureKey="adapt_prompt"
        featureLabel="AI Adapt Prompt"
        onConfirm={() => { setShowAdaptConfirm(false); handleAIAdapt() }}
        onCancel={() => setShowAdaptConfirm(false)}
      />
    )}
    </>
  )
}

// ─── Shortcut legend ─────────────────────────────────────────────────────────
function ShortcutLegend() {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
  const mod = isMac ? "⌘" : "Ctrl"
  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 select-none"
      style={{ borderTop: "1px dashed #E0D8D0", fontFamily: "sans-serif" }}>
      <span className="text-[9px] uppercase tracking-wider" style={{ color: "#CCC" }}>Shortcuts</span>
      {[
        { key: `${mod}+S`, desc: "Save" },
        { key: "⌥A",       desc: "Add Action" },
        { key: "⌥D",       desc: "Add Dialogue" },
        { key: "⌥P",       desc: "Add Direction" },
        { key: "⌥↑",       desc: "Prev scene" },
        { key: "⌥↓",       desc: "Next scene" },
        { key: "⌥⌫",       desc: "Delete block" },
      ].map(s => (
        <span key={s.key} className="flex items-center gap-1">
          <Kbd>{s.key}</Kbd>
          <span className="text-[9px]" style={{ color: "#BBB" }}>{s.desc}</span>
        </span>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SceneDetailPanel({
  scene, scenes, segments, editingScenes, savingScenes,
  getSceneValue, onUpdateField, onSaveAll,
  isPolishing, onPolish, polishResult, onAcceptPolish, onDismissPolish,
  isSuggesting, suggestions, onSuggest, onDismissSuggestions,
  isGenerating, onGenerate, onAddScene, onDeleteScene,
  selectedSceneId, onSelectScene,
  activeTab, onSetActiveTab,
  selectedSegmentId, onSelectSegment,
  scriptId, selectedEpisode, roles, onRefreshScript,
  onNavigateScene,
}: SceneDetailPanelProps) {
  const hasUnsaved = Object.keys(editingScenes).length > 0

  // Track which block index has focus (for keyboard shortcuts)
  const [focusedBlockIdx, setFocusedBlockIdx] = useState<number>(-1)
  // Ref to auto-focus newly inserted block
  const pendingFocusIdx = useRef<number | null>(null)
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map())

  // ── Derived scene state (safe to compute even if scene is null) ─────────────
  const rawAction = scene ? getSceneValue(scene, "action") : null
  const blocks = parseBlocks(rawAction)
  const isSaving = scene ? savingScenes.has(scene.id) : false
  const isEdited = scene ? scene.id in editingScenes : false
  const sceneIdx = scenes.findIndex(s => s.id === selectedSceneId)

  // ── Block mutation helpers (must be before early return — Rules of Hooks) ──
  const updateBlocks = useCallback((newBlocks: Block[]) => {
    if (!scene) return
    onUpdateField(scene.id, "action", serializeBlocks(newBlocks))
  }, [scene, onUpdateField])

  const insertBlock = useCallback((afterIndex: number, type: Block["type"]) => {
    const newBlock: Block = type === "action"
      ? { type: "action", text: "" }
      : type === "dialogue"
        ? { type: "dialogue", character: "", parenthetical: "", line: "" }
        : { type: "direction", text: "" }
    const insertAt = afterIndex + 1
    const next = [...blocks]
    next.splice(insertAt, 0, newBlock)
    updateBlocks(next)
    pendingFocusIdx.current = insertAt
    setFocusedBlockIdx(insertAt)
  }, [blocks, updateBlocks])

  const deleteBlock = useCallback((index: number) => {
    const next = blocks.filter((_, i) => i !== index)
    updateBlocks(next)
    const newFocus = Math.max(0, index - 1)
    setFocusedBlockIdx(next.length > 0 ? newFocus : -1)
    pendingFocusIdx.current = next.length > 0 ? newFocus : null
  }, [blocks, updateBlocks])

  const updateBlock = useCallback((index: number, patch: Partial<Block>) => {
    const next = blocks.map((b, i) => i === index ? { ...b, ...patch } as Block : b)
    updateBlocks(next)
  }, [blocks, updateBlocks])

  // ── Auto-focus newly inserted block ───────────────────────────────────────
  useEffect(() => {
    if (pendingFocusIdx.current !== null) {
      const idx = pendingFocusIdx.current
      pendingFocusIdx.current = null
      const el = blockRefs.current.get(`block-${idx}`)
      if (el) {
        const input = el.querySelector<HTMLElement>("textarea, input")
        input?.focus()
      }
    }
  })

  // ── Block ref registration ─────────────────────────────────────────────────
  function setBlockRef(idx: number, el: HTMLDivElement | null) {
    const key = `block-${idx}`
    if (el) blockRefs.current.set(key, el)
    else blockRefs.current.delete(key)
  }

  // ── Global keyboard handler ────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isAlt = e.altKey
    const isMod = e.metaKey || e.ctrlKey

    // ⌘S / Ctrl+S — save
    if (isMod && e.key === "s") {
      e.preventDefault()
      onSaveAll()
      return
    }

    if (!isAlt) return

    // ⌥↑ / ⌥↓ — navigate scenes
    if (e.key === "ArrowUp") { e.preventDefault(); onNavigateScene(-1); return }
    if (e.key === "ArrowDown") { e.preventDefault(); onNavigateScene(1); return }

    // ⌥A — add Action after focused block
    if (e.key === "a" || e.key === "A") {
      e.preventDefault()
      insertBlock(focusedBlockIdx, "action")
      return
    }
    // ⌥D — add Dialogue
    if (e.key === "d" || e.key === "D") {
      e.preventDefault()
      insertBlock(focusedBlockIdx, "dialogue")
      return
    }
    // ⌥P — add Direction
    if (e.key === "p" || e.key === "P") {
      e.preventDefault()
      insertBlock(focusedBlockIdx, "direction")
      return
    }
    // ⌥Backspace / ⌥Delete — delete focused block
    if ((e.key === "Backspace" || e.key === "Delete") && focusedBlockIdx >= 0 && focusedBlockIdx < blocks.length) {
      e.preventDefault()
      deleteBlock(focusedBlockIdx)
    }
  }, [focusedBlockIdx, blocks.length, onSaveAll, onNavigateScene, insertBlock, deleteBlock])

  // No scene selected
  if (!scene) {
    return (
      <div className="h-full flex flex-col items-center justify-center"
        style={{ background: "#F8F6F1", color: "#C0C0C0" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-4 opacity-30">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" />
        </svg>
        <p className="text-sm mb-1" style={{ fontFamily: "sans-serif" }}>Select a scene</p>
        <p className="text-xs" style={{ color: "#CCC", fontFamily: "sans-serif" }}>or</p>
        {scenes.length === 0 ? (
          <div className="flex flex-col gap-2 mt-3">
            <button onClick={() => onGenerate(false)} disabled={isGenerating}
              className="px-4 py-1.5 text-xs rounded disabled:opacity-50"
              style={{ background: "#E0E4F8", color: "#4F46E5", fontFamily: "sans-serif" }}>
              {isGenerating ? "Generating..." : "AI Generate Episode 1"}
            </button>
            <button onClick={() => onGenerate(true)} disabled={isGenerating}
              className="px-4 py-1.5 text-xs rounded disabled:opacity-50"
              style={{ background: "#4F46E5", color: "#fff", fontFamily: "sans-serif" }}>
              {isGenerating ? "Generating..." : "AI Generate All Episodes"}
            </button>
          </div>
        ) : (
          <button onClick={() => onAddScene()}
            className="mt-3 px-4 py-1.5 text-xs rounded"
            style={{ background: "#E8E8E8", color: "#888", fontFamily: "sans-serif" }}>
            Add Scene
          </button>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col"
      style={{ background: "#F8F6F1", borderLeft: "1px solid #D0D0D0", borderRight: "1px solid #D0D0D0" }}
      onKeyDown={handleKeyDown}>

      {/* Scene Header */}
      <SceneHeader scene={scene} isSaving={isSaving} isEdited={isEdited} />

      {/* Tab Bar */}
      <div className="flex-shrink-0 flex items-center gap-0 px-4"
        style={{ borderBottom: "1px solid #D8D0C0", fontFamily: "sans-serif" }}>
        {(["script-text", "breakdown"] as const).map(tab => (
          <button key={tab} onClick={() => onSetActiveTab(tab)}
            className="px-3 py-2 text-[11px] font-medium transition-colors relative"
            style={{ color: activeTab === tab ? "#1A1A1A" : "#999" }}>
            {tab === "script-text" ? "Script" : "Breakdown"}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-t" style={{ background: "#4F46E5" }} />
            )}
          </button>
        ))}

        {/* Scene prev/next nav */}
        {activeTab === "script-text" && (
          <div className="flex items-center gap-0.5 ml-3">
            <button onClick={() => onNavigateScene(-1)} title="Previous scene (⌥↑)"
              className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-gray-200"
              style={{ color: "#AAA" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <span className="text-[10px]" style={{ color: "#CCC", minWidth: 32, textAlign: "center" }}>
              {sceneIdx + 1}/{scenes.length}
            </span>
            <button onClick={() => onNavigateScene(1)} title="Next scene (⌥↓)"
              className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-gray-200"
              style={{ color: "#AAA" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex-1" />
        {hasUnsaved && (
          <button onClick={onSaveAll} className="text-[10px] px-2 py-1 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>
            Save All
          </button>
        )}
        <button onClick={onSuggest} disabled={isSuggesting} className="ml-2 text-[10px] px-2 py-1 rounded" style={{ background: "#E8E8E8", color: "#777" }}>
          {isSuggesting ? "..." : "AI Suggest"}
        </button>
        <button onClick={() => onGenerate(false)} disabled={isGenerating} className="ml-2 text-[10px] px-2 py-1 rounded" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
          {isGenerating ? "Generating..." : "AI Generate"}
        </button>
        <button onClick={() => onGenerate(true)} disabled={isGenerating} className="ml-2 text-[10px] px-2 py-1 rounded font-medium" style={{ background: "#4F46E5", color: "#fff" }}>
          {isGenerating ? "..." : "All"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto dev-scrollbar">
        {activeTab === "script-text" ? (
          <div style={{ fontFamily: "'Courier New', Courier, monospace", background: "#F8F6F1" }}>

            {/* Suggestions banner */}
            {suggestions && suggestions.length > 0 && (
              <div className="mx-auto px-6 pt-4" style={{ maxWidth: 700 }}>
                <div className="p-3 rounded mb-4" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", fontFamily: "sans-serif" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold" style={{ color: "#92400E" }}>AI Suggestions</span>
                    <button onClick={onDismissSuggestions} className="text-[10px]" style={{ color: "#B45309" }}>Dismiss</button>
                  </div>
                  {suggestions.map((s, i) => (
                    <div key={i} className="text-[11px]" style={{ color: "#78350F" }}>
                      {s.type === "pacing" ? "🎬" : s.type === "camera" ? "📷" : "💭"} {s.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Polish Result */}
            {polishResult && polishResult.sceneId === scene.id && (
              <div className="mx-auto px-6 pt-2" style={{ maxWidth: 700 }}>
                <div className="p-3 rounded mb-4" style={{ background: "#FAF5FF", border: "1px solid #DDD6FE", fontFamily: "sans-serif" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold" style={{ color: "#6D28D9" }}>AI Polish</span>
                    <div className="flex gap-2">
                      <button onClick={onAcceptPolish} className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#D1FAE5", color: "#065F46" }}>Accept</button>
                      <button onClick={onDismissPolish} className="text-[10px]" style={{ color: "#8B5CF6" }}>Dismiss</button>
                    </div>
                  </div>
                  {polishResult.data.polished.action && (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "#5B21B6" }}>
                      {polishResult.data.polished.action as string}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SCREENPLAY PAGE ── */}
            <div className="mx-auto py-8 px-6" style={{ maxWidth: 700 }}>

              {/* SCENE HEADING */}
              <div className="mb-6">
                <textarea
                  value={getSceneValue(scene, "heading")}
                  onChange={e => onUpdateField(scene.id, "heading", e.target.value)}
                  placeholder="INT. LOCATION - DAY"
                  rows={1}
                  className="w-full resize-none focus:outline-none text-sm font-bold uppercase leading-snug bg-transparent"
                  style={{ color: "#1A1A1A", letterSpacing: "0.04em", fontFamily: "inherit", borderBottom: "2px solid #D8D0C0", paddingBottom: 6 }}
                  onFocus={() => setFocusedBlockIdx(-1)}
                  onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px" }}
                />
              </div>

              {/* ── INTERLEAVED BLOCKS ── */}
              {blocks.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-[11px] mb-2" style={{ color: "#CCC", fontFamily: "sans-serif" }}>No content yet.</p>
                  <p className="text-[10px]" style={{ color: "#DDD", fontFamily: "sans-serif" }}>
                    Press <Kbd>⌥A</Kbd> for action · <Kbd>⌥D</Kbd> for dialogue · <Kbd>⌥P</Kbd> for direction
                  </p>
                </div>
              )}

              {blocks.map((block, idx) => (
                <div key={idx}
                  ref={el => setBlockRef(idx, el)}
                  className="group relative mb-0"
                  onFocus={() => setFocusedBlockIdx(idx)}>

                  {/* Block type label in gutter */}
                  <div className="absolute -left-14 top-0 w-12 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
                    <span className="text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded"
                      style={{
                        color: block.type === "action" ? "#2563EB" : block.type === "dialogue" ? "#92400E" : "#166534",
                        background: block.type === "action" ? "#EFF6FF" : block.type === "dialogue" ? "#FEFCE8" : "#F0FDF4",
                      }}>
                      {block.type === "direction" ? "dir" : block.type}
                    </span>
                  </div>

                  {/* Focused block left accent */}
                  {focusedBlockIdx === idx && (
                    <div className="absolute -left-3 top-1 bottom-1 w-0.5 rounded-full" style={{ background: "#4F46E5" }} />
                  )}

                  {/* ── ACTION ── */}
                  {block.type === "action" && (
                    <div className="relative mb-3">
                      <textarea
                        value={block.text}
                        onChange={e => updateBlock(idx, { text: e.target.value })}
                        placeholder="Action. Present tense. What we see and hear..."
                        rows={3}
                        className="w-full resize-none focus:outline-none text-[13px] leading-[1.9] bg-transparent"
                        style={{ color: "#222", fontFamily: "inherit" }}
                        onFocus={() => setFocusedBlockIdx(idx)}
                        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px" }}
                      />
                      <button onClick={() => deleteBlock(idx)}
                        className="absolute top-0 right-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", fontFamily: "sans-serif" }}
                        title="Delete block (⌥⌫)">×</button>
                    </div>
                  )}

                  {/* ── DIALOGUE ── */}
                  {block.type === "dialogue" && (
                    <div className="relative mb-4">
                      <div className="flex items-baseline gap-2" style={{ paddingLeft: "35%" }}>
                        <input type="text"
                          value={block.character}
                          onChange={e => updateBlock(idx, { character: e.target.value })}
                          placeholder="CHARACTER"
                          className="text-[12px] font-bold uppercase focus:outline-none bg-transparent flex-1"
                          style={{ color: "#1A1A1A", letterSpacing: "0.06em", fontFamily: "inherit" }}
                          onFocus={() => setFocusedBlockIdx(idx)}
                        />
                        <input type="text"
                          value={block.parenthetical}
                          onChange={e => updateBlock(idx, { parenthetical: e.target.value })}
                          placeholder="(cont'd)"
                          className="text-[11px] italic focus:outline-none bg-transparent w-24 text-right"
                          style={{ color: "#999", fontFamily: "inherit" }}
                          onFocus={() => setFocusedBlockIdx(idx)}
                        />
                      </div>
                      <textarea
                        value={block.line}
                        onChange={e => updateBlock(idx, { line: e.target.value })}
                        placeholder="Dialogue text..."
                        rows={2}
                        className="w-full resize-none focus:outline-none text-[13px] leading-[1.8] bg-transparent"
                        style={{ paddingLeft: "35%", paddingRight: "20%", color: "#333", fontFamily: "inherit" }}
                        onFocus={() => setFocusedBlockIdx(idx)}
                        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px" }}
                      />
                      <button onClick={() => deleteBlock(idx)}
                        className="absolute top-0 right-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", fontFamily: "sans-serif" }}
                        title="Delete block (⌥⌫)">×</button>
                    </div>
                  )}

                  {/* ── DIRECTION ── */}
                  {block.type === "direction" && (
                    <div className="relative mb-3">
                      <textarea
                        value={block.text}
                        onChange={e => updateBlock(idx, { text: e.target.value })}
                        placeholder="(camera direction, blocking, beat, pause...)"
                        rows={1}
                        className="w-full resize-none focus:outline-none text-[12px] italic leading-relaxed bg-transparent"
                        style={{ paddingLeft: "20%", paddingRight: "20%", color: "#888", fontFamily: "inherit" }}
                        onFocus={() => setFocusedBlockIdx(idx)}
                        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px" }}
                      />
                      <button onClick={() => deleteBlock(idx)}
                        className="absolute top-0 right-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", fontFamily: "sans-serif" }}
                        title="Delete block (⌥⌫)">×</button>
                    </div>
                  )}

                  {/* Insert block after this one */}
                  <AddBlockMenu onAdd={type => insertBlock(idx, type)} showHints={idx === 0} />
                </div>
              ))}

              {/* Add first block when empty */}
              {blocks.length === 0 && (
                <AddBlockMenu onAdd={type => insertBlock(-1, type)} showHints />
              )}

              {/* ── METADATA ROW ── */}
              <div className="flex items-center gap-3 pt-4 mt-4 flex-wrap"
                style={{ borderTop: "1px solid #E0D8D0", fontFamily: "sans-serif" }}>
                {([
                  { field: "mood" as keyof Scene, label: "Mood", placeholder: "tense", width: "w-20" },
                  { field: "location" as keyof Scene, label: "Loc", placeholder: "Office", width: "w-24" },
                  { field: "timeOfDay" as keyof Scene, label: "Time", placeholder: "Night", width: "w-20" },
                ] as const).map(({ field, label, placeholder, width }) => (
                  <div key={field} className="flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: "#AAA" }}>{label}</span>
                    <input type="text"
                      value={getSceneValue(scene, field)}
                      onChange={e => onUpdateField(scene.id, field, e.target.value)}
                      placeholder={placeholder}
                      className={`text-[11px] focus:outline-none bg-transparent ${width}`}
                      style={{ color: "#555", borderBottom: "1px solid #D0D0D0" }} />
                  </div>
                ))}
                <div className="flex-1" />
                <button onClick={() => onPolish(scene.id)} disabled={isPolishing === scene.id}
                  className="text-[10px] px-2 py-1 rounded" style={{ background: "#EDE9FE", color: "#6D28D9" }}>
                  {isPolishing === scene.id ? "Polishing..." : "AI Polish"}
                </button>
                <button onClick={() => onAddScene(scene.id)} className="text-[10px] px-2 py-1 rounded" style={{ background: "#E8E8E8", color: "#666" }}>
                  + Scene After
                </button>
                <button onClick={() => onDeleteScene(scene.id)} className="text-[10px] px-2 py-1 rounded" style={{ color: "#EF4444" }}>
                  Delete
                </button>
              </div>

              {/* ── PROMPT HINT ── */}
              <PromptHintField
                sceneId={scene.id}
                value={getSceneValue(scene, "promptHint")}
                onChange={v => onUpdateField(scene.id, "promptHint", v)}
                scriptId={scriptId}
              />

              {/* ── SHORTCUT LEGEND ── */}
              <ShortcutLegend />
            </div>
          </div>
        ) : (
          <SegmentTimeline
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={onSelectSegment}
            scriptId={scriptId}
            selectedEpisode={selectedEpisode}
            roles={roles}
            onRefreshScript={onRefreshScript}
          />
        )}
      </div>
    </div>
  )
}
