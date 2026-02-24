"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { AIConfirmModal } from "@/components/dev/ai-confirm-modal"
import { useUnsavedWarning } from "@/lib/use-unsaved-warning"
import { useAITasks } from "@/lib/ai-task-context"
import type { StorylineEntry } from "@/lib/character-analysis"

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
  storyline?: string | null
  castingSpecs?: string | null
  // Extended fields stored in metadata JSON
  age?: string
  gender?: string
  height?: string
  ethnicity?: string
  nationality?: string
  physique?: string
  costumes?: CostumePhoto[]
  imagePromptMap?: Record<string, string>
  storylineEntries?: StorylineEntry[]
}

interface SceneRef {
  id: string
  episodeNum: number
  sceneNum: number
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
}

interface Script {
  id: string
  title: string
  genre: string
  roles: Role[]
  scenes?: SceneRef[]
}

interface DialogueStats {
  [characterNameUpperCase: string]: { sceneCount: number; lineCount: number }
}

interface CastingWorkspaceProps {
  script: Script
  dialogueStats?: DialogueStats
  /** Maps UPPERCASE character name → scene keys ("E1S2") where they have dialogue */
  characterScenes?: Record<string, string[]>
}

const ROLE_TYPES = ["protagonist", "antagonist", "supporting", "minor"]
const ROLE_TYPE_LABELS: Record<string, string> = {
  lead: "Lead",
  protagonist: "Protagonist",
  antagonist: "Antagonist",
  supporting: "Supporting",
  minor: "Minor",
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
function parseRoleMeta(role: Role): { age: string; gender: string; height: string; ethnicity: string; nationality: string; physique: string; costumes: CostumePhoto[] } {
  return {
    age: role.age || "",
    gender: role.gender || "",
    height: role.height || "",
    ethnicity: role.ethnicity || "",
    nationality: role.nationality || "",
    physique: role.physique || "",
    costumes: role.costumes || [],
  }
}

export function CastingWorkspace({ script, dialogueStats = {}, characterScenes = {} }: CastingWorkspaceProps) {
  const { markDirty, markClean } = useUnsavedWarning()
  // Hydrate roles with parsed metadata, sorted by importance
  const [roles, setRoles] = useState<Role[]>(script.roles.map(r => {
    // Try to parse extra fields from voiceType field (a spare column we use for JSON metadata)
    let meta: Partial<Role> = {}
    try { if (r.voiceType?.startsWith("{")) meta = JSON.parse(r.voiceType) } catch { /* ok */ }
    // Parse castingSpecs if available (newer scripts — overrides voiceType meta)
    let specsMeta: Partial<Role> = {}
    try { if (r.castingSpecs?.startsWith("{")) specsMeta = JSON.parse(r.castingSpecs) } catch { /* ok */ }
    // Parse pre-computed storyline entries
    let storylineEntries: StorylineEntry[] = []
    try { if (r.storyline) storylineEntries = JSON.parse(r.storyline) } catch { /* ok */ }
    return { ...r, ...meta, ...specsMeta, storylineEntries }
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
  // Delete confirmation: user must type the role's name to proceed
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("")
  const [lightboxImg, setLightboxImg] = useState<{ url: string; prompt?: string } | null>(null)
  const [lightboxCopied, setLightboxCopied] = useState(false)
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set())
  const [isFillingSpecs, setIsFillingSpecs] = useState(false)
  const [generatingCostumeFor, setGeneratingCostumeFor] = useState<string | null>(null) // scene id
  // Multi-select for bulk operations — initialize with all roles selected
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(() => new Set(roles.map(r => r.id)))
  // Costume confirm modal
  const [showCostumeConfirm, setShowCostumeConfirm] = useState(false)

  // ── Global AI Task Context ──────────────────────────────────────────────
  const aiTasks = useAITasks()
  // Derive bulk progress from global context
  const fillTask = aiTasks.tasks.find(t => t.type === "fill_all_specs" && t.scriptId === script.id && t.status === "running")
  const portraitTask = aiTasks.tasks.find(t => t.type === "generate_all_portraits" && t.scriptId === script.id && t.status === "running")
  const costumeTask = aiTasks.tasks.find(t => t.type === "generate_all_costumes" && t.scriptId === script.id && t.status === "running")
  const isFillingAllSpecs = !!fillTask
  const isGeneratingAllPortraits = !!portraitTask
  const isGeneratingAllCostumes = !!costumeTask
  const isAutoGenerating = isFillingAllSpecs || isGeneratingAllPortraits

  const fileInputRef = useRef<HTMLInputElement>(null)
  const costumeFileInputRef = useRef<HTMLInputElement>(null)
  const pendingRoleIdRef = useRef<string | null>(null)

  // Keep a ref to latest roles so saveRole (called from setTimeout) always reads current state
  const rolesRef = useRef(roles)
  rolesRef.current = roles

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null

  function updateLocal(id: string, patch: Partial<Role>) {
    markDirty()
    setRoles(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  // Serialize extended fields back into voiceType JSON for storage
  async function saveRole(id: string) {
    const role = rolesRef.current.find(r => r.id === id)
    if (!role) return
    setSaving(id)
    try {
      const metaJson = JSON.stringify({
        age: role.age || "",
        gender: role.gender || "",
        height: role.height || "",
        ethnicity: role.ethnicity || "",
        nationality: role.nationality || "",
        physique: role.physique || "",
        costumes: role.costumes || [],
        imagePromptMap: role.imagePromptMap || {},
      })
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: role.name, description: role.description, role: role.role, voiceType: metaJson }),
      })
      markClean()
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
      height: role.height || "",
      ethnicity: role.ethnicity || "",
      nationality: role.nationality || "",
      physique: role.physique || "",
      costumes,
      imagePromptMap: role.imagePromptMap || {},
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
    // Trigger confirmation modal instead of browser confirm()
    setDeleteConfirmId(id)
    setDeleteConfirmInput("")
  }

  async function confirmDeleteRole() {
    const id = deleteConfirmId
    if (!id) return
    setDeleteConfirmId(null)
    setDeleteConfirmInput("")
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

  async function deleteSelected() {
    const selectedIds = Array.from(selectedRoleIds)
    if (selectedIds.length === 0) return
    const names = roles.filter(r => selectedIds.includes(r.id)).map(r => r.name).join(", ")
    if (!window.confirm(`Delete ${selectedIds.length} character(s)?\n\n${names}\n\nThis cannot be undone.`)) return
    for (const id of selectedIds) {
      setDeletingId(id)
      await fetch("/api/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    }
    setDeletingId(null)
    const remaining = roles.filter(r => !selectedIds.includes(r.id))
    setRoles(remaining)
    setSelectedRoleIds(new Set())
    if (selectedIds.includes(selectedRoleId ?? "")) {
      setSelectedRoleId(remaining[0]?.id ?? null)
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
    const taskId = aiTasks.registerSingleTask("character_portrait", `Portrait: ${role.name}`, 15000, script.id)
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
          height: role.height,
          ethnicity: role.ethnicity,
          physique: role.physique,
          scriptId: script.id,
        }),
      })
      if (!res.ok) { const err = await res.json(); aiTasks.failSingleTask(taskId, err.error); alert(`AI generation failed: ${err.error}`); return }
      const { imageUrl, prompt } = await res.json()
      setGenerationPrompt(prompt)
      const newImages = [...(role.referenceImages || []), imageUrl]
      const newPromptMap = { ...(role.imagePromptMap || {}), [imageUrl]: prompt || "" }
      const metaJson = JSON.stringify({
        age: role.age || "",
        gender: role.gender || "",
        height: role.height || "",
        ethnicity: role.ethnicity || "",
        nationality: role.nationality || "",
        physique: role.physique || "",
        costumes: role.costumes || [],
        imagePromptMap: newPromptMap,
      })
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: roleId, referenceImages: newImages, voiceType: metaJson }),
      })
      updateLocal(roleId, { referenceImages: newImages, imagePromptMap: newPromptMap })
      setLightboxImg({ url: imageUrl, prompt: prompt || undefined })
      aiTasks.completeSingleTask(taskId)
    } catch (e: any) {
      aiTasks.failSingleTask(taskId, e?.message)
    } finally {
      setGeneratingFor(null)
    }
  }

  async function fillSpecsFromDescription(roleId: string) {
    const role = roles.find(r => r.id === roleId)
    if (!role || !role.description) return
    setIsFillingSpecs(true)
    const taskId = aiTasks.registerSingleTask("fill_specs", `Specs: ${role.name}`, 5000, script.id)
    try {
      const res = await fetch("/api/ai/fill-character-specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: role.name, description: role.description, role: role.role, scriptId: script.id }),
      })
      if (!res.ok) { console.error(`Fill specs failed: ${res.status}`); aiTasks.failSingleTask(taskId, `Failed (${res.status})`); alert(`Fill specs failed (${res.status}). Please try again.`); return }
      const specs = await res.json()
      const patch: Partial<Role> = {
        age: specs.age ?? "",
        gender: specs.gender ?? "",
        height: specs.height ?? "",
        ethnicity: specs.ethnicity ?? "",
        nationality: specs.nationality || "English",
        physique: specs.physique ?? "",
      }
      updateLocal(roleId, patch)
      const merged = { ...role, ...patch }
      const metaJson = JSON.stringify({
        age: merged.age || "",
        gender: merged.gender || "",
        height: merged.height || "",
        ethnicity: merged.ethnicity || "",
        nationality: merged.nationality || "",
        physique: merged.physique || "",
        costumes: merged.costumes || [],
        imagePromptMap: merged.imagePromptMap || {},
      })
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: roleId, name: role.name, description: role.description, role: role.role, voiceType: metaJson }),
      })
      aiTasks.completeSingleTask(taskId)
    } catch (e: any) {
      aiTasks.failSingleTask(taskId, e?.message)
    } finally {
      setIsFillingSpecs(false)
    }
  }

  // ── Bulk operations via global AITask context ────────────────────────────

  function startFillAllSpecs(targetRoleIds?: string[]) {
    if (aiTasks.isRunning("fill_all_specs", script.id)) return
    const withDesc = roles.filter(r => (!targetRoleIds || targetRoleIds.includes(r.id)) && r.description)
    if (withDesc.length === 0) return

    aiTasks.startBatchTask({
      type: "fill_all_specs",
      label: "Filling Character Specs",
      scriptId: script.id,
      items: withDesc.map(r => ({ id: r.id, label: r.name })),
      estimatedMsPerItem: 5000,
      dbJobType: "fill_all_specs",
      dbJobPayload: { scriptId: script.id, roleIds: withDesc.map(r => r.id) },
      executeFn: async (roleId, signal) => {
        const role = rolesRef.current.find(r => r.id === roleId)
        if (!role || !role.description) return null
        const res = await fetch("/api/ai/fill-character-specs", {
          signal, method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: role.name, description: role.description, role: role.role, scriptId: script.id }),
        })
        if (!res.ok) throw new Error(`Fill specs failed: ${res.status}`)
        const specs = await res.json()
        // Save to DB directly
        const merged = { ...role, ...specs }
        const metaJson = JSON.stringify({
          age: merged.age || "", gender: merged.gender || "",
          height: merged.height || "", ethnicity: merged.ethnicity || "",
          nationality: merged.nationality || "", physique: merged.physique || "",
          costumes: merged.costumes || [], imagePromptMap: merged.imagePromptMap || {},
        })
        await fetch("/api/roles", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: roleId, name: role.name, description: role.description, role: role.role, voiceType: metaJson }),
        })
        return specs
      },
      onItemDone: (roleId, specs) => {
        if (specs) {
          updateLocal(roleId, {
            age: specs.age ?? "", gender: specs.gender ?? "",
            height: specs.height ?? "", ethnicity: specs.ethnicity ?? "",
            nationality: specs.nationality || "English", physique: specs.physique ?? "",
          })
        }
      },
    })
  }

  function startGenerateAllPortraits(targetRoleIds?: string[]) {
    if (aiTasks.isRunning("generate_all_portraits", script.id)) return
    const targetRoles = targetRoleIds ? roles.filter(r => targetRoleIds.includes(r.id)) : roles
    if (targetRoles.length === 0) return

    aiTasks.startBatchTask({
      type: "generate_all_portraits",
      label: "Generating Portraits",
      scriptId: script.id,
      items: targetRoles.map(r => ({ id: r.id, label: r.name })),
      estimatedMsPerItem: 15000,
      dbJobType: "generate_all_portraits",
      dbJobPayload: { scriptId: script.id, roleIds: targetRoles.map(r => r.id) },
      executeFn: async (roleId, signal) => {
        const role = rolesRef.current.find(r => r.id === roleId)
        if (!role) return null
        const res = await fetch("/api/ai/generate-character", {
          signal, method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: role.name, description: role.description, role: role.role,
            genre: script.genre, age: role.age, gender: role.gender,
            height: role.height, ethnicity: role.ethnicity, physique: role.physique,
            scriptId: script.id,
          }),
        })
        if (!res.ok) throw new Error(`Generation failed: ${res.status}`)
        const { imageUrl, prompt } = await res.json()
        // Save to DB
        const newImages = [...(role.referenceImages || []), imageUrl]
        const newPromptMap = { ...(role.imagePromptMap || {}), [imageUrl]: prompt || "" }
        const metaJson = JSON.stringify({
          age: role.age || "", gender: role.gender || "",
          height: role.height || "", ethnicity: role.ethnicity || "",
          nationality: role.nationality || "", physique: role.physique || "",
          costumes: role.costumes || [], imagePromptMap: newPromptMap,
        })
        await fetch("/api/roles", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: roleId, referenceImages: newImages, voiceType: metaJson }),
        })
        return { imageUrl, prompt, newImages, newPromptMap }
      },
      onItemDone: (roleId, result) => {
        if (result?.imageUrl) {
          const role = rolesRef.current.find(r => r.id === roleId)
          if (role) {
            updateLocal(roleId, {
              referenceImages: result.newImages,
              imagePromptMap: result.newPromptMap,
            })
          }
        }
      },
    })
  }

  function startGenerateAllCostumes() {
    if (aiTasks.isRunning("generate_all_costumes", script.id)) return
    if (!script.scenes?.length || roles.length === 0) return
    // Build list of (role, scene) pairs missing costumes
    const items: { id: string; label: string; roleId: string; scene: SceneRef }[] = []
    for (const role of roles) {
      const roleSceneKeys = characterScenes[role.name.trim().toUpperCase()] ?? []
      for (const scene of script.scenes!) {
        const sceneKey = `E${scene.episodeNum}S${scene.sceneNum}`
        if (roleSceneKeys.length > 0 && !roleSceneKeys.includes(sceneKey)) continue
        const hasCostume = (role.costumes || []).some(c => c.scene === sceneKey)
        if (!hasCostume) {
          items.push({
            id: `${role.id}:${sceneKey}`,
            label: `${role.name} · ${sceneKey}`,
            roleId: role.id,
            scene,
          })
        }
      }
    }
    if (items.length === 0) return

    aiTasks.startBatchTask({
      type: "generate_all_costumes",
      label: "Generating Costumes",
      scriptId: script.id,
      items: items.map(i => ({ id: i.id, label: i.label })),
      estimatedMsPerItem: 15000,
      dbJobType: "generate_all_costumes",
      dbJobPayload: { scriptId: script.id, roleIds: items.map(i => i.id) },
      executeFn: async (compositeId, signal) => {
        const item = items.find(i => i.id === compositeId)
        if (!item) return null
        const role = rolesRef.current.find(r => r.id === item.roleId)
        if (!role) return null
        const key = `E${item.scene.episodeNum}S${item.scene.sceneNum}`
        const res = await fetch("/api/ai/generate-costume", {
          signal, method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterName: role.name, characterDescription: role.description,
            gender: role.gender, age: role.age, physique: role.physique,
            ethnicity: role.ethnicity, roleType: role.role, sceneKey: key,
            scriptId: script.id, sceneId: item.scene.id,
            sceneHeading: item.scene.heading, location: item.scene.location,
            timeOfDay: item.scene.timeOfDay, genre: script.genre,
          }),
        })
        if (!res.ok) throw new Error(`Costume failed: ${res.status}`)
        const { url } = await res.json()
        if (url) {
          // Save costume to DB
          const newCostume = { url, scene: key, note: item.scene.heading || "" }
          const newCostumes = [...(role.costumes || []), newCostume]
          const newRefImages = [...(role.referenceImages || []), url]
          const metaJson = JSON.stringify({
            age: role.age || "", gender: role.gender || "",
            height: role.height || "", ethnicity: role.ethnicity || "",
            nationality: role.nationality || "", physique: role.physique || "",
            costumes: newCostumes, imagePromptMap: role.imagePromptMap || {},
          })
          await fetch("/api/roles", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.roleId, referenceImages: newRefImages, voiceType: metaJson }),
          })
          return { url, key, newCostumes, newRefImages, roleId: item.roleId }
        }
        return null
      },
      onItemDone: (_compositeId, result) => {
        if (result?.url && result.roleId) {
          updateLocal(result.roleId, {
            costumes: result.newCostumes,
            referenceImages: result.newRefImages,
          })
        }
      },
    })
  }

  // ── Combined auto-generate: Fill Specs → Generate Portraits (for selected roles) ─────
  function autoGenerateSelected(selectedIds: string[]) {
    if (selectedIds.length === 0) return
    // Phase 1: Fill specs
    const withDesc = roles.filter(r => selectedIds.includes(r.id) && r.description)
    if (withDesc.length > 0) {
      const taskId = aiTasks.startBatchTask({
        type: "fill_all_specs",
        label: "Filling Specs (Phase 1/2)",
        scriptId: script.id,
        items: withDesc.map(r => ({ id: r.id, label: r.name })),
        estimatedMsPerItem: 5000,
        dbJobType: "fill_all_specs",
        dbJobPayload: { scriptId: script.id, roleIds: withDesc.map(r => r.id) },
        executeFn: async (roleId, signal) => {
          const role = rolesRef.current.find(r => r.id === roleId)
          if (!role || !role.description) return null
          const res = await fetch("/api/ai/fill-character-specs", {
            signal, method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: role.name, description: role.description, role: role.role, scriptId: script.id }),
          })
          if (!res.ok) throw new Error(`Fill specs failed`)
          const specs = await res.json()
          const merged = { ...role, ...specs }
          const metaJson = JSON.stringify({
            age: merged.age || "", gender: merged.gender || "",
            height: merged.height || "", ethnicity: merged.ethnicity || "",
            nationality: merged.nationality || "", physique: merged.physique || "",
            costumes: merged.costumes || [], imagePromptMap: merged.imagePromptMap || {},
          })
          await fetch("/api/roles", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: roleId, name: role.name, description: role.description, role: role.role, voiceType: metaJson }),
          })
          return specs
        },
        onItemDone: (roleId, specs) => {
          if (specs) {
            updateLocal(roleId, {
              age: specs.age ?? "", gender: specs.gender ?? "",
              height: specs.height ?? "", ethnicity: specs.ethnicity ?? "",
              nationality: specs.nationality || "English", physique: specs.physique ?? "",
            })
          }
        },
      })
      // Phase 2: when specs done → start portraits
      aiTasks.onTaskEnd(taskId, (endedTask) => {
        if (endedTask.status === "completed") {
          startGenerateAllPortraits(selectedIds)
        }
      })
    } else {
      // No descriptions to fill — go straight to portraits
      startGenerateAllPortraits(selectedIds)
    }
  }

  // ── On mount: check for interrupted jobs and auto-resume via context ──────
  useEffect(() => {
    async function resumeActiveJobs() {
      const res = await fetch(`/api/casting/bulk-job?scriptId=${script.id}`)
      if (!res.ok) return
      const { jobs } = await res.json()

      for (const job of jobs) {
        // Skip if already running in context
        if (aiTasks.isRunning(job.type, script.id)) continue

        let inputData: { roleIds: string[] } = { roleIds: [] }
        let outputData: { completedRoleIds: string[] } = { completedRoleIds: [] }
        try { inputData = JSON.parse(job.input || "{}") } catch { /* ok */ }
        try { outputData = JSON.parse(job.output || "{}") } catch { /* ok */ }

        const { roleIds = [] } = inputData
        const { completedRoleIds = [] } = outputData
        const remaining = roleIds.filter((id: string) => !completedRoleIds.includes(id))

        if (remaining.length === 0) {
          await fetch(`/api/casting/bulk-job?jobId=${job.id}`, { method: "DELETE" })
          continue
        }

        // Resume by re-starting the batch with only remaining items
        if (job.type === "fill_all_specs") {
          const withDesc = roles.filter(r => remaining.includes(r.id) && r.description)
          if (withDesc.length > 0) startFillAllSpecs(remaining)
        } else if (job.type === "generate_all_portraits") {
          startGenerateAllPortraits(remaining)
        } else if (job.type === "generate_all_costumes") {
          // Clean up old job, let user re-trigger if needed
          await fetch(`/api/casting/bulk-job?jobId=${job.id}`, { method: "DELETE" })
        }
      }
    }
    resumeActiveJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generateCostumeForScene(roleId: string, scene: SceneRef) {
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    const key = `E${scene.episodeNum}S${scene.sceneNum}`
    setGeneratingCostumeFor(key)
    const taskId = aiTasks.registerSingleTask("generate_costume", `Costume: ${role.name} · ${key}`, 15000, script.id)
    try {
      const res = await fetch("/api/ai/generate-costume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterName: role.name,
          characterDescription: role.description,
          gender: role.gender,
          age: role.age,
          physique: role.physique,
          ethnicity: role.ethnicity,
          roleType: role.role,
          sceneKey: key,
          scriptId: script.id,
          sceneId: scene.id,
          sceneHeading: scene.heading,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
          genre: script.genre,
        }),
      })
      if (!res.ok) { console.error(`Costume generation failed: ${res.status}`); aiTasks.failSingleTask(taskId, `Failed (${res.status})`); alert(`Costume generation failed (${res.status}). Please try again.`); return }
      const { url } = await res.json()
      if (url) {
        const newCostume = { url, scene: key, note: scene.heading || "" }
        const newCostumes = [...(role.costumes || []), newCostume]
        const newRefImages = [...(role.referenceImages || []), url]
        updateLocal(roleId, { costumes: newCostumes, referenceImages: newRefImages })
        await saveCostumes(roleId, newCostumes)
        await fetch("/api/roles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: roleId, referenceImages: newRefImages }),
        })
      }
      aiTasks.completeSingleTask(taskId)
    } catch (e: any) {
      aiTasks.failSingleTask(taskId, e?.message)
    } finally {
      setGeneratingCostumeFor(null)
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
    setBrokenImages(prev => { const s = new Set(prev); s.delete(imgUrl); return s })
    if (lightboxImg?.url === imgUrl) setLightboxImg(null)
  }

  async function setAsMainImage(roleId: string, imgUrl: string) {
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    const newImages = [imgUrl, ...role.referenceImages.filter(i => i !== imgUrl)]
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
        {/* Header with Select All */}
        <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid #C8C8C8" }}>
          <input
            type="checkbox"
            checked={roles.length > 0 && selectedRoleIds.size === roles.length}
            ref={el => { if (el) el.indeterminate = selectedRoleIds.size > 0 && selectedRoleIds.size < roles.length }}
            onChange={e => {
              if (e.target.checked) setSelectedRoleIds(new Set(roles.map(r => r.id)))
              else setSelectedRoleIds(new Set())
            }}
            className="w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
            style={{ accentColor: "#4F46E5" }}
            title="Select / deselect all"
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider flex-1" style={{ color: "#888" }}>
            Cast · {roles.length}
          </span>
          {selectedRoleIds.size > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
              {selectedRoleIds.size}✓
            </span>
          )}
        </div>

        {/* Batch action bar — visible when items are selected */}
        {selectedRoleIds.size > 0 && (
          <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "#EDEEFF", borderBottom: "1px solid #C8D0F0" }}>
            <span className="text-[9px] font-medium flex-1" style={{ color: "#4F46E5" }}>
              {selectedRoleIds.size} of {roles.length} selected
            </span>
            <button
              onClick={deleteSelected}
              disabled={deletingId !== null}
              className="flex items-center gap-1 text-[9px] px-2 py-1 rounded transition-colors disabled:opacity-40"
              style={{ background: "rgba(239,68,68,0.12)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
              </svg>
              Delete
            </button>
          </div>
        )}

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
              const isActive = role.id === selectedRoleId
              const isChecked = selectedRoleIds.has(role.id)
              const typeStyle = ROLE_TYPE_STYLES[role.role] || ROLE_TYPE_STYLES.minor
              return (
                <div key={role.id} className="flex items-center" style={{ borderLeft: isActive ? "2px solid #4F46E5" : "2px solid transparent", background: isActive ? "#DCE0F5" : isChecked ? "#EDEEFF" : "transparent" }}>
                  {/* Checkbox */}
                  <div className="pl-2 pr-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        const next = new Set(selectedRoleIds)
                        if (e.target.checked) next.add(role.id)
                        else next.delete(role.id)
                        setSelectedRoleIds(next)
                      }}
                      className="w-3.5 h-3.5 cursor-pointer"
                      style={{ accentColor: "#4F46E5" }}
                    />
                  </div>
                  {/* Role button */}
                  <button onClick={() => setSelectedRoleId(role.id)}
                    className="flex-1 text-left py-2.5 pr-3 flex items-center gap-2 transition-colors min-w-0">
                    {role.referenceImages?.[0] && !brokenImages.has(role.referenceImages[0]) ? (
                      <img src={role.referenceImages[0]} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        onError={() => setBrokenImages(prev => new Set([...prev, role.referenceImages[0]]))} />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={getAvatarStyle(role)}>
                        {role.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: isActive ? "#1A1A1A" : "#333" }}>{role.name}</p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[9px] px-1 py-0.5 rounded" style={typeStyle}>{ROLE_TYPE_LABELS[role.role] || role.role}</span>
                        {role.gender && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: "#E5E7EB", color: "#6B7280" }}>{role.gender}</span>}
                        {role.age && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: "#E5E7EB", color: "#6B7280" }}>{role.age}</span>}
                        {(() => {
                          const stats = dialogueStats[role.name.toUpperCase()]
                          return stats ? (
                            <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "#F0F4FF", color: "#6B7280" }} title={`${stats.sceneCount} scenes, ${stats.lineCount} lines`}>
                              {stats.sceneCount}sc · {stats.lineCount}ln
                            </span>
                          ) : null
                        })()}
                      </div>
                    </div>
                    {/* Completion badges */}
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      {(role.age || role.gender) ? (
                        <span className="text-[7px] px-1 rounded" style={{ background: "#D1FAE5", color: "#065F46" }} title="Specs filled">spec✓</span>
                      ) : role.description ? (
                        <span className="text-[7px] px-1 rounded" style={{ background: "#FEF3C7", color: "#92400E" }} title="Specs not filled">spec○</span>
                      ) : null}
                      <div className="flex items-center gap-0.5">
                        {(role.referenceImages?.length ?? 0) > 0 && (
                          <span className="text-[7px] px-0.5 rounded" style={{ background: "#EDE9FE", color: "#6D28D9" }} title="Has portrait">🖼</span>
                        )}
                        {(role.costumes?.length ?? 0) > 0 && (
                          <span className="text-[7px] px-0.5 rounded" style={{ background: "#FCE7F3", color: "#9D174D" }} title="Has costumes">👗</span>
                        )}
                      </div>
                    </div>
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
                { id: "profile" as RightTab, label: "Character Profile", disabled: false },
                { id: "costumes" as RightTab, label: "Costumes", disabled: false },
                { id: "audition" as RightTab, label: "🎙 Voice Audition", disabled: true },
              ]).map(tab => (
                <button key={tab.id}
                  onClick={() => !tab.disabled && setRightTab(tab.id)}
                  disabled={tab.disabled}
                  className="px-3 py-2 text-[11px] font-medium relative transition-colors"
                  style={{
                    color: tab.disabled ? "#D0D0D0" : rightTab === tab.id ? "#1A1A1A" : "#999",
                    cursor: tab.disabled ? "not-allowed" : "pointer",
                  }}
                  title={tab.disabled ? "Coming soon · 即将上线" : undefined}
                >
                  {tab.label}
                  {tab.disabled && (
                    <span className="ml-1 text-[8px] px-1 py-0.5 rounded" style={{ background: "#F0F0F0", color: "#C0C0C0" }}>
                      未开放
                    </span>
                  )}
                  {!tab.disabled && rightTab === tab.id && (
                    <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-t" style={{ background: "#4F46E5" }} />
                  )}
                </button>
              ))}

              {/* Bulk AI actions — far right */}
              <div className="flex items-center gap-2 ml-auto pb-1">
                {/* Progress indicators */}
                {(fillTask || portraitTask) && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px]" style={{ color: "#AAA" }}>
                      {fillTask
                        ? `Specs ${fillTask.done}/${fillTask.total}`
                        : portraitTask
                        ? `Portraits ${portraitTask.done}/${portraitTask.total}`
                        : "Starting..."}
                    </span>
                    <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "#E0E0E0" }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{
                        width: `${fillTask ? fillTask.progress : portraitTask ? portraitTask.progress : 0}%`,
                        background: fillTask ? "#4F46E5" : "#6D28D9",
                      }} />
                    </div>
                    {fillTask && portraitTask === undefined && (
                      <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "#E0E4F8", color: "#4F46E5" }}>
                        ① Specs
                      </span>
                    )}
                  </div>
                )}
                {costumeTask && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px]" style={{ color: "#AAA" }}>
                      Costumes {costumeTask.done}/{costumeTask.total}
                    </span>
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "#E0E0E0" }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${costumeTask.progress}%`, background: "#9D174D" }} />
                    </div>
                    <span className="text-[9px]" style={{ color: "#888" }}>{costumeTask.progress}%</span>
                  </div>
                )}
                {/* Single merged button: Fill Specs → Generate Portraits (for selected) */}
                <button
                  onClick={() => autoGenerateSelected(Array.from(selectedRoleIds))}
                  disabled={isAutoGenerating || isFillingAllSpecs || isGeneratingAllPortraits || isGeneratingAllCostumes || selectedRoleIds.size === 0}
                  className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded disabled:opacity-40 transition-colors font-medium"
                  style={{ background: "#4F46E5", color: "#fff" }}
                  title={`Auto-fill specs + generate AI portraits for ${selectedRoleIds.size} selected character(s)`}
                >
                  {(isFillingAllSpecs || isGeneratingAllPortraits) ? (
                    <><div className="w-2.5 h-2.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> {isFillingAllSpecs ? "Filling Specs..." : "Generating..."}</>
                  ) : (
                    <>✨ Generate Selected ({selectedRoleIds.size}) <span className="text-[8px] px-1 py-0.5 rounded font-semibold" style={{ background: "rgba(255,255,255,0.2)" }}>AI</span></>
                  )}
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto dev-scrollbar">
              {rightTab === "profile" ? (
                /* ── PROFILE TAB ── */
                <div className="max-w-2xl mx-auto p-6">
                  {/* Hero */}
                  <div className="flex items-center gap-4 mb-6">
                    {selectedRole.referenceImages?.[0] && !brokenImages.has(selectedRole.referenceImages[0]) ? (
                      <img src={selectedRole.referenceImages[0]} alt="" className="w-20 h-20 rounded-full object-cover" style={{ border: "2px solid #D0D0D0" }}
                        onError={() => setBrokenImages(prev => new Set([...prev, selectedRole.referenceImages[0]]))} />
                    ) : (
                      <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: "#D0D0D0", color: "#888" }}>
                        {selectedRole.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>{selectedRole.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={ROLE_TYPE_STYLES[selectedRole.role] || ROLE_TYPE_STYLES.minor}>
                          {ROLE_TYPE_LABELS[selectedRole.role] || selectedRole.role}
                        </span>
                        {(() => {
                          const stats = dialogueStats[selectedRole.name.toUpperCase()]
                          return stats ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#F0F4FF", color: "#6B7280", border: "1px solid #E0E4F0" }} title={`Appears in ${stats.sceneCount} scenes with ${stats.lineCount} dialogue lines`}>
                              📋 {stats.sceneCount} scenes · {stats.lineCount} lines
                            </span>
                          ) : null
                        })()}
                        {saving === selectedRole.id && <span className="text-[10px]" style={{ color: "#AAA" }}>Saving...</span>}
                      </div>
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
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Casting Specs</p>
                        <button
                          onClick={() => fillSpecsFromDescription(selectedRole.id)}
                          disabled={isFillingSpecs || !selectedRole.description}
                          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded disabled:opacity-40 transition-colors"
                          style={{ background: "#E0E4F8", color: "#4F46E5", border: "1px solid #C5CCF0" }}
                          title="Auto-fill from Character Description"
                        >
                          {isFillingSpecs ? (
                            <><div className="w-2 h-2 rounded-full border border-indigo-400 border-t-transparent animate-spin" /> Filling...</>
                          ) : <>Fill Specs <span className="text-[8px] px-1 py-0.5 rounded font-semibold" style={{ background: "#E0E4F8", color: "#4F46E5" }}>AI</span></>}
                        </button>
                      </div>
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
                        {/* Height */}
                        <div>
                          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "#AAA" }}>Height 身高</label>
                          <input type="text"
                            value={selectedRole.height || ""}
                            onChange={e => updateLocal(selectedRole.id, { height: e.target.value })}
                            onBlur={() => saveRole(selectedRole.id)}
                            placeholder="170cm"
                            className="w-full h-7 px-2 text-[12px] rounded focus:outline-none"
                            style={{ background: "#fff", border: "1px solid #D0D0D0", color: "#1A1A1A" }} />
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
                            placeholder="English"
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
                          ) : <>Generate Portrait <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: "#EDE9FE", color: "#6D28D9" }}>AI</span></>}
                        </button>
                        <button onClick={() => { pendingRoleIdRef.current = selectedRole.id; fileInputRef.current?.click() }} disabled={!!uploadingFor}
                          className="text-[11px] px-2.5 py-1 rounded disabled:opacity-50"
                          style={{ background: "#4F46E5", color: "#fff" }}>
                          {uploadingFor === selectedRole.id ? "Uploading..." : "↑ Upload"}
                        </button>
                      </div>
                    </div>

                    {(() => {
                      // Show the prompt for the SELECTED character's main (first) image
                      const mainImg = selectedRole.referenceImages?.[0]
                      const rolePrompt = mainImg ? selectedRole.imagePromptMap?.[mainImg] : undefined
                      return rolePrompt ? (
                        <div className="mb-3 p-2 rounded text-[10px] leading-relaxed" style={{ background: "#F5F0FF", border: "1px solid #DDD6FE", color: "#7C3AED" }}>
                          <span className="font-semibold">Generated prompt: </span>{rolePrompt}
                        </div>
                      ) : null
                    })()}

                    {(selectedRole.referenceImages?.filter(img => !brokenImages.has(img)).length ?? 0) === 0 ? (
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
                        {selectedRole.referenceImages.filter(img => !brokenImages.has(img)).map((img, i) => (
                          <div key={img} className="relative group aspect-square rounded overflow-hidden cursor-pointer" style={{ background: "#E0E0E0" }}
                            onClick={() => setLightboxImg({ url: img, prompt: selectedRole.imagePromptMap?.[img] })}>
                            <img src={img} alt="" className="w-full h-full object-cover"
                              onError={() => setBrokenImages(prev => new Set([...prev, img]))} />
                            {/* Remove button */}
                            <button onClick={e => { e.stopPropagation(); removeImage(selectedRole.id, img) }}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                            {/* Main badge or Set as Main button */}
                            {i === 0 ? (
                              <div className="absolute bottom-1 left-1 text-[8px] px-1 py-0.5 rounded" style={{ background: "#4F46E5", color: "#fff" }}>Main</div>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); setAsMainImage(selectedRole.id, img) }}
                                className="absolute bottom-1 left-1 text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                                title="Set as main portrait"
                              >Set Main</button>
                            )}
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
                        <span style={{ color: "#AAA" }}>Nationality / Language</span>
                        <p className="font-medium" style={{ color: "#333" }}>{selectedRole.nationality || "English"}</p>
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
                      <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Costume by Scene</h3>
                      <p className="text-[11px] mt-0.5" style={{ color: "#999" }}>
                        AI generates costume looks for each scene.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowCostumeConfirm(true)}
                        disabled={isGeneratingAllCostumes || isGeneratingAllPortraits || isFillingAllSpecs || isAutoGenerating || !script.scenes?.length}
                        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded disabled:opacity-40 transition-colors"
                        style={{ background: "#FCE7F3", color: "#9D174D", border: "1px solid #FBCFE8" }}
                        title="Generate AI costumes for all characters × all scenes (skips existing)"
                      >
                        {isGeneratingAllCostumes ? <><div className="w-2 h-2 rounded-full border border-pink-400 border-t-transparent animate-spin" /> Generating...</> : <>Generate All Costumes <span className="text-[8px] px-1 py-0.5 rounded font-semibold" style={{ background: "#FCE7F3", color: "#9D174D" }}>AI</span></>}
                      </button>
                      <button
                        onClick={() => costumeFileInputRef.current?.click()}
                        disabled={uploadingCostume}
                        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded disabled:opacity-50"
                        style={{ background: "#4F46E5", color: "#fff" }}>
                        ↑ Upload
                      </button>
                    </div>
                  </div>

                  {/* Scene list — only scenes where the selected character appears */}
                  {(() => {
                    if ((script.scenes?.length ?? 0) === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-16" style={{ color: "#CCC" }}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-50">
                            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z" />
                          </svg>
                          <p className="text-[11px]">No scenes in script yet</p>
                        </div>
                      )
                    }
                    const roleSceneKeys = characterScenes[selectedRole.name.trim().toUpperCase()] ?? []
                    // Filter to scenes where this character appears; fall back to all scenes if no data
                    const visibleScenes = roleSceneKeys.length > 0
                      ? script.scenes!.filter(s => roleSceneKeys.includes(`E${s.episodeNum}S${s.sceneNum}`))
                      : script.scenes!
                    if (visibleScenes.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-10" style={{ color: "#CCC" }}>
                          <p className="text-[11px]">This character has no dialogue scenes.</p>
                        </div>
                      )
                    }
                    return (
                    <div className="space-y-3">
                      {visibleScenes.map((scene) => {
                        const key = `E${scene.episodeNum}S${scene.sceneNum}`
                        const existing = (selectedRole.costumes || [])
                          .map((c, idx) => ({ photo: c, idx }))
                          .filter(({ photo }) => photo.scene === key)
                        const isGenerating = generatingCostumeFor === key
                        return (
                          <div key={scene.id} className="rounded-lg overflow-hidden" style={{ border: "1px solid #E8E8E8", background: "#F8F8F8" }}>
                            {/* Scene row */}
                            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: existing.length > 0 ? "1px solid #EFEFEF" : undefined }}>
                              <span className="text-[10px] font-mono font-bold flex-shrink-0" style={{ color: "#4F46E5" }}>{key}</span>
                              <span className="text-[11px] truncate flex-1" style={{ color: "#555" }}>
                                {scene.heading || scene.location || "Untitled"}
                              </span>
                              <button
                                onClick={() => generateCostumeForScene(selectedRole.id, scene)}
                                disabled={isGenerating || !!generatingCostumeFor}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded flex-shrink-0 disabled:opacity-40"
                                style={{ background: "#EDE9FE", color: "#6D28D9" }}>
                                {isGenerating ? (
                                  <><div className="w-2 h-2 rounded-full border border-purple-400 border-t-transparent animate-spin" /> Gen...</>
                                ) : <>Costume <span className="text-[8px] px-1 py-0.5 rounded font-semibold" style={{ background: "#EDE9FE", color: "#6D28D9" }}>AI</span></>}
                              </button>
                            </div>
                            {/* Costume photos inline */}
                            {existing.length > 0 && (
                              <div className="flex gap-2 p-2 flex-wrap">
                                {existing.map(({ photo, idx }) => (
                                  <div key={idx} className="relative group rounded overflow-hidden flex-shrink-0" style={{ width: 72, background: "#E0E0E0" }}>
                                    <img src={photo.url} alt="" className="w-full aspect-[3/4] object-cover" />
                                    {photo.note && (
                                      <div className="px-1 py-0.5 text-[8px] truncate" style={{ background: "#1A1A1A", color: "#DDD" }}>{photo.note}</div>
                                    )}
                                    <button onClick={() => removeCostumePhoto(selectedRole.id, idx)}
                                      className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                      style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>
                                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    )
                  })()}
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

      {/* Delete Role Confirmation Modal */}
      {deleteConfirmId && (() => {
        const role = roles.find(r => r.id === deleteConfirmId)
        if (!role) return null
        const nameMatch = deleteConfirmInput.trim() === role.name.trim()
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => { setDeleteConfirmId(null); setDeleteConfirmInput("") }}
          >
            <div
              className="w-80 rounded-xl p-6 shadow-2xl"
              style={{ background: "#fff" }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-1" style={{ color: "#1A1A1A" }}>Delete Character</h3>
              <p className="text-[11px] mb-4" style={{ color: "#888" }}>
                Type <strong style={{ color: "#EF4444" }}>{role.name}</strong> to confirm deletion. This cannot be undone.
              </p>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={e => setDeleteConfirmInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && nameMatch && confirmDeleteRole()}
                placeholder={`Type "${role.name}" to confirm`}
                autoFocus
                className="w-full h-8 px-3 text-sm rounded mb-4 focus:outline-none"
                style={{ background: "#F5F5F5", border: "1px solid #E0E0E0", color: "#1A1A1A" }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setDeleteConfirmId(null); setDeleteConfirmInput("") }}
                  className="flex-1 h-8 text-sm rounded"
                  style={{ background: "#F0F0F0", color: "#666" }}
                >Cancel</button>
                <button
                  onClick={confirmDeleteRole}
                  disabled={!nameMatch}
                  className="flex-1 h-8 text-sm rounded font-medium disabled:opacity-40 transition-opacity"
                  style={{ background: "#EF4444", color: "#fff" }}
                >Delete</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Image Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.88)" }}
          onClick={() => setLightboxImg(null)}
        >
          <div
            className="max-w-lg w-full rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "#1A1A1A" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Image */}
            <div className="relative" style={{ background: "#111" }}>
              <img src={lightboxImg.url} alt="" className="w-full max-h-[65vh] object-contain" />
              <button
                onClick={() => setLightboxImg(null)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {/* Prompt section */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#666" }}>AI Prompt</span>
                {lightboxImg.prompt && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lightboxImg.prompt || "").catch(() => {})
                      setLightboxCopied(true)
                      setTimeout(() => setLightboxCopied(false), 1500)
                    }}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors"
                    style={{ background: lightboxCopied ? "#1A3A1A" : "#2A2A2A", color: lightboxCopied ? "#4ADE80" : "#AAA" }}
                  >
                    {lightboxCopied ? (
                      <>✓ Copied</>
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              {lightboxImg.prompt ? (
                <p className="text-[11px] leading-relaxed" style={{ color: "#888" }}>{lightboxImg.prompt}</p>
              ) : (
                <p className="text-[11px] italic" style={{ color: "#444" }}>Prompt not available for this image</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Costume Generation Confirmation Modal */}
      {showCostumeConfirm && (() => {
        const roleCount = roles.length
        // Count eligible (role, scene) pairs — only scenes where the character appears
        let totalPairs = 0
        let pairsToGenerate = 0
        for (const role of roles) {
          const roleSceneKeys = characterScenes[role.name.trim().toUpperCase()] ?? []
          for (const scene of script.scenes || []) {
            const key = `E${scene.episodeNum}S${scene.sceneNum}`
            if (roleSceneKeys.length > 0 && !roleSceneKeys.includes(key)) continue
            totalPairs++
            const hasCostume = (role.costumes || []).some(c => c.scene === key)
            if (!hasCostume) pairsToGenerate++
          }
        }
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowCostumeConfirm(false)}
          >
            <div
              className="w-96 rounded-xl shadow-2xl overflow-hidden"
              style={{ background: "#FAFAFA", border: "1px solid #E0E0E0" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">👗</span>
                  <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Generate All Costumes</h3>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "#666" }}>
                  AI will generate costume designs for each character in the scenes they appear in, based on:
                </p>
              </div>
              <div className="mx-5 mb-3 rounded-lg px-4 py-3 space-y-1.5" style={{ background: "#F0F0F0" }}>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: "#555" }}>
                  <span>👤</span> <span>Character profile & casting specs (gender, age, physique)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: "#555" }}>
                  <span>🎬</span> <span>Scene heading, location & time of day</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: "#555" }}>
                  <span>🎭</span> <span>Script genre: <strong>{script.genre}</strong></span>
                </div>
              </div>
              <div className="mx-5 mb-4 rounded-lg px-4 py-3" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "#92400E" }}>Characters × their scenes</span>
                  <span className="font-semibold" style={{ color: "#92400E" }}>{totalPairs} pairs</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1">
                  <span style={{ color: "#92400E" }}>Already generated (skipped)</span>
                  <span className="font-semibold" style={{ color: "#065F46" }}>{totalPairs - pairsToGenerate}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1 pt-1" style={{ borderTop: "1px solid #FED7AA" }}>
                  <span className="font-medium" style={{ color: "#92400E" }}>To generate</span>
                  <span className="font-bold" style={{ color: "#9D174D" }}>{pairsToGenerate} costume images</span>
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => setShowCostumeConfirm(false)}
                  className="flex-1 h-9 rounded-lg text-[12px] font-medium"
                  style={{ background: "#E8E8E8", color: "#555" }}
                >Cancel</button>
                <button
                  onClick={() => { setShowCostumeConfirm(false); startGenerateAllCostumes() }}
                  disabled={pairsToGenerate === 0}
                  className="flex-1 h-9 rounded-lg text-[12px] font-semibold disabled:opacity-40"
                  style={{ background: "#9D174D", color: "#fff" }}
                >{pairsToGenerate === 0 ? "All Done ✓" : `Generate ${pairsToGenerate} Costumes`}</button>
              </div>
            </div>
          </div>
        )
      })()}

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
