"use client"

import { useRef } from "react"
import { PropItem, PROP_CATEGORIES, getCategoryStyle } from "./props-types"

interface PropDetailProps {
  selectedProp: PropItem | null
  allProps: PropItem[]
  uploadingFor: string | null
  isAIExtracting: boolean
  onUpdateProp: (id: string, patch: Partial<PropItem>) => void
  onUploadPhoto: (propId: string, file: File) => Promise<void>
  onAIExtract: () => void
}

export function PropDetail({
  selectedProp, allProps, uploadingFor, isAIExtracting,
  onUpdateProp, onUploadPhoto, onAIExtract,
}: PropDetailProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingPropIdRef = useRef<string | null>(null)

  if (!selectedProp) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center" style={{ color: "#CCC" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-30">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.29 7 12 12 20.71 7" />
          <line x1="12" y1="22" x2="12" y2="12" />
        </svg>
        <p className="text-sm">Select or add a prop</p>
        {allProps.length === 0 && (
          <button
            onClick={onAIExtract}
            disabled={isAIExtracting}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded text-sm disabled:opacity-50"
            style={{ background: "#4F46E5", color: "#fff" }}
          >
            {isAIExtracting ? "Extracting..." : "✦ AI Extract from Script"}
          </button>
        )}
      </div>
    )
  }

  function triggerUpload(propId: string) {
    pendingPropIdRef.current = propId
    fileInputRef.current?.click()
  }

  return (
    <div className="flex-1 overflow-y-auto dev-scrollbar">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {selectedProp.photos[0] ? (
            <img src={selectedProp.photos[0].url} alt="" className="w-16 h-16 rounded object-cover" style={{ border: "2px solid #D0D0D0" }} />
          ) : (
            <div className="w-16 h-16 rounded flex items-center justify-center text-3xl" style={{ background: "#E8E8E8" }}>
              {getCategoryStyle(selectedProp.category).label.split(" ")[0]}
            </div>
          )}
          <div className="flex-1">
            <input
              type="text"
              value={selectedProp.name}
              onChange={e => onUpdateProp(selectedProp.id, { name: e.target.value })}
              className="text-base font-semibold bg-transparent focus:outline-none border-b border-transparent focus:border-indigo-300 w-full"
              style={{ color: "#1A1A1A" }}
            />
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: getCategoryStyle(selectedProp.category).color + "20", color: getCategoryStyle(selectedProp.category).color }}
              >
                {getCategoryStyle(selectedProp.category).label}
              </span>
              <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedProp.isKey}
                  onChange={e => onUpdateProp(selectedProp.id, { isKey: e.target.checked })}
                  className="w-3 h-3"
                />
                <span style={{ color: "#AAA" }}>★ Key/Hero Prop</span>
              </label>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Category</label>
              <select
                value={selectedProp.category}
                onChange={e => onUpdateProp(selectedProp.id, { category: e.target.value })}
                className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
              >
                {PROP_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Source</label>
              <select
                value={selectedProp.source || ""}
                onChange={e => onUpdateProp(selectedProp.id, { source: e.target.value })}
                className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
              >
                <option value="">—</option>
                <option value="rent">Rent 租借</option>
                <option value="buy">Buy 购买</option>
                <option value="make">Make/Custom 定制</option>
                <option value="found">Found/On Location 现场取用</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Quantity</label>
              <input
                type="number"
                min="1"
                value={selectedProp.quantity || 1}
                onChange={e => onUpdateProp(selectedProp.id, { quantity: parseInt(e.target.value) || 1 })}
                className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Description</label>
            <textarea
              value={selectedProp.description || ""}
              onChange={e => onUpdateProp(selectedProp.id, { description: e.target.value })}
              rows={2}
              placeholder="Visual description, color, condition, period-accuracy requirements..."
              className="w-full px-2.5 py-2 text-sm rounded focus:outline-none resize-none"
              style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Production Notes</label>
            <textarea
              value={selectedProp.notes || ""}
              onChange={e => onUpdateProp(selectedProp.id, { notes: e.target.value })}
              rows={2}
              placeholder="Supplier, budget, special requirements, continuity notes..."
              className="w-full px-2.5 py-2 text-sm rounded focus:outline-none resize-none"
              style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
            />
          </div>
        </div>

        {/* Reference Photos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>
              Reference Photos ({selectedProp.photos.length})
            </label>
            <button
              onClick={() => triggerUpload(selectedProp.id)}
              disabled={!!uploadingFor}
              className="text-[11px] px-2.5 py-1 rounded disabled:opacity-50"
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              {uploadingFor === selectedProp.id ? "Uploading..." : "↑ Upload"}
            </button>
          </div>

          {selectedProp.photos.length === 0 ? (
            <div
              className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-10 cursor-pointer"
              style={{ borderColor: "#C8C8C8", background: "#F5F5F5" }}
              onClick={() => triggerUpload(selectedProp.id)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#BBB" }} className="mb-2">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <p className="text-[11px]" style={{ color: "#BBB" }}>Upload reference photos</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {selectedProp.photos.map((photo, i) => (
                <div key={i} className="relative group aspect-square rounded overflow-hidden" style={{ background: "#E0E0E0" }}>
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.4)" }}>
                    <button
                      onClick={() => {
                        const newPhotos = selectedProp.photos.filter((_, j) => j !== i)
                        onUpdateProp(selectedProp.id, { photos: newPhotos })
                      }}
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const newPhotos = selectedProp.photos.map((p, j) => j === i ? { ...p, isApproved: !p.isApproved } : p)
                      onUpdateProp(selectedProp.id, { photos: newPhotos })
                    }}
                    className="absolute bottom-1 left-1 text-[8px] px-1 py-0.5 rounded"
                    style={{ background: photo.isApproved ? "#10B981" : "rgba(0,0,0,0.5)", color: "#fff" }}
                  >
                    {photo.isApproved ? "✓" : "·"}
                  </button>
                </div>
              ))}
              <button
                onClick={() => triggerUpload(selectedProp.id)}
                className="aspect-square rounded border-2 border-dashed flex items-center justify-center"
                style={{ borderColor: "#C8C8C8", background: "#F0F0F0" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#BBB" }}>
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0]
          const propId = pendingPropIdRef.current
          if (file && propId) await onUploadPhoto(propId, file)
          e.target.value = ""
        }}
      />
    </div>
  )
}
