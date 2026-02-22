"use client"

import { useState, useRef } from "react"
import { AIConfirmModal } from "@/components/dev/ai-confirm-modal"

interface CostumePhoto {
  scene: string       // e.g. "INT. OFFICE - DAY"
  url: string
  note?: string
}

interface Role {
  id: string
  name: string
  role: string
  description?: string | null
  voiceType?: string | null
  avatarUrl?: string | null
  referenceImages: string[]
  // Extended fields stored in metadata JSON
  age?: string
  gender?: string
  ethnicity?: string
  nationality?: string
  physique?: string
  costumes?: CostumePhoto[]
}

interface Script {
  id: string
  title: string
  genre: string
  roles: Role[]
  scenes?: Array<{ heading?: string | null; location?: string | null }>
}

interface CastingWorkspaceProps {
  script: Script
}

const ROLE_TYPES = ["protagonist", "antagonist", "supporting", "minor"]
const ROLE_TYPE_LABELS: Record<string, string> = {
  lead: "主角",        // alias from PDF import AI
  protagonist: "主角",
  antagonist: "反派",
  supporting: "配角",
  minor: "路人",
}
const ROLE_TYPE_STYLES: Record<string, { background: string; color: string }> = {
  lead: { background: "#DBEAFE", color: "#1D4ED8" },
  protagonist: { background: "#DBEAFE", color: "#1D4ED8" },
  antagonist: { background: "#FEE2E2", color: "#991B1B" },
  supporting: { background: "#D1FAE5", color: "#065F46" },
  minor: { background: "#F3F4F6", color: "#6B7280" },
}

// Role importance order for sorting (lead/protagonist first)
const ROLE_IMPORTANCE: Record<string, number> = {
  lead: 0,
  protagonist: 0,
  antagonist: 1,
  supporting: 2,
  minor: 3,
}

// Avatar background based on gender + role type
function getAvatarStyle(role: Role): { background: string; color: string } {
  const r = role.role || "minor"
  const g = (role.gender || "").toLowerCase()
  const isSupporting = r === "supporting"
  const isMinor = r === "minor"
  const isMale = g === "male" || g === "男" || g === "男性"
  const isFemale = g === "female" || g === "女" || g === "女性"
  const isLead = r === "lead" || r === "protagonist"
  if (isMinor) return { background: "#E5E7EB", color: "#6B7280" }
  if (isSupporting) return { background: "#D1FAE5", color: "#065F46" }
  if (isMale && isLead) return { background: "#1D4ED8", color: "#fff" }
  if (isMale) return { background: "#BFDBFE", color: "#1D4ED8" }
  if (isFemale && isLead) return { background: "#DC2626", color: "#fff" }
  if (isFemale) return { background: "#FEE2E2", color: "#991B1B" }
  return { background: "#D0D0D0", color: "#888" }
}

// Voice emotion presets for audition
const VOICE_EMOTIONS = [
  { id: "neutral", label: "Neutral 正常", color: "#6B7280" },
  { id: "excited", label: "Excited 兴奋", color: "#F59E0B" },
  { id: "sad", label: "Sad 悲伤", color: "#3B82F6" },
  { id: "angry", label: "Angry 愤怒", color: "#EF4444" },
  { id: "tender", label: "Tender 温柔", color: "#EC4899" },
  { id: "scared", label: "Scared 恐惧", color: "#8B5CF6" },
  { id: "confident", label: "Confident 自信", color: "#10B981" },
  { id: "sarcastic", label: "Sarcastic 讽刺", color: "#F97316" },
  { id: "crying", label: "Crying 哭泣", color: "#60A5FA" },
  { id: "whispering", label: "Whispering 耳语", color: "#9CA3AF" },
  { id: "shouting", label: "Shouting 怒吼", color: "#DC2626" },
  { id: "laughing", label: "Laughing 欢笑", color: "#FBBF24" },
]

