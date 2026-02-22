"use client"

import { useMemo, useState } from "react"
import { PropItem, PROP_CATEGORIES, getCategoryStyle } from "./props-types"
import { AIConfirmModal } from "@/components/dev/ai-confirm-modal"

interface PropsSidebarProps {
  props: PropItem[]
  selectedPropId: string | null
  saveStatus: "idle" | "saving" | "saved"
  isAIExtracting: boolean
  isGeneratingAllPhotos: boolean
  generateAllPhotosProgress: number
  onSelectProp: (id: string) => void
  onDeleteProp: (id: string) => void
  onAddProp: (name: string, category: string) => void
  onAIExtract: () => void
  onGenerateAllPhotos: () => void
}

export function PropsSidebar({
  props, selectedPropId, saveStatus, isAIExtracting,
  isGeneratingAllPhotos, generateAllPhotosProgress,
  onSelectProp, onDeleteProp, onAddProp, onAIExtract, onGenerateAllPhotos,
}: PropsSidebarProps) {
  const [isAddingProp, setIsAddingProp] = useState(false)
  const [newPropName, setNewPropName] = useState("")
  const [newPropCategory, setNewPropCategory] = useState("other")
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const propsByCategory = useMemo(() => {
    const map: Record<string, PropItem[]> = {}
    for (const p of props) {
      if (!map[p.category]) map[p.category] = []
      map[p.category].push(p)
    }
    return map
  }, [props])

  const filteredProps = useMemo(() =>
    filterCategory ? props.filter(p => p.category === filterCategory) : props,
    [props, filterCategory]
  )

  function handleAdd() {
    const name = newPropName.trim()
    if (!name) return
    onAddProp(name, newPropCategory)
    setNewPropName("")
    setIsAddingProp(false)
  }

  return (
    <>
    <div className="w-64 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #C8C8C8" }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#888" }}>
          Props · {props.length}
          {saveStatus === "saving" && <span style={{ color: "#AAA", fontSize: 9 }}>Saving...</span>}
          {saveStatus === "saved" && <span style={{ color: "#10B981", fontSize: 9 }}>Saved</span>}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isAIExtracting}
            className="text-[9px] px-2 py-0.5 rounded disabled:opacity-50"
            style={{ background: "#E0E4F8", color: "#4F46E5" }}
            title="AI Extract props from script"
          >
            {isAIExtracting ? "..." : "✦ AI"}
          </button>
          <button onClick={() => setIsAddingProp(v => !v)} className="text-[10px]" style={{ color: "#4F46E5" }}>
            + Add
          </button>
        </div>
      </div>

      {/* AI Generate All Photos row */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #C8C8C8", background: "#E6E6E6" }}>
        <button
          onClick={onGenerateAllPhotos}
          disabled={isGeneratingAllPhotos || props.length === 0}
          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded disabled:opacity-50 flex-shrink-0"
          style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
        >
          {isGeneratingAllPhotos
            ? <><div className="w-2 h-2 rounded-full border border-indigo-400 border-t-transparent animate-spin" /> Generating...</>
            : <>✦ AI Generate All</>}
        </button>
        {isGeneratingAllPhotos && (
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#D0D4E8" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${generateAllPhotosProgress}%`, background: "#4F46E5" }}
              />
            </div>
            <span className="text-[9px] flex-shrink-0" style={{ color: "#6B7280" }}>{generateAllPhotosProgress}%</span>
          </div>
        )}
      </div>

      {/* Add prop form */}
      {isAddingProp && (
        <div className="px-3 py-2" style={{ background: "#E4E4E4", borderBottom: "1px solid #C8C8C8" }}>
          <input
            type="text"
            value={newPropName}
            onChange={e => setNewPropName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="Prop name..."
            autoFocus
            className="w-full h-7 px-2 text-[11px] rounded focus:outline-none mb-1.5"
            style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
          />
          <div className="flex gap-1.5">
            <select
              value={newPropCategory}
              onChange={e => setNewPropCategory(e.target.value)}
              className="flex-1 text-[10px] h-6 px-1 rounded focus:outline-none"
              style={{ background: "#E8E8E8", border: "1px solid #C8C8C8", color: "#555" }}
            >
              {PROP_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button
              onClick={handleAdd}
              disabled={!newPropName.trim()}
              className="text-[10px] px-2.5 py-1 rounded disabled:opacity-50"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Category filter */}
      {props.length > 0 && (
        <div className="px-3 py-2" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setFilterCategory(null)}
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: filterCategory === null ? "#4F46E5" : "#E0E0E0", color: filterCategory === null ? "#fff" : "#777" }}
            >
              All
            </button>
            {Object.keys(propsByCategory).map(cat => {
              const cs = getCategoryStyle(cat)
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat === filterCategory ? null : cat)}
                  className="text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{ background: filterCategory === cat ? cs.color : "#E0E0E0", color: filterCategory === cat ? "#fff" : "#777" }}
                >
                  {cs.label.split(" ")[0]} {propsByCategory[cat].length}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Props list */}
      <div className="flex-1 overflow-y-auto dev-scrollbar py-1">
        {props.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-3" style={{ color: "#BBB" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-50">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <p className="text-[11px]">No props yet</p>
            <p className="text-[10px] mt-1" style={{ color: "#DDD" }}>Add manually or use ✦ AI Extract</p>
          </div>
        ) : (
          filteredProps.map(prop => {
            const isSelected = prop.id === selectedPropId
            const cs = getCategoryStyle(prop.category)
            return (
              <div key={prop.id} className="group relative">
                <button
                  onClick={() => onSelectProp(prop.id)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                  style={{
                    background: isSelected ? "#DCE0F5" : "transparent",
                    borderLeft: isSelected ? "2px solid #4F46E5" : "2px solid transparent",
                  }}
                >
                  {prop.photos[0] ? (
                    <img src={prop.photos[0].url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded flex items-center justify-center text-lg flex-shrink-0" style={{ background: "#D8D8D8" }}>
                      {cs.label.split(" ")[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: isSelected ? "#1A1A1A" : "#333" }}>
                      {prop.isKey && <span className="inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0" style={{ background: "#F59E0B", verticalAlign: "middle" }} />}
                      {prop.name}
                    </p>
                    <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: cs.color + "20", color: cs.color }}>
                      {cs.label.replace(/^[^ ]+ /, "")}
                    </span>
                  </div>
                  {prop.photos.length > 0 && (
                    <span className="text-[8px] px-1 rounded flex-shrink-0" style={{ background: "#E8E8E8", color: "#AAA" }}>
                      📷{prop.photos.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => onDeleteProp(prop.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>

    {showConfirm && (
      <AIConfirmModal
        featureKey="extract_props"
        featureLabel="Props AI Extract"
        onConfirm={() => { setShowConfirm(false); onAIExtract() }}
        onCancel={() => setShowConfirm(false)}
      />
    )}
    </>
  )
}
