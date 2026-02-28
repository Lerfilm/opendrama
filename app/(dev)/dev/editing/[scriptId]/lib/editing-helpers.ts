// Shared helpers for the Editing module

export interface VideoSegment {
  id: string
  episodeNum: number
  segmentIndex: number
  sceneNum: number
  durationSec: number
  prompt: string
  shotType?: string | null
  cameraMove?: string | null
  beatType?: string | null
  model?: string | null
  resolution?: string | null
  status: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  tokenCost?: number | null
  referenceImages?: string[]
}

export interface Scene {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  mood?: string | null
}

export interface ScriptRole {
  id: string
  name: string
  role: string
  avatarUrl?: string | null
  referenceImages?: string[]
  description?: string | null
}

export interface ScriptLocation {
  id: string
  name: string
  type: string
  photoUrl?: string | null
  description?: string | null
  sceneKeys: string[]
}

export interface ScriptProp {
  id: string
  name: string
  category: string
  photoUrl?: string | null
  description?: string | null
  isKey: boolean
  sceneKeys: string[]
}

export interface Script {
  id: string
  title: string
  targetEpisodes: number
  scenes: Scene[]
  videoSegments: VideoSegment[]
  roles?: ScriptRole[]
  locations?: ScriptLocation[]
  props?: ScriptProp[]
}

export const STATUS_MAP: Record<string, { bg: string; color: string; label: string; icon: string; dot: string }> = {
  pending:    { bg: "#F3F4F6", color: "#6B7280", label: "Pending",    icon: "○", dot: "#9CA3AF" },
  reserved:   { bg: "#FEF3C7", color: "#92400E", label: "Reserved",   icon: "◎", dot: "#D97706" },
  submitted:  { bg: "#DBEAFE", color: "#1D4ED8", label: "Submitted",  icon: "◌", dot: "#3B82F6" },
  generating: { bg: "#EDE9FE", color: "#6D28D9", label: "Generating", icon: "◉", dot: "#8B5CF6" },
  done:       { bg: "#D1FAE5", color: "#065F46", label: "Done",       icon: "✓", dot: "#10B981" },
  failed:     { bg: "#FEE2E2", color: "#991B1B", label: "Failed",     icon: "✕", dot: "#EF4444" },
}

export function getTitleAbbrev(title: string): string {
  const words = title.trim().split(/\s+/)
  if (words.length === 1) return words[0].replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "").slice(0, 4).toUpperCase()
  return words.map(w => w[0] || "").join("").toUpperCase().slice(0, 6)
}

export function getFilename(abbrev: string, epNum: number, sceneNum: number, segIdx: number): string {
  return `${abbrev}-S${String(epNum).padStart(2, "0")}-SC${String(sceneNum).padStart(3, "0")}-SEG${String(segIdx + 1).padStart(3, "0")}.mp4`
}

export function formatEDLTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const f = Math.floor((sec % 1) * 30)
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}:${String(f).padStart(2,"0")}`
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function buildEDL(
  title: string,
  epNum: number,
  abbrev: string,
  segs: VideoSegment[],
  orderedIds?: string[],
  trimData?: Record<string, { trimIn: number; trimOut: number }>
): string {
  let ordered = segs.filter(s => s.status === "done")
  if (orderedIds && orderedIds.length > 0) {
    const idSet = new Set(ordered.map(s => s.id))
    ordered = orderedIds.filter(id => idSet.has(id)).map(id => ordered.find(s => s.id === id)!)
  } else {
    ordered.sort((a, b) => a.segmentIndex - b.segmentIndex)
  }

  const lines = [
    `TITLE: ${title} - Episode ${epNum}`,
    `FCM: NON-DROP FRAME`,
    ``,
  ]
  let editNum = 1
  let timelinePos = 0
  for (const seg of ordered) {
    const fn = getFilename(abbrev, epNum, seg.sceneNum, seg.segmentIndex).replace(".mp4", "")
    const trim = trimData?.[seg.id]
    const srcIn = trim?.trimIn ?? 0
    const srcOut = seg.durationSec - (trim?.trimOut ?? 0)
    const effectiveDur = srcOut - srcIn
    lines.push(
      `${String(editNum).padStart(3, "0")}  ${fn}  V  C  ${formatEDLTime(srcIn)} ${formatEDLTime(srcOut)} ${formatEDLTime(timelinePos)} ${formatEDLTime(timelinePos + effectiveDur)}`,
      `* FROM CLIP NAME: ${fn}.mp4`,
      `* SCENE ${String(seg.sceneNum).padStart(3, "0")} | ${effectiveDur.toFixed(1)}s | ${seg.shotType || "auto"}`,
      ``
    )
    editNum++
    timelinePos += effectiveDur
  }
  return lines.join("\n")
}

export function buildCSV(
  title: string,
  epNum: number,
  abbrev: string,
  segs: VideoSegment[],
  orderedIds?: string[],
  trimData?: Record<string, { trimIn: number; trimOut: number }>
): string {
  let ordered = [...segs]
  if (orderedIds && orderedIds.length > 0) {
    const idMap = new Map(segs.map(s => [s.id, s]))
    ordered = orderedIds.map(id => idMap.get(id)).filter((s): s is VideoSegment => !!s)
  } else {
    ordered.sort((a, b) => a.segmentIndex - b.segmentIndex)
  }

  const header = "Filename,Scene,Segment,Duration(s),TrimIn(s),TrimOut(s),EffectiveDur(s),ShotType,Camera,Status,VideoURL,Prompt"
  const rows = ordered.map(s => {
    const fn = getFilename(abbrev, epNum, s.sceneNum, s.segmentIndex)
    const trim = trimData?.[s.id]
    const trimIn = trim?.trimIn ?? 0
    const trimOut = trim?.trimOut ?? 0
    const effective = s.durationSec - trimIn - trimOut
    return [fn, s.sceneNum, s.segmentIndex + 1, s.durationSec,
      trimIn.toFixed(1), trimOut.toFixed(1), effective.toFixed(1),
      s.shotType || "", s.cameraMove || "", s.status, s.videoUrl || "",
      `"${s.prompt.replace(/"/g, "'").slice(0, 120)}"`
    ].join(",")
  })
  return [header, ...rows].join("\n")
}
