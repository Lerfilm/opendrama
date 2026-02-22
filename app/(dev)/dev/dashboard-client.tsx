"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface ScriptItem {
  id: string
  title: string
  genre: string
  format: string
  logline?: string | null
  synopsis?: string | null
  coverWide?: string | null
  coverTall?: string | null
  targetEpisodes: number
  language: string
  status: string
  updatedAt: Date
  _count: { scenes: number; roles: number; videoSegments: number }
}

interface DevDashboardClientProps {
  scripts: ScriptItem[]
}

const GENRE_OPTIONS = [
  { value: "drama", label: "都市情感 Drama" },
  { value: "romance", label: "爱情 Romance" },
  { value: "thriller", label: "悬疑惊悚 Thriller" },
  { value: "comedy", label: "喜剧 Comedy" },
  { value: "fantasy", label: "奇幻 Fantasy" },
  { value: "scifi", label: "科幻 Sci-Fi" },
  { value: "action", label: "动作 Action" },
  { value: "horror", label: "恐怖 Horror" },
  { value: "historical", label: "古装历史 Historical" },
]

const FORMAT_OPTIONS = [
  { value: "shortdrama", label: "短剧 Short Drama" },
  { value: "movie", label: "电影 Movie" },
  { value: "animation", label: "动画 Animation" },
  { value: "documentary", label: "纪录片 Documentary" },
  { value: "stageplay", label: "舞台剧 Stage Play" },
]

const LANGUAGE_OPTIONS = [
  { value: "zh", label: "中文 Chinese" },
  { value: "en", label: "English" },
  { value: "zh-en", label: "中英双语 Bilingual" },
]

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: "#E0E0E0", color: "#666" },
  generating: { bg: "#FEF3C7", color: "#92400E" },
  ready: { bg: "#D1FAE5", color: "#065F46" },
  published: { bg: "#E0E7FF", color: "#3730A3" },
}

function timeAgo(date: Date): string {
  const d = new Date(date)
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// Extract text from PDF using PDF.js-like approach via FileReader
async function extractTextFromPDF(file: File): Promise<string> {
  // We'll use the browser's built-in approach to read as ArrayBuffer
  // Then send raw bytes to API for server-side text extraction
  // For now, read as base64 and extract text client-side using a simple approach
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      // Try to extract readable text from PDF binary (basic extraction)
      // Strip binary chars and keep readable ASCII/Unicode text
      const cleaned = text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 50000)
      resolve(cleaned)
    }
    reader.readAsText(file, "latin1")
  })
}

