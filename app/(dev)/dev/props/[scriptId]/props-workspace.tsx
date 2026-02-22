"use client"

import { useState, useRef, useMemo, useEffect } from "react"

interface SceneRef {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  action?: string | null
}

interface PropPhoto {
  url: string
  note?: string
  isApproved?: boolean
}

interface PropItem {
  id: string
  name: string
  category: string  // "furniture" | "wardrobe" | "vehicle" | "food" | "weapon" | "electronic" | "other"
  description?: string
  sceneIds: string[]  // which scenes this prop appears in
  photos: PropPhoto[]
  isKey: boolean  // key/hero prop
  quantity?: number
  source?: string  // "rent" | "buy" | "make" | "found"
  notes?: string
}

interface Script {
  id: string
  title: string
  scenes: SceneRef[]
}

const PROP_CATEGORIES = [
  { value: "furniture", label: "🪑 Furniture", color: "#D97706" },
  { value: "wardrobe", label: "👔 Wardrobe", color: "#7C3AED" },
  { value: "vehicle", label: "🚗 Vehicle", color: "#2563EB" },
  { value: "food", label: "🍽 Food & Drink", color: "#16A34A" },
  { value: "weapon", label: "🗡 Weapon", color: "#DC2626" },
  { value: "electronic", label: "📱 Electronic", color: "#0891B2" },
  { value: "document", label: "📄 Document/Book", color: "#92400E" },
  { value: "other", label: "📦 Other", color: "#6B7280" },
]

const SOURCE_OPTIONS = [
  { value: "rent", label: "Rent 租借" },
  { value: "buy", label: "Buy 购买" },
  { value: "make", label: "Make/Custom 定制" },
  { value: "found", label: "Found/On Location 现场取用" },
]

function getCategoryStyle(cat: string) {
  return PROP_CATEGORIES.find(c => c.value === cat) || PROP_CATEGORIES[PROP_CATEGORIES.length - 1]
}

