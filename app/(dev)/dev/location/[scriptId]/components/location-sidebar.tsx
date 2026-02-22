"use client"

import { useState } from "react"
import { AIConfirmModal } from "@/components/dev/ai-confirm-modal"

interface LocationEntry {
  name: string
  type: string
  address?: string
  contact?: string
  notes?: string
  description?: string
  photos: { url: string; note?: string; isApproved?: boolean }[]
  timeSlots?: { timeOfDay: string; mood?: string; sceneNums?: number[]; setNotes?: string }[]
}

interface SceneRef {
  id: string
  episodeNum: number
  sceneNum: number
  location?: string | null
}

interface LocationSidebarProps {
  allLocs: string[]
  entries: Record<string, LocationEntry>
  scenes: SceneRef[]
  selectedLoc: string | null
  isRefreshing: boolean
  isAIExtracting: boolean
  onSelectLoc: (loc: string) => void
  onRefresh: () => void
  onAIExtract: () => void
  onAddLocation: (name: string) => void
}

export function LocationSidebar({
  allLocs, entries, scenes, selectedLoc,
  isRefreshing, isAIExtracting,
  onSelectLoc, onRefresh, onAIExtract, onAddLocation,
}: LocationSidebarProps) {
  const [addingLoc, setAddingLoc] = useState(false)
  const [newLocName, setNewLocName] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)

  function handleAdd() {
    const name = newLocName.trim()
    if (!name) return
    onAddLocation(name)
    setNewLocName("")
    setAddingLoc(false)
  }

  return (
    <>
    <div className="w-64 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #C8C8C8" }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
          Locations · {allLocs.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-[10px] disabled:opacity-50"
            style={{ color: "#888" }}
            title="Refresh from script"
          >
            {isRefreshing ? "..." : "↻"}
          </button>
          <button onClick={() => setAddingLoc(v => !v)} className="text-[10px]" style={{ color: "#4F46E5" }}>
            + Add
          </button>
        </div>
      </div>

      {/* Add location form */}
      {addingLoc && (
        <div className="px-3 py-2" style={{ background: "#E4E4E4", borderBottom: "1px solid #C8C8C8" }}>
          <input
            type="text"
            value={newLocName}
            onChange={e => setNewLocName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="Location name..."
            className="w-full h-7 px-2 text-[11px] rounded focus:outline-none mb-1.5"
            style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
            autoFocus
          />
          <button onClick={handleAdd} className="text-[10px] px-2.5 py-1 rounded" style={{ background: "#4F46E5", color: "#fff" }}>
            Add
          </button>
        </div>
      )}

      {/* AI Extract button */}
      <div className="px-3 py-2" style={{ borderBottom: "1px solid #C8C8C8" }}>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isAIExtracting || scenes.length === 0}
          className="w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded disabled:opacity-50 transition-colors"
          style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
        >
          {isAIExtracting ? (
            <><div className="w-2.5 h-2.5 rounded-full border border-indigo-400 border-t-transparent animate-spin" /> Extracting...</>
          ) : (
            <>✦ AI Extract from Script</>
          )}
        </button>
      </div>

      {/* Location list */}
      <div className="flex-1 overflow-y-auto dev-scrollbar py-1">
        {allLocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: "#BBB" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-50">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <p className="text-[11px] text-center px-3">No locations yet.<br />Use ✦ AI Extract or add manually.</p>
          </div>
        ) : (
          allLocs.map(loc => {
            const isSelected = loc === selectedLoc
            const e = entries[loc]
            const photoCount = e?.photos?.length ?? 0
            const sceneCount = scenes.filter(s => s.location === loc).length
            const timeSlotCount = e?.timeSlots?.length ?? 0
            return (
              <button
                key={loc}
                onClick={() => onSelectLoc(loc)}
                className="w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors"
                style={{
                  background: isSelected ? "#DCE0F5" : "transparent",
                  borderLeft: isSelected ? "2px solid #4F46E5" : "2px solid transparent",
                }}
              >
                <div
                  className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold"
                  style={{ background: isSelected ? "#4F46E5" : "#D0D0D0", color: isSelected ? "#fff" : "#888" }}
                >
                  {e?.type?.substring(0, 3) || "INT"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" style={{ color: isSelected ? "#1A1A1A" : "#333" }}>{loc}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[9px]" style={{ color: "#AAA" }}>{sceneCount} scene{sceneCount !== 1 ? "s" : ""}</span>
                    {timeSlotCount > 0 && <span className="text-[9px]" style={{ color: "#7C3AED" }}>🕐 {timeSlotCount} slots</span>}
                    {photoCount > 0 && <span className="text-[9px]" style={{ color: "#4F46E5" }}>📷 {photoCount}</span>}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>

    {showConfirm && (
      <AIConfirmModal
        featureKey="extract_locations"
        featureLabel="Location AI Extract"
        onConfirm={() => { setShowConfirm(false); onAIExtract() }}
        onCancel={() => setShowConfirm(false)}
      />
    )}
    </>
  )
}