// Sample audition lines (can be customized per role)
const DEFAULT_AUDITION_LINES = [
  "我不会让你就这么走的。",
  "你以为你是谁？",
  "对不起，我只是……我不知道该说什么。",
  "这一切都结束了，你听到了吗？结束了！",
  "我爱你，从第一天起我就爱你。",
]

const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Any"]
const ETHNICITY_OPTIONS = ["Asian", "East Asian", "South Asian", "Southeast Asian", "Caucasian", "Black/African", "Latino/Hispanic", "Middle Eastern", "Mixed", "Other"]
const PHYSIQUE_OPTIONS = ["Slim", "Athletic", "Average", "Curvy", "Muscular", "Heavy-set"]

// Active tab type for right panel
type RightTab = "profile" | "costumes" | "audition"

// Parse metadata JSON from description (we piggyback extra fields as JSON at the end)
function parseRoleMeta(role: Role): { age: string; gender: string; ethnicity: string; nationality: string; physique: string; costumes: CostumePhoto[] } {
  return {
    age: role.age || "",
    gender: role.gender || "",
    ethnicity: role.ethnicity || "",
    nationality: role.nationality || "",
    physique: role.physique || "",
    costumes: role.costumes || [],
  }
}

export function CastingWorkspace({ script }: CastingWorkspaceProps) {
  // Hydrate roles with parsed metadata, sorted by importance
  const [roles, setRoles] = useState<Role[]>(script.roles.map(r => {
    // Try to parse extra fields from voiceType field (a spare column we use for JSON metadata)
    let meta: Partial<Role> = {}
    try { if (r.voiceType?.startsWith("{")) meta = JSON.parse(r.voiceType) } catch { /* ok */ }
    return { ...r, ...meta }
  }).sort((a, b) => (ROLE_IMPORTANCE[a.role] ?? 99) - (ROLE_IMPORTANCE[b.role] ?? 99)))
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(roles[0]?.id ?? null)
  const [rightTab, setRightTab] = useState<RightTab>("profile")
  const [saving, setSaving] = useState<string | null>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [generationPrompt, setGenerationPrompt] = useState<string>("")
  const [isCreating, setIsCreating] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleType, setNewRoleType] = useState("supporting")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Costume upload state
  const [costumeScene, setCostumeScene] = useState("")
  const [costumeNote, setCostumeNote] = useState("")
  const [uploadingCostume, setUploadingCostume] = useState(false)
  // Audition state
  const [selectedEmotion, setSelectedEmotion] = useState("neutral")
  const [auditionLine, setAuditionLine] = useState(DEFAULT_AUDITION_LINES[0])
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [showGenerateConfirm, setShowGenerateConfirm] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const costumeFileInputRef = useRef<HTMLInputElement>(null)
  const pendingRoleIdRef = useRef<string | null>(null)

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null

  function updateLocal(id: string, patch: Partial<Role>) {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  // Serialize extended fields back into voiceType JSON for storage
  async function saveRole(id: string) {
    const role = roles.find(r => r.id === id)
    if (!role) return
    setSaving(id)
    try {
      const metaJson = JSON.stringify({
        age: role.age || "",
        gender: role.gender || "",
        ethnicity: role.ethnicity || "",
        nationality: role.nationality || "",
        physique: role.physique || "",
        costumes: role.costumes || [],
      })
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: role.name, description: role.description, role: role.role, voiceType: metaJson }),
      })
    } finally {
      setSaving(null)
    }
  }

  async function saveCostumes(id: string, costumes: CostumePhoto[]) {
    const role = roles.find(r => r.id === id)
    if (!role) return
    const metaJson = JSON.stringify({
      age: role.age || "",
      gender: role.gender || "",
      ethnicity: role.ethnicity || "",
      nationality: role.nationality || "",
      physique: role.physique || "",
      costumes,
    })
    await fetch("/api/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, voiceType: metaJson }),
    })
  }

  async function createRole() {
    if (!newRoleName.trim()) return
    setIsCreating(true)
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, name: newRoleName.trim(), role: newRoleType }),
      })
      if (!res.ok) { alert("Failed to create role"); return }
      const { role } = await res.json()
      setRoles(prev => [...prev, { ...role, referenceImages: role.referenceImages || [], costumes: [] }].sort((a, b) => (ROLE_IMPORTANCE[a.role] ?? 99) - (ROLE_IMPORTANCE[b.role] ?? 99)))
      setSelectedRoleId(role.id)
      setNewRoleName("")
    } finally {
      setIsCreating(false)
    }
  }

  async function deleteRole(id: string) {
    if (!confirm("Delete this character?")) return
    setDeletingId(id)
    try {
      await fetch("/api/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const remaining = roles.filter(r => r.id !== id)
      setRoles(remaining)
      if (selectedRoleId === id) setSelectedRoleId(remaining[0]?.id ?? null)
    } finally {
      setDeletingId(null)
    }
  }

  async function uploadImage(roleId: string, file: File) {
    setUploadingFor(roleId)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/role-image", { method: "POST", body: fd })
      if (!res.ok) { alert("Upload failed"); return }
      const { url } = await res.json()
      const role = roles.find(r => r.id === roleId)
      if (!role) return
      const newImages = [...(role.referenceImages || []), url]
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: roleId, referenceImages: newImages }),
      })
      updateLocal(roleId, { referenceImages: newImages })
    } finally {
      setUploadingFor(null)
    }
  }

  async function uploadCostumePhoto(roleId: string, file: File) {
    setUploadingCostume(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/role-image", { method: "POST", body: fd })
      if (!res.ok) { alert("Upload failed"); return }
      const { url } = await res.json()
      const role = roles.find(r => r.id === roleId)
      if (!role) return
      const newCostume: CostumePhoto = {
        scene: costumeScene || "General",
        url,
        note: costumeNote || undefined,
      }
      const newCostumes = [...(role.costumes || []), newCostume]
      updateLocal(roleId, { costumes: newCostumes })
      await saveCostumes(roleId, newCostumes)
      setCostumeScene("")
      setCostumeNote("")
    } finally {
      setUploadingCostume(false)
    }
  }

  async function removeCostumePhoto(roleId: string, idx: number) {
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    const newCostumes = (role.costumes || []).filter((_, i) => i !== idx)
    updateLocal(roleId, { costumes: newCostumes })
    await saveCostumes(roleId, newCostumes)
  }

  async function generateCharacterImage(roleId: string) {
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    setGeneratingFor(roleId)
    setGenerationPrompt("")
    try {
      const res = await fetch("/api/ai/generate-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: role.name,
          description: role.description,
          role: role.role,
          genre: script.genre,
          age: role.age,
          gender: role.gender,
          ethnicity: role.ethnicity,
          physique: role.physique,
        }),
      })
      if (!res.ok) { const err = await res.json(); alert(`AI generation failed: ${err.error}`); return }
      const { imageUrl, prompt } = await res.json()
      setGenerationPrompt(prompt)
      const newImages = [...(role.referenceImages || []), imageUrl]
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: roleId, referenceImages: newImages }),
      })
      updateLocal(roleId, { referenceImages: newImages })
    } finally {
      setGeneratingFor(null)
    }
  }

  async function removeImage(roleId: string, imgUrl: string) {
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    const newImages = role.referenceImages.filter(i => i !== imgUrl)
    await fetch("/api/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: roleId, referenceImages: newImages }),
    })
    updateLocal(roleId, { referenceImages: newImages })
  }

  return (
    <div className="h-full flex" style={{ background: "#E8E8E8" }}>
      {/* ── Left: Role List ── */}
      <div className="w-64 flex flex-col flex-shrink-0" style={{ background: "#EBEBEB", borderRight: "1px solid #C0C0C0" }}>
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Cast · {roles.length}
          </span>
        </div>

        {/* Create new role */}
        <div className="px-3 py-2.5" style={{ background: "#E4E4E4", borderBottom: "1px solid #C8C8C8" }}>
          <input
            type="text"
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createRole()}
            placeholder="New character name..."
            className="w-full h-7 px-2 text-[11px] rounded focus:outline-none mb-1.5"
            style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
          />
          <div className="flex items-center gap-1.5">
            <select value={newRoleType} onChange={e => setNewRoleType(e.target.value)}
              className="flex-1 text-[10px] h-6 px-1 rounded focus:outline-none"
              style={{ background: "#E8E8E8", border: "1px solid #C8C8C8", color: "#555" }}>
              {ROLE_TYPES.map(t => <option key={t} value={t}>{ROLE_TYPE_LABELS[t]}</option>)}
            </select>
            <button onClick={createRole} disabled={isCreating || !newRoleName.trim()}
              className="text-[10px] px-2.5 py-1 rounded disabled:opacity-50 transition-colors"
              style={{ background: "#4F46E5", color: "#fff" }}>
              {isCreating ? "..." : "+ Add"}
            </button>
          </div>
        </div>

        {/* Role list */}
        <div className="flex-1 overflow-y-auto dev-scrollbar py-1">
          {roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: "#BBB" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-50">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              <p className="text-[11px]">No characters yet</p>
            </div>
          ) : (
            roles.map(role => {
              const isSelected = role.id === selectedRoleId
              const typeStyle = ROLE_TYPE_STYLES[role.role] || ROLE_TYPE_STYLES.minor
              return (
                <div key={role.id} className="group relative">
                  <button onClick={() => setSelectedRoleId(role.id)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                    style={{ background: isSelected ? "#DCE0F5" : "transparent", borderLeft: isSelected ? "2px solid #4F46E5" : "2px solid transparent" }}>
                    {role.referenceImages?.[0] ? (
                      <img src={role.referenceImages[0]} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={getAvatarStyle(role)}>
                        {role.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: isSelected ? "#1A1A1A" : "#333" }}>{role.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] px-1 py-0.5 rounded" style={typeStyle}>{ROLE_TYPE_LABELS[role.role] || role.role}</span>
                        {role.gender && <span className="text-[9px]" style={{ color: "#999" }}>{role.gender}</span>}
                        {role.age && <span className="text-[9px]" style={{ color: "#999" }}>{role.age}</span>}
                      </div>
                    </div>
                    {(role.costumes?.length ?? 0) > 0 && (
                      <span className="text-[8px] px-1 rounded flex-shrink-0" style={{ background: "#FCE7F3", color: "#9D174D" }} title="Costume photos">
                        👗{role.costumes!.length}
                      </span>
                    )}
                  </button>
                  <button onClick={() => deleteRole(role.id)} disabled={deletingId === role.id}
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

      {/* ── Right: Role Detail ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedRole ? (
          <div className="h-full flex flex-col items-center justify-center" style={{ color: "#CCC" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-30">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <p className="text-sm">Select or create a character</p>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex-shrink-0 flex items-center px-6 pt-4 gap-0" style={{ borderBottom: "1px solid #D0D0D0" }}>
              {([
                { id: "profile" as RightTab, label: "Character Profile" },
                { id: "costumes" as RightTab, label: "Costumes & 定妆照" },
                { id: "audition" as RightTab, label: "🎙 Voice Audition" },
              ]).map(tab => (
                <button key={tab.id} onClick={() => setRightTab(tab.id)}
                  className="px-3 py-2 text-[11px] font-medium relative transition-colors"
                  style={{ color: rightTab === tab.id ? "#1A1A1A" : "#999" }}>
                  {tab.label}
                  {rightTab === tab.id && (
                    <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-t" style={{ background: "#4F46E5" }} />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto dev-scrollbar">
              {rightTab === "profile" ? (
                /* ── PROFILE TAB ── */
                <div className="max-w-2xl mx-auto p-6">
                  {/* Hero */}
                  <div className="flex items-center gap-4 mb-6">
                    {selectedRole.referenceImages?.[0] ? (
                      <img src={selectedRole.referenceImages[0]} alt="" className="w-20 h-20 rounded-full object-cover" style={{ border: "2px solid #D0D0D0" }} />
                    ) : (
                      <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: "#D0D0D0", color: "#888" }}>
                        {selectedRole.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>{selectedRole.name}</h2>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={ROLE_TYPE_STYLES[selectedRole.role] || ROLE_TYPE_STYLES.minor}>
                        {ROLE_TYPE_LABELS[selectedRole.role] || selectedRole.role}
                      </span>
                      {saving === selectedRole.id && <span className="ml-2 text-[10px]" style={{ color: "#AAA" }}>Saving...</span>}
                    </div>
                  </div>

                  {/* Basic fields */}
                  <div className="space-y-4 mb-6">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Name</label>
                        <input type="text" value={selectedRole.name}
                          onChange={e => updateLocal(selectedRole.id, { name: e.target.value })}
                          onBlur={() => saveRole(selectedRole.id)}
                          className="w-full h-8 px-2.5 text-sm rounded focus:outline-none"
                          style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
                      </div>
                      <div className="w-36">
                        <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Role Type</label>
                        <select value={selectedRole.role}
                          onChange={e => { updateLocal(selectedRole.id, { role: e.target.value }); setTimeout(() => saveRole(selectedRole.id), 50) }}
                          className="w-full h-8 px-2 text-sm rounded focus:outline-none"
                          style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}>
                          {ROLE_TYPES.map(t => <option key={t} value={t}>{ROLE_TYPE_LABELS[t]}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* ── CASTING DIRECTOR FIELDS ── */}
                    <div className="p-3 rounded-lg" style={{ background: "#F5F5F5", border: "1px solid #E0E0E0" }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#888" }}>Casting Specs</p>
                      <div className="grid grid-cols-3 gap-3">
                        {/* Age */}
                        <div>
                          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Age / Range</label>
                          <input type="text"
                            value={selectedRole.age || ""}
                            onChange={e => updateLocal(selectedRole.id, { age: e.target.value })}
                            onBlur={() => saveRole(selectedRole.id)}
                            placeholder="25–35"
                            className="w-full h-7 px-2 text-[12px] rounded focus:outline-none"
                            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }} />
                        </div>
                        {/* Gender */}
                        <div>
                          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Gender</label>
                          <select value={selectedRole.gender || ""}
                            onChange={e => { updateLocal(selectedRole.id, { gender: e.target.value }); setTimeout(() => saveRole(selectedRole.id), 50) }}
                            className="w-full h-7 px-2 text-[12px] rounded focus:outline-none"
                            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }}>
                            <option value="">—</option>
                            {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        {/* Physique */}
                        <div>
                          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Physique</label>
                          <select value={selectedRole.physique || ""}
                            onChange={e => { updateLocal(selectedRole.id, { physique: e.target.value }); setTimeout(() => saveRole(selectedRole.id), 50) }}
                            className="w-full h-7 px-2 text-[12px] rounded focus:outline-none"
                            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }}>
                            <option value="">—</option>
                            {PHYSIQUE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        {/* Ethnicity */}
                        <div>
                          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Ethnicity</label>
                          <select value={selectedRole.ethnicity || ""}
                            onChange={e => { updateLocal(selectedRole.id, { ethnicity: e.target.value }); setTimeout(() => saveRole(selectedRole.id), 50) }}
                            className="w-full h-7 px-2 text-[12px] rounded focus:outline-none"
                            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }}>
                            <option value="">—</option>
                            {ETHNICITY_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        </div>
                        {/* Nationality */}
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Nationality / Language</label>
                          <input type="text"
                            value={selectedRole.nationality || ""}
                            onChange={e => updateLocal(selectedRole.id, { nationality: e.target.value })}
                            onBlur={() => saveRole(selectedRole.id)}
                            placeholder="Chinese, Mandarin fluent"
                            className="w-full h-7 px-2 text-[12px] rounded focus:outline-none"
                            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }} />
                        </div>
                      </div>
                    </div>

                    {/* Character Description */}
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: "#999" }}>Character Description</label>
                      <textarea value={selectedRole.description ?? ""}
                        onChange={e => updateLocal(selectedRole.id, { description: e.target.value })}
                        onBlur={() => saveRole(selectedRole.id)}
                        rows={4}
                        placeholder="Personality, backstory, mannerisms, arc... Used by AI to generate the character portrait."
                        className="w-full px-2.5 py-2 text-sm rounded focus:outline-none resize-none leading-relaxed"
                        style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }} />
                    </div>
                  </div>

                  {/* Reference Images */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#999" }}>
                        Reference Images ({selectedRole.referenceImages?.length ?? 0})
                      </label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowGenerateConfirm(selectedRole.id)} disabled={!!generatingFor}
                          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded disabled:opacity-50"
                          style={{ background: "#EDE9FE", color: "#6D28D9" }}>
                          {generatingFor === selectedRole.id ? (
                            <><div className="w-2.5 h-2.5 rounded-full border border-purple-400 border-t-transparent animate-spin" /> Generating...</>
                          ) : <>✦ AI Portrait</>}
                        </button>
                        <button onClick={() => { pendingRoleIdRef.current = selectedRole.id; fileInputRef.current?.click() }} disabled={!!uploadingFor}
                          className="text-[11px] px-2.5 py-1 rounded disabled:opacity-50"
                          style={{ background: "#4F46E5", color: "#fff" }}>
                          {uploadingFor === selectedRole.id ? "Uploading..." : "↑ Upload"}
                        </button>
                      </div>
                    </div>

                    {generationPrompt && (
                      <div className="mb-3 p-2 rounded text-[10px] leading-relaxed" style={{ background: "#F5F0FF", border: "1px solid #DDD6FE", color: "#7C3AED" }}>
                        <span className="font-semibold">Generated prompt: </span>{generationPrompt}
                      </div>
                    )}

                    {(selectedRole.referenceImages?.length ?? 0) === 0 ? (
                      <div className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-10 cursor-pointer"
                        style={{ borderColor: "#C8C8C8", background: "#F5F5F5" }}
                        onClick={() => { pendingRoleIdRef.current = selectedRole.id; fileInputRef.current?.click() }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "#BBB" }} className="mb-2">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                        <p className="text-[11px]" style={{ color: "#BBB" }}>Upload or AI-generate portrait</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {selectedRole.referenceImages.map((img, i) => (
                          <div key={i} className="relative group aspect-square rounded overflow-hidden" style={{ background: "#E0E0E0" }}>
                            <img src={img} alt="" className="w-full h-full object-cover" />
                            <button onClick={() => removeImage(selectedRole.id, img)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                            {i === 0 && <div className="absolute bottom-1 left-1 text-[8px] px-1 py-0.5 rounded" style={{ background: "#4F46E5", color: "#fff" }}>Main</div>}
                          </div>
                        ))}
                        <button onClick={() => { pendingRoleIdRef.current = selectedRole.id; fileInputRef.current?.click() }}
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
              ) : rightTab === "audition" ? (
                /* ── AUDITION TAB ── */
                <div className="max-w-2xl mx-auto p-6">
                  <div className="mb-5">
                    <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Voice Audition · 声音试演</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: "#999" }}>
                      Select an emotion and audition line to preview how {selectedRole.name} would sound in different scenarios.
                    </p>
                  </div>

                  {/* Emotion selector */}
                  <div className="mb-5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#888" }}>
                      Emotion / Mood
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {VOICE_EMOTIONS.map(e => (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEmotion(e.id)}
                          className="text-[11px] px-2.5 py-1 rounded-full transition-all"
                          style={{
                            background: selectedEmotion === e.id ? e.color : "#F0F0F0",
                            color: selectedEmotion === e.id ? "#fff" : "#555",
                            border: `1px solid ${selectedEmotion === e.id ? e.color : "#D8D8D8"}`,
                            fontWeight: selectedEmotion === e.id ? 600 : 400,
                          }}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Audition line input */}
                  <div className="mb-5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#888" }}>
                      Audition Line
                    </label>

                    {/* Preset lines */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {DEFAULT_AUDITION_LINES.map((line, i) => (
                        <button
                          key={i}
                          onClick={() => setAuditionLine(line)}
                          className="text-[10px] px-2 py-1 rounded transition-colors text-left max-w-[200px] truncate"
                          style={{
                            background: auditionLine === line ? "#E0E4F8" : "#EBEBEB",
                            color: auditionLine === line ? "#4F46E5" : "#666",
                            border: `1px solid ${auditionLine === line ? "#C5CCF0" : "#D8D8D8"}`,
                          }}
                          title={line}
                        >
                          {line.slice(0, 20)}{line.length > 20 ? "..." : ""}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={auditionLine}
                      onChange={e => setAuditionLine(e.target.value)}
                      rows={3}
                      placeholder="Enter custom audition dialogue..."
                      className="w-full px-3 py-2 text-sm rounded focus:outline-none resize-none leading-relaxed"
                      style={{ background: "#fff", border: "1px solid #C8C8C8", color: "#1A1A1A" }}
                    />
                  </div>

                  {/* Character voice info */}
                  <div className="p-3 rounded-lg mb-5" style={{ background: "#F5F5F5", border: "1px solid #E0E0E0" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#888" }}>Character Voice Spec</p>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span style={{ color: "#AAA" }}>Gender</span>
                        <p className="font-medium" style={{ color: "#333" }}>{selectedRole.gender || "—"}</p>
                      </div>
                      <div>
                        <span style={{ color: "#AAA" }}>Age</span>
                        <p className="font-medium" style={{ color: "#333" }}>{selectedRole.age || "—"}</p>
                      </div>
                      <div>
                        <span style={{ color: "#AAA" }}>Nationality</span>
                        <p className="font-medium" style={{ color: "#333" }}>{selectedRole.nationality || "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Generate button */}
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={async () => {
                        setIsGeneratingAudio(true)
                        setGeneratedAudioUrl(null)
                        try {
                          const emotion = VOICE_EMOTIONS.find(e => e.id === selectedEmotion)
                          const res = await fetch("/api/ai/voice-audition", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              text: auditionLine,
                              emotion: selectedEmotion,
                              character: {
                                name: selectedRole.name,
                                gender: selectedRole.gender,
                                age: selectedRole.age,
                                nationality: selectedRole.nationality,
                                description: selectedRole.description,
                                role: selectedRole.role,
                              },
                            }),
                          })
                          if (res.ok) {
                            const data = await res.json()
                            setGeneratedAudioUrl(data.audioUrl)
                          } else {
                            alert("Voice generation failed")
                          }
                        } finally {
                          setIsGeneratingAudio(false)
                        }
                      }}
                      disabled={isGeneratingAudio || !auditionLine.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded font-medium text-[12px] disabled:opacity-50 transition-colors"
                      style={{ background: "#4F46E5", color: "#fff" }}
                    >
                      {isGeneratingAudio ? (
                        <>
                          <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                          Generate Voice · {VOICE_EMOTIONS.find(e => e.id === selectedEmotion)?.label}
                        </>
                      )}
                    </button>
                  </div>

                  {/* Audio player */}
                  {generatedAudioUrl && (
                    <div className="p-4 rounded-lg" style={{ background: "#F0F0FF", border: "1px solid #C5CCF0" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#4F46E5" }}>
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                        <span className="text-[11px] font-medium" style={{ color: "#4F46E5" }}>
                          {selectedRole.name} · {VOICE_EMOTIONS.find(e => e.id === selectedEmotion)?.label}
                        </span>
                      </div>
                      <audio
                        ref={audioRef}
                        src={generatedAudioUrl}
                        controls
                        className="w-full"
                        style={{ height: 32 }}
                        autoPlay
                      />
                    </div>
                  )}

                  {/* Coming soon note if no API */}
                  <div className="mt-4 p-3 rounded-lg" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                    <p className="text-[11px]" style={{ color: "#92400E" }}>
                      🔊 Voice audition integrates with TTS API. Make sure <code>/api/ai/voice-audition</code> is configured with your preferred TTS provider (ElevenLabs, MiniMax TTS, etc.)
                    </p>
                  </div>
                </div>
              ) : (
                /* ── COSTUMES TAB ── */
                <div className="max-w-2xl mx-auto p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>定妆照 · Costume Record</h3>
                      <p className="text-[11px] mt-0.5" style={{ color: "#999" }}>
                        Upload costume photos tagged by scene / setting. Each look is a separate entry.
                      </p>
                    </div>
                  </div>

                  {/* Upload new costume */}
                  <div className="p-4 rounded-lg mb-6" style={{ background: "#F5F5F5", border: "1px solid #E0E0E0" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#888" }}>Add Costume Look</p>
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1">
                        <label className="text-[10px] mb-1 block" style={{ color: "#AAA" }}>Scene / Location</label>
                        <input type="text" value={costumeScene}
                          onChange={e => setCostumeScene(e.target.value)}
                          placeholder="e.g. INT. OFFICE - DAY"
                          className="w-full h-7 px-2 text-[11px] rounded focus:outline-none"
                          style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] mb-1 block" style={{ color: "#AAA" }}>Note (optional)</label>
                        <input type="text" value={costumeNote}
                          onChange={e => setCostumeNote(e.target.value)}
                          placeholder="Ep 1-3, formal attire"
                          className="w-full h-7 px-2 text-[11px] rounded focus:outline-none"
                          style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }} />
                      </div>
                    </div>
                    <button
                      onClick={() => costumeFileInputRef.current?.click()}
                      disabled={uploadingCostume}
                      className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                      style={{ background: "#4F46E5", color: "#fff" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <polyline points="16 16 12 12 8 16" />
                        <line x1="12" y1="12" x2="12" y2="21" />
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                      </svg>
                      {uploadingCostume ? "Uploading..." : "Upload Photo"}
                    </button>
                  </div>

                  {/* Costume grid grouped by scene */}
                  {(selectedRole.costumes?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16" style={{ color: "#CCC" }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-50">
                        <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z" />
                      </svg>
                      <p className="text-[11px]">No costume photos yet</p>
                    </div>
                  ) : (
                    (() => {
                      // Group costumes by scene
                      const byScene: Record<string, { photo: CostumePhoto; idx: number }[]> = {}
                      selectedRole.costumes!.forEach((c, idx) => {
                        const key = c.scene || "General"
                        if (!byScene[key]) byScene[key] = []
                        byScene[key].push({ photo: c, idx })
                      })
                      return Object.entries(byScene).map(([scene, items]) => (
                        <div key={scene} className="mb-6">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-mono font-semibold uppercase" style={{ color: "#666" }}>{scene}</span>
                            <div className="flex-1 h-px" style={{ background: "#E0E0E0" }} />
                            <span className="text-[9px]" style={{ color: "#CCC" }}>{items.length} look{items.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {items.map(({ photo, idx }) => (
                              <div key={idx} className="relative group rounded-lg overflow-hidden" style={{ background: "#E8E8E8" }}>
                                <img src={photo.url} alt="" className="w-full aspect-[3/4] object-cover" />
                                {photo.note && (
                                  <div className="px-2 py-1 text-[9px] truncate" style={{ background: "#2A2A2A", color: "#DDD" }}>{photo.note}</div>
                                )}
                                <button onClick={() => removeCostumePhoto(selectedRole.id, idx)}
                                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    })()
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showGenerateConfirm && (
        <AIConfirmModal
          featureKey="generate_character"
          featureLabel="AI Portrait"
          onConfirm={() => { const id = showGenerateConfirm; setShowGenerateConfirm(null); generateCharacterImage(id) }}
          onCancel={() => setShowGenerateConfirm(null)}
        />
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0]
          const roleId = pendingRoleIdRef.current
          if (file && roleId) await uploadImage(roleId, file)
          e.target.value = ""
        }} />
      <input ref={costumeFileInputRef} type="file" accept="image/*" className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0]
          if (file && selectedRoleId) await uploadCostumePhoto(selectedRoleId, file)
          e.target.value = ""
        }} />
    </div>
  )
}