export function PropsWorkspace({ script }: { script: Script }) {
  const [props, setProps] = useState<PropItem[]>([])
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null)
  const [isAddingProp, setIsAddingProp] = useState(false)
  const [newPropName, setNewPropName] = useState("")
  const [newPropCategory, setNewPropCategory] = useState("other")
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [isAIExtracting, setIsAIExtracting] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingPropIdRef = useRef<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isLoadedRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  // Load props from API on mount
  useEffect(() => {
    fetch(`/api/scripts/${script.id}/props`)
      .then(r => r.json())
      .then(d => {
        setProps(d.props || [])
        isLoadedRef.current = true
      })
      .catch(() => { isLoadedRef.current = true })
  }, [script.id])

  // Auto-save props when they change
  useEffect(() => {
    if (!isLoadedRef.current) return
    if (props.length === 0) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setSaveStatus("saving")
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/scripts/${script.id}/props`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ props }),
        })
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch { setSaveStatus("idle") }
    }, 800)
  }, [props])

  const selectedProp = props.find(p => p.id === selectedPropId) ?? null

  const filteredProps = useMemo(() =>
    filterCategory ? props.filter(p => p.category === filterCategory) : props,
    [props, filterCategory]
  )

  function addProp() {
    const name = newPropName.trim()
    if (!name) return
    const newProp: PropItem = {
      id: `prop-${Date.now()}`,
      name,
      category: newPropCategory,
      sceneIds: [],
      photos: [],
      isKey: false,
    }
    setProps(prev => [...prev, newProp])
    setSelectedPropId(newProp.id)
    setNewPropName("")
    setIsAddingProp(false)
  }

  function updateProp(id: string, patch: Partial<PropItem>) {
    setProps(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function deleteProp(id: string) {
    if (!confirm("Delete this prop?")) return
    setProps(prev => prev.filter(p => p.id !== id))
    if (selectedPropId === id) setSelectedPropId(null)
  }

  async function extractPropsFromScript() {
    setIsAIExtracting(true)
    try {
      // Build script text from scenes
      const sceneTexts = script.scenes.slice(0, 20).map(s => {
        let content = s.action || ""
        try {
          const blocks = JSON.parse(content)
          if (Array.isArray(blocks)) {
            content = blocks.map((b: { type: string; text?: string; character?: string; line?: string }) =>
              b.type === "action" ? b.text : b.type === "dialogue" ? `${b.character}: ${b.line}` : ""
            ).join("\n")
          }
        } catch { /* use raw */ }
        return `[E${s.episodeNum}S${s.sceneNum}] ${s.heading || ""}\n${content.slice(0, 300)}`
      }).join("\n\n")

      const res = await fetch("/api/ai/extract-props", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, sceneTexts }),
      })

      if (res.ok) {
        const data = await res.json()
        const newProps: PropItem[] = (data.props || []).map((p: { name: string; category?: string; description?: string; isKey?: boolean; scenes?: number[] }) => ({
          id: `prop-${Date.now()}-${Math.random()}`,
          name: p.name,
          category: p.category || "other",
          description: p.description || "",
          sceneIds: [],
          photos: [],
          isKey: p.isKey || false,
          notes: p.scenes?.length ? `Appears in ${p.scenes.length} scene(s)` : "",
        }))
        setProps(prev => [...prev, ...newProps])
        if (newProps.length > 0) setSelectedPropId(newProps[0].id)
      } else {
        alert("AI extraction failed")
      }
    } finally {
      setIsAIExtracting(false)
    }
  }

  async function uploadPhoto(propId: string, file: File) {
    setUploadingFor(propId)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/role-image", { method: "POST", body: fd })
      if (!res.ok) { alert("Upload failed"); return }
      const { url } = await res.json()
      updateProp(propId, {
        photos: [...(props.find(p => p.id === propId)?.photos || []), { url, isApproved: false }]
      })
    } finally {
      setUploadingFor(null)
    }
  }

  const propsByCategory = useMemo(() => {
    const map: Record<string, PropItem[]> = {}
    for (const p of props) {
      if (!map[p.category]) map[p.category] = []
      map[p.category].push(p)
    }
    return map
  }, [props])

  return (
    <div className="h-full flex" style={{ background: "#E8E8E8" }}>
      {/* ── Left: Props list ── */}
      <div className="w-64 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
        {/* Header */}
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#888" }}>
            Props · {props.length}
            {saveStatus === "saving" && <span style={{color:"#AAA",fontSize:9}}>Saving...</span>}
            {saveStatus === "saved" && <span style={{color:"#10B981",fontSize:9}}>Saved</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={extractPropsFromScript}
              disabled={isAIExtracting}
              className="text-[9px] px-2 py-0.5 rounded disabled:opacity-50"
              style={{ background: "#E0E4F8", color: "#4F46E5" }}
              title="AI Extract props from script"
            >
              {isAIExtracting ? "..." : "✦ AI"}
            </button>
            <button onClick={() => setIsAddingProp(v => !v)} className="text-[10px]" style={{ color: "#4F46E5" }}>+ Add</button>
          </div>
        </div>

        {/* Add prop form */}
        {isAddingProp && (
          <div className="px-3 py-2" style={{ background: "#E4E4E4", borderBottom: "1px solid #C8C8C8" }}>
            <input
              type="text" value={newPropName} onChange={e => setNewPropName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addProp()}
              placeholder="Prop name..."
              autoFocus
              className="w-full h-7 px-2 text-[11px] rounded focus:outline-none mb-1.5"
              style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
            />
            <div className="flex gap-1.5">
              <select value={newPropCategory} onChange={e => setNewPropCategory(e.target.value)}
                className="flex-1 text-[10px] h-6 px-1 rounded focus:outline-none"
                style={{ background: "#E8E8E8", border: "1px solid #C8C8C8", color: "#555" }}>
                {PROP_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button onClick={addProp} disabled={!newPropName.trim()}
                className="text-[10px] px-2.5 py-1 rounded disabled:opacity-50"
                style={{ background: "#4F46E5", color: "#fff" }}>
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
                style={{ background: filterCategory === null ? "#4F46E5" : "#E0E0E0", color: filterCategory === null ? "#fff" : "#777" }}>
                All
              </button>
              {Object.keys(propsByCategory).map(cat => {
                const cs = getCategoryStyle(cat)
                return (
                  <button key={cat}
                    onClick={() => setFilterCategory(cat === filterCategory ? null : cat)}
                    className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{ background: filterCategory === cat ? cs.color : "#E0E0E0", color: filterCategory === cat ? "#fff" : "#777" }}>
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
                  <button onClick={() => setSelectedPropId(prop.id)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                    style={{ background: isSelected ? "#DCE0F5" : "transparent", borderLeft: isSelected ? "2px solid #4F46E5" : "2px solid transparent" }}>
                    {prop.photos[0] ? (
                      <img src={prop.photos[0].url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded flex items-center justify-center text-lg flex-shrink-0" style={{ background: "#D8D8D8" }}>
                        {cs.label.split(" ")[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: isSelected ? "#1A1A1A" : "#333" }}>
                        {prop.isKey && <span className="mr-1 text-amber-500">★</span>}
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
                  <button onClick={() => deleteProp(prop.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
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

      {/* ── Right: Prop detail ── */}
      <div className="flex-1 overflow-y-auto dev-scrollbar">
        {!selectedProp ? (
          <div className="h-full flex flex-col items-center justify-center" style={{ color: "#CCC" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-30">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.29 7 12 12 20.71 7" />
              <line x1="12" y1="22" x2="12" y2="12" />
            </svg>
            <p className="text-sm">Select or add a prop</p>
            {props.length === 0 && (
              <button onClick={extractPropsFromScript} disabled={isAIExtracting}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded text-sm disabled:opacity-50"
                style={{ background: "#4F46E5", color: "#fff" }}>
                {isAIExtracting ? "Extracting..." : "✦ AI Extract from Script"}
              </button>
            )}
          </div>
        ) : (
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
                  type="text" value={selectedProp.name}
                  onChange={e => updateProp(selectedProp.id, { name: e.target.value })}
                  className="text-base font-semibold bg-transparent focus:outline-none border-b border-transparent focus:border-indigo-300 w-full"
                  style={{ color: "#1A1A1A" }}
                />
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: getCategoryStyle(selectedProp.category).color + "20", color: getCategoryStyle(selectedProp.category).color }}>
                    {getCategoryStyle(selectedProp.category).label}
                  </span>
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                    <input type="checkbox" checked={selectedProp.isKey}
                      onChange={e => updateProp(selectedProp.id, { isKey: e.target.checked })}
                      className="w-3 h-3" />
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
                  <select value={selectedProp.category}
                    onChange={e => updateProp(selectedProp.id, { category: e.target.value })}
                    className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}>
                    {PROP_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Source</label>
                  <select value={selectedProp.source || ""}
                    onChange={e => updateProp(selectedProp.id, { source: e.target.value })}
                    className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}>
                    <option value="">—</option>
                    {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Quantity</label>
                  <input type="number" min="1" value={selectedProp.quantity || 1}
                    onChange={e => updateProp(selectedProp.id, { quantity: parseInt(e.target.value) || 1 })}
                    className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Description</label>
                <textarea value={selectedProp.description || ""}
                  onChange={e => updateProp(selectedProp.id, { description: e.target.value })}
                  rows={2} placeholder="Visual description, color, condition, period-accuracy requirements..."
                  className="w-full px-2.5 py-2 text-sm rounded focus:outline-none resize-none"
                  style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Production Notes</label>
                <textarea value={selectedProp.notes || ""}
                  onChange={e => updateProp(selectedProp.id, { notes: e.target.value })}
                  rows={2} placeholder="Supplier, budget, special requirements, continuity notes..."
                  className="w-full px-2.5 py-2 text-sm rounded focus:outline-none resize-none"
                  style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
              </div>
            </div>

            {/* Photos */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>
                  Reference Photos ({selectedProp.photos.length})
                </label>
                <button
                  onClick={() => { pendingPropIdRef.current = selectedProp.id; fileInputRef.current?.click() }}
                  disabled={!!uploadingFor}
                  className="text-[11px] px-2.5 py-1 rounded disabled:opacity-50"
                  style={{ background: "#4F46E5", color: "#fff" }}>
                  {uploadingFor === selectedProp.id ? "Uploading..." : "↑ Upload"}
                </button>
              </div>

              {selectedProp.photos.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-10 cursor-pointer"
                  style={{ borderColor: "#C8C8C8", background: "#F5F5F5" }}
                  onClick={() => { pendingPropIdRef.current = selectedProp.id; fileInputRef.current?.click() }}>
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
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.4)" }}>
                        <button
                          onClick={() => {
                            const newPhotos = selectedProp.photos.filter((_, j) => j !== i)
                            updateProp(selectedProp.id, { photos: newPhotos })
                          }}
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                      {/* Approved toggle */}
                      <button
                        onClick={() => {
                          const newPhotos = selectedProp.photos.map((p, j) => j === i ? { ...p, isApproved: !p.isApproved } : p)
                          updateProp(selectedProp.id, { photos: newPhotos })
                        }}
                        className="absolute bottom-1 left-1 text-[8px] px-1 py-0.5 rounded"
                        style={{ background: photo.isApproved ? "#10B981" : "rgba(0,0,0,0.5)", color: "#fff" }}>
                        {photo.isApproved ? "✓" : "·"}
                      </button>
                    </div>
                  ))}
                  <button onClick={() => { pendingPropIdRef.current = selectedProp.id; fileInputRef.current?.click() }}
                    className="aspect-square rounded border-2 border-dashed flex items-center justify-center"
                    style={{ borderColor: "#C8C8C8", background: "#F0F0F0" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#BBB" }}>
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0]
          const propId = pendingPropIdRef.current
          if (file && propId) await uploadPhoto(propId, file)
          e.target.value = ""
        }} />
    </div>
  )
}