export function DevDashboardClient({ scripts: initialScripts }: DevDashboardClientProps) {
  const router = useRouter()
  const [scripts, setScripts] = useState(initialScripts)
  const [showModal, setShowModal] = useState(false)
  const [modalTab, setModalTab] = useState<"manual" | "pdf">("manual")
  const [creating, setCreating] = useState(false)

  // Manual form state
  const [title, setTitle] = useState("")
  const [genre, setGenre] = useState("drama")
  const [format, setFormat] = useState("shortdrama")
  const [language, setLanguage] = useState("zh")
  const [targetEpisodes, setTargetEpisodes] = useState("10")
  const [logline, setLogline] = useState("")
  const [synopsis, setSynopsis] = useState("")

  // PDF import state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfImportProgress, setPdfImportProgress] = useState(0)
  const [pdfImportStep, setPdfImportStep] = useState("")
  const [pdfGenre, setPdfGenre] = useState("drama")
  const [pdfFormat, setPdfFormat] = useState("movie")
  const [pdfLanguage, setPdfLanguage] = useState("en")
  const pdfInputRef = useRef<HTMLInputElement>(null)

  function resetForm() {
    setTitle("")
    setGenre("drama")
    setFormat("shortdrama")
    setLanguage("zh")
    setTargetEpisodes("10")
    setLogline("")
    setSynopsis("")
    setPdfFile(null)
    setPdfImportProgress(0)
    setPdfImportStep("")
    setModalTab("manual")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          genre,
          format,
          language,
          targetEpisodes: parseInt(targetEpisodes) || 10,
          logline: logline.trim() || null,
          synopsis: synopsis.trim() || null,
        }),
      })
      if (!res.ok) { alert("Failed to create project"); return }
      const { script } = await res.json()
      setShowModal(false)
      resetForm()
      router.push(`/dev/script/${script.id}`)
    } finally {
      setCreating(false)
    }
  }

  async function handlePDFImport() {
    if (!pdfFile) return
    setCreating(true)
    setPdfImportProgress(0)
    setPdfImportStep("Reading PDF file...")

    try {
      // Step 1: Extract text from PDF
      setPdfImportProgress(15)
      setPdfImportStep("Extracting text from PDF...")
      const text = await extractTextFromPDF(pdfFile)

      // Step 2: Send to AI
      setPdfImportProgress(30)
      setPdfImportStep("AI is analyzing screenplay structure...")

      // Animate progress while waiting for AI
      const progressInterval = setInterval(() => {
        setPdfImportProgress(prev => {
          if (prev < 80) return prev + 2
          return prev
        })
      }, 800)

      const res = await fetch("/api/ai/import-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          filename: pdfFile.name,
          genre: pdfGenre,
          format: pdfFormat,
          language: pdfLanguage,
        }),
      })

      clearInterval(progressInterval)

      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Import failed")
        return
      }

      setPdfImportProgress(90)
      setPdfImportStep("Creating scenes and characters...")

      const data = await res.json()

      setPdfImportProgress(100)
      setPdfImportStep(`✓ Imported: ${data.scenesCreated} scenes, ${data.rolesCreated} roles`)

      await new Promise(r => setTimeout(r, 800))

      setShowModal(false)
      resetForm()
      router.push(`/dev/script/${data.scriptId}`)
    } catch (err) {
      alert("Import failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 dev-scrollbar" style={{ background: "#F0F0F0" }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>Projects</h1>
            <p className="text-xs mt-0.5" style={{ color: "#888" }}>
              {scripts.length} {scripts.length === 1 ? "project" : "projects"}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded transition-colors"
            style={{ background: "#4F46E5", color: "#fff" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Project
          </button>
        </div>

        {/* Script Grid */}
        {scripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: "#AAA" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-4 opacity-40">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm font-medium mb-1">No projects yet</p>
            <p className="text-xs" style={{ color: "#CCC" }}>Click "New Project" to create your first script</p>
            <button onClick={() => setShowModal(true)}
              className="mt-4 px-4 py-2 text-sm rounded transition-colors"
              style={{ background: "#4F46E5", color: "#fff" }}>
              + New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Create new card */}
            <button
              onClick={() => setShowModal(true)}
              className="group p-4 rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-all duration-200 min-h-[140px]"
              style={{ borderColor: "#C8C8C8", background: "#F5F5F5" }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors" style={{ background: "#E8E8E8" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#888" }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="text-[12px] font-medium" style={{ color: "#888" }}>New Project</span>
            </button>

            {scripts.map((script) => {
              const sc = STATUS_COLORS[script.status] || STATUS_COLORS.draft
              return (
                <Link key={script.id} href={`/dev/script/${script.id}`} className="group block">
                  <div className="p-4 rounded-lg transition-all duration-200 h-full"
                    style={{ background: "#FAFAFA", border: "1px solid #D8D8D8" }}>
                    <div className="flex items-start gap-3 mb-3">
                      {script.coverTall ? (
                        <img src={script.coverTall} alt="" className="w-10 h-14 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-14 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold uppercase" style={{ background: "#E8E8E8", color: "#AAA" }}>
                          {script.format?.substring(0, 2) || "SD"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold truncate group-hover:text-indigo-600 transition-colors" style={{ color: "#1A1A1A" }}>
                          {script.title}
                        </h3>
                        <p className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed" style={{ color: "#888" }}>
                          {script.logline || script.synopsis || "No description"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.color }}>
                        {script.status}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#EEE", color: "#777" }}>{script.genre}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#EEE", color: "#777" }}>{script.targetEpisodes}集</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px]" style={{ color: "#BBB" }}>
                      <div className="flex gap-3">
                        <span>{script._count.scenes} scenes</span>
                        <span>{script._count.roles} roles</span>
                        <span>{script._count.videoSegments} segs</span>
                      </div>
                      <span>{timeAgo(script.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ── New Project Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget && !creating) { setShowModal(false); resetForm() } }}>
          <div className="w-full max-w-xl rounded-xl overflow-hidden shadow-2xl" style={{ background: "#FAFAFA" }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ background: "#F0F0F0", borderBottom: "1px solid #E0E0E0" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>New Project</h2>
              <button onClick={() => { if (!creating) { setShowModal(false); resetForm() } }}
                className="w-6 h-6 rounded flex items-center justify-center" style={{ color: "#888" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex" style={{ borderBottom: "1px solid #E0E0E0", background: "#F8F8F8" }}>
              <button
                onClick={() => setModalTab("manual")}
                className="flex items-center gap-1.5 px-5 py-3 text-[12px] font-medium transition-colors"
                style={{
                  color: modalTab === "manual" ? "#4F46E5" : "#888",
                  borderBottom: modalTab === "manual" ? "2px solid #4F46E5" : "2px solid transparent",
                  background: "transparent",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 5v14M5 12l7-7 7 7" />
                </svg>
                Create Manually
              </button>
              <button
                onClick={() => setModalTab("pdf")}
                className="flex items-center gap-1.5 px-5 py-3 text-[12px] font-medium transition-colors"
                style={{
                  color: modalTab === "pdf" ? "#4F46E5" : "#888",
                  borderBottom: modalTab === "pdf" ? "2px solid #4F46E5" : "2px solid transparent",
                  background: "transparent",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M9 15h6M9 11h6M9 7h3" />
                </svg>
                Import from PDF
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "#E0E4F8", color: "#4F46E5" }}>AI</span>
              </button>
            </div>

            {/* Manual tab */}
            {modalTab === "manual" && (
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>
                    Project Title <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. 霸道总裁的秘密 · The CEO's Secret"
                    required
                    autoFocus
                    className="w-full h-9 px-3 text-sm rounded focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
                  />
                </div>

                {/* Genre + Format row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Genre</label>
                    <select value={genre} onChange={e => setGenre(e.target.value)}
                      className="w-full h-9 px-2 text-sm rounded focus:outline-none"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}>
                      {GENRE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Format</label>
                    <select value={format} onChange={e => setFormat(e.target.value)}
                      className="w-full h-9 px-2 text-sm rounded focus:outline-none"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}>
                      {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Language + Episodes row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Language</label>
                    <select value={language} onChange={e => setLanguage(e.target.value)}
                      className="w-full h-9 px-2 text-sm rounded focus:outline-none"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}>
                      {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Target Episodes</label>
                    <input type="number" min="1" max="100" value={targetEpisodes}
                      onChange={e => setTargetEpisodes(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded focus:outline-none"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
                  </div>
                </div>

                {/* Logline */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Logline</label>
                  <input type="text" value={logline} onChange={e => setLogline(e.target.value)}
                    placeholder="One-line story summary (used by AI)"
                    className="w-full h-9 px-3 text-sm rounded focus:outline-none"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
                </div>

                {/* Synopsis */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Synopsis (optional)</label>
                  <textarea value={synopsis} onChange={e => setSynopsis(e.target.value)}
                    rows={3}
                    placeholder="Brief story outline. The AI will use this to generate the script..."
                    className="w-full px-3 py-2 text-sm rounded focus:outline-none resize-none leading-relaxed"
                    style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2" style={{ borderTop: "1px solid #EEEEEE" }}>
                  <button type="button" onClick={() => { setShowModal(false); resetForm() }}
                    className="px-4 py-2 text-sm rounded" style={{ background: "#E8E8E8", color: "#666" }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={creating || !title.trim()}
                    className="px-5 py-2 text-sm rounded font-medium disabled:opacity-50 transition-colors"
                    style={{ background: "#4F46E5", color: "#fff" }}>
                    {creating ? "Creating..." : "Create Project →"}
                  </button>
                </div>
              </form>
            )}

            {/* PDF import tab */}
            {modalTab === "pdf" && (
              <div className="p-6 space-y-4">
                {/* PDF file drop zone */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#888" }}>
                    Screenplay PDF File <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => pdfInputRef.current?.click()}
                    className="w-full py-6 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors"
                    style={{
                      borderColor: pdfFile ? "#4F46E5" : "#C8C8C8",
                      background: pdfFile ? "#F0F0FF" : "#F8F8F8",
                    }}
                    disabled={creating}
                  >
                    {pdfFile ? (
                      <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#4F46E5" }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-sm font-medium" style={{ color: "#4F46E5" }}>{pdfFile.name}</span>
                        <span className="text-[11px]" style={{ color: "#888" }}>
                          {(pdfFile.size / 1024).toFixed(0)} KB · Click to change
                        </span>
                      </>
                    ) : (
                      <>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#AAA" }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span className="text-sm font-medium" style={{ color: "#888" }}>Click to upload PDF</span>
                        <span className="text-[11px]" style={{ color: "#BBB" }}>Screenplay in PDF format (.pdf)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Format options */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Genre</label>
                    <select value={pdfGenre} onChange={e => setPdfGenre(e.target.value)}
                      className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
                      disabled={creating}>
                      {GENRE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Format</label>
                    <select value={pdfFormat} onChange={e => setPdfFormat(e.target.value)}
                      className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
                      disabled={creating}>
                      {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#888" }}>Language</label>
                    <select value={pdfLanguage} onChange={e => setPdfLanguage(e.target.value)}
                      className="w-full h-8 px-2 text-[11px] rounded focus:outline-none"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
                      disabled={creating}>
                      {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                    </select>
                  </div>
                </div>

                {/* Info note */}
                <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "#EEF0F8" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#4F46E5", flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <p className="text-[11px] leading-relaxed" style={{ color: "#4F46E5" }}>
                    AI will automatically parse the screenplay structure, detect scenes, dialogue, characters, and create the full script. This may take 30–60 seconds.
                  </p>
                </div>

                {/* Progress bar */}
                {creating && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: "#4F46E5" }}>{pdfImportStep}</span>
                      <span className="text-[11px] font-medium" style={{ color: "#4F46E5" }}>{pdfImportProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E0E4F8" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pdfImportProgress}%`, background: "linear-gradient(90deg, #4F46E5, #7C3AED)" }}
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2" style={{ borderTop: "1px solid #EEEEEE" }}>
                  <button type="button" onClick={() => { if (!creating) { setShowModal(false); resetForm() } }}
                    disabled={creating}
                    className="px-4 py-2 text-sm rounded disabled:opacity-50" style={{ background: "#E8E8E8", color: "#666" }}>
                    Cancel
                  </button>
                  <button
                    onClick={handlePDFImport}
                    disabled={creating || !pdfFile}
                    className="flex items-center gap-2 px-5 py-2 text-sm rounded font-medium disabled:opacity-50 transition-colors"
                    style={{ background: "#4F46E5", color: "#fff" }}>
                    {creating ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Importing...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M12 2a10 10 0 1 0 10 10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        AI Import →
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
