"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"

interface SearchAssets {
  scripts: { id: string; title: string; coverImage: string | null }[]
  roles: { id: string; name: string; role: string; avatarUrl: string | null; scriptId: string; scriptTitle: string }[]
  locations: { name: string; photoUrl: string | null; scriptId: string; scriptTitle: string }[]
  props: { id: string; name: string; category: string; photoUrl: string | null; scriptId: string; scriptTitle: string }[]
}

interface SearchItem {
  type: "page" | "character" | "location" | "prop" | "project"
  label: string
  sub?: string
  icon?: React.ReactNode
  img?: string | null
  url: string
}

// Static pages with icons
const PAGE_ICON = {
  script: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  casting: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  location: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  props: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  theater: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  editing: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m9 8 6 4-6 4Z" />
    </svg>
  ),
  media: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  ),
  finishing: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
}

function buildPageItems(scriptId: string | null): SearchItem[] {
  if (!scriptId) return []
  return [
    { type: "page", label: "Script", sub: "Script editor & breakdown", icon: PAGE_ICON.script, url: `/dev/script/${scriptId}` },
    { type: "page", label: "Casting", sub: "Character casting management", icon: PAGE_ICON.casting, url: `/dev/casting/${scriptId}` },
    { type: "page", label: "Location", sub: "Location scouting", icon: PAGE_ICON.location, url: `/dev/location/${scriptId}` },
    { type: "page", label: "Props", sub: "Props library", icon: PAGE_ICON.props, url: `/dev/props/${scriptId}` },
    { type: "page", label: "Theater", sub: "Video generation", icon: PAGE_ICON.theater, url: `/dev/theater/${scriptId}` },
    { type: "page", label: "Editing", sub: "Video editing & export", icon: PAGE_ICON.editing, url: `/dev/editing/${scriptId}` },
    { type: "page", label: "Media", sub: "Asset library", icon: PAGE_ICON.media, url: `/dev/media/${scriptId}` },
    { type: "page", label: "Finishing", sub: "Publishing & delivery", icon: PAGE_ICON.finishing, url: `/dev/finishing/${scriptId}` },
  ]
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState("")
  const [assets, setAssets] = useState<SearchAssets | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Extract current scriptId from URL
  const scriptIdMatch = pathname.match(/\/dev\/(?:script|casting|location|props|theater|editing|finishing|media)\/([^/]+)/)
  const currentScriptId = scriptIdMatch?.[1] ?? null

  // Fetch assets when opened
  useEffect(() => {
    if (!open) return
    setQuery("")
    setActiveIdx(0)
    fetch("/api/search/assets")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAssets(d) })
      .catch(() => {})
    // Focus input
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Build search items
  const items = useCallback((): SearchItem[] => {
    const q = query.toLowerCase().trim()
    const results: SearchItem[] = []

    // Pages — use current scriptId, or first available script
    const sid = currentScriptId ?? assets?.scripts?.[0]?.id ?? null
    const pages = buildPageItems(sid)

    // Projects
    const projects: SearchItem[] = (assets?.scripts ?? []).map(s => ({
      type: "project" as const,
      label: s.title,
      sub: "Project",
      img: s.coverImage,
      url: `/dev/script/${s.id}`,
    }))

    // Characters
    const characters: SearchItem[] = (assets?.roles ?? []).map(r => ({
      type: "character" as const,
      label: r.name,
      sub: r.scriptTitle,
      img: r.avatarUrl,
      url: `/dev/casting/${r.scriptId}`,
    }))

    // Locations
    const locations: SearchItem[] = (assets?.locations ?? []).map(l => ({
      type: "location" as const,
      label: l.name,
      sub: l.scriptTitle,
      img: l.photoUrl,
      url: `/dev/location/${l.scriptId}`,
    }))

    // Props
    const props: SearchItem[] = (assets?.props ?? []).map(p => ({
      type: "prop" as const,
      label: p.name,
      sub: `${p.category} · ${p.scriptTitle}`,
      img: p.photoUrl,
      url: `/dev/props/${p.scriptId}`,
    }))

    if (!q) {
      // Empty query: show pages first, then recent assets
      results.push(...pages)
      results.push(...projects.slice(0, 3))
      results.push(...characters.slice(0, 6))
      results.push(...locations.slice(0, 4))
      return results
    }

    // Filter by query
    const match = (item: SearchItem) =>
      item.label.toLowerCase().includes(q) ||
      (item.sub?.toLowerCase().includes(q) ?? false)

    results.push(...pages.filter(match))
    results.push(...projects.filter(match))
    results.push(...characters.filter(match))
    results.push(...locations.filter(match))
    results.push(...props.filter(match))

    return results
  }, [query, assets, currentScriptId])

  const filteredItems = items()

  // Clamp activeIdx
  useEffect(() => {
    setActiveIdx(i => Math.min(i, Math.max(filteredItems.length - 1, 0)))
  }, [filteredItems.length])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIdx])

  // Keyboard handling
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filteredItems.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === "Enter") {
        e.preventDefault()
        const item = filteredItems[activeIdx]
        if (item) { router.push(item.url); onClose() }
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, filteredItems, activeIdx, router, onClose])

  if (!open) return null

  // Group items by type for section headers
  const grouped: { type: string; label: string; items: (SearchItem & { globalIdx: number })[] }[] = []
  let idx = 0
  const typeLabels: Record<string, string> = {
    page: "Pages",
    project: "Projects",
    character: "Characters",
    location: "Locations",
    prop: "Props",
  }
  for (const item of filteredItems) {
    const group = grouped.find(g => g.type === item.type)
    if (group) {
      group.items.push({ ...item, globalIdx: idx })
    } else {
      grouped.push({ type: item.type, label: typeLabels[item.type] || item.type, items: [{ ...item, globalIdx: idx }] })
    }
    idx++
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-[480px] max-h-[60vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{ background: "#1E1E22", border: "1px solid #3A3A3E" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid #2E2E32" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Search pages, characters, locations, props..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: "#E0E0E0" }}
          />
          <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#2A2A2E", color: "#666", border: "1px solid #3A3A3E" }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1" style={{ maxHeight: "calc(60vh - 52px)" }}>
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px]" style={{ color: "#666" }}>No results found</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.type}>
                {/* Section header */}
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>
                    {group.label}
                  </span>
                </div>
                {/* Items */}
                {group.items.map(item => (
                  <button
                    key={`${item.type}-${item.label}-${item.globalIdx}`}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                    style={{
                      background: item.globalIdx === activeIdx ? "rgba(99,102,241,0.15)" : "transparent",
                    }}
                    onMouseEnter={() => setActiveIdx(item.globalIdx)}
                    onClick={() => { router.push(item.url); onClose() }}
                  >
                    {/* Icon or image */}
                    {item.img ? (
                      <img src={item.img} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" style={{ border: "1px solid #3A3A3E" }} />
                    ) : item.icon ? (
                      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: "#2A2A30", color: "#888" }}>
                        {item.icon}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: "#2A2A30", color: "#666" }}>
                        {item.label[0]?.toUpperCase()}
                      </div>
                    )}
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: "#E0E0E0" }}>{item.label}</p>
                      {item.sub && (
                        <p className="text-[10px] truncate" style={{ color: "#666" }}>{item.sub}</p>
                      )}
                    </div>
                    {/* Type badge */}
                    <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{
                      background: item.type === "page" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.05)",
                      color: item.type === "page" ? "#818CF8" : "#555",
                    }}>
                      {item.type === "page" ? "Page" : item.type === "character" ? "Cast" : item.type === "location" ? "Loc" : item.type === "prop" ? "Prop" : ""}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2" style={{ borderTop: "1px solid #2E2E32" }}>
          <div className="flex items-center gap-1">
            <kbd className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: "#2A2A2E", color: "#555", border: "1px solid #333" }}>↑↓</kbd>
            <span className="text-[9px]" style={{ color: "#555" }}>Navigate</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: "#2A2A2E", color: "#555", border: "1px solid #333" }}>↵</kbd>
            <span className="text-[9px]" style={{ color: "#555" }}>Open</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: "#2A2A2E", color: "#555", border: "1px solid #333" }}>esc</kbd>
            <span className="text-[9px]" style={{ color: "#555" }}>Close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
