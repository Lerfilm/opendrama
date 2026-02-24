"use client"

import { useState, useRef, useEffect } from "react"
import { PropItem, PropPhoto } from "./components/props-types"
import { PropsSidebar } from "./components/props-sidebar"
import { PropDetail } from "./components/prop-detail"
import { useUnsavedWarning } from "@/lib/use-unsaved-warning"
import { useAITasks } from "@/lib/ai-task-context"

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
  scenes: SceneRef[]
}

export function PropsWorkspace({ script }: { script: Script }) {
  const { markDirty, markClean } = useUnsavedWarning()
  const [props, setProps] = useState<PropItem[]>([])
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null)
  const [isAIExtracting, setIsAIExtracting] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isLoadedRef = useRef(false)
  const propsRef = useRef(props)
  propsRef.current = props

  // ── Global AI Task Context ──────────────────────────────────────────────
  const aiTasks = useAITasks()
  const propPhotoTask = aiTasks.tasks.find(t => t.type === "generate_all_prop_photos" && t.scriptId === script.id && t.status === "running")
  const isGeneratingAllPhotos = !!propPhotoTask
  const generateAllPhotosProgress = propPhotoTask?.progress ?? 0

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
        markClean()
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch { setSaveStatus("idle") }
    }, 800)
  }, [props, script.id, markClean])

  const selectedProp = props.find(p => p.id === selectedPropId) ?? null

  function addProp(name: string, category: string) {
    const newProp: PropItem = {
      id: `prop-${Date.now()}`,
      name,
      category,
      sceneIds: [],
      photos: [],
      isKey: false,
    }
    setProps(prev => [...prev, newProp])
    setSelectedPropId(newProp.id)
  }

  function updateProp(id: string, patch: Partial<PropItem>) {
    markDirty()
    setProps(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function deleteProp(id: string) {
    if (!confirm("Delete this prop?")) return
    setProps(prev => prev.filter(p => p.id !== id))
    if (selectedPropId === id) setSelectedPropId(null)
  }

  async function extractPropsFromScript() {
    setIsAIExtracting(true)
    const taskId = aiTasks.registerSingleTask("extract_props", "Extracting Props", 10000, script.id)
    try {
      const res = await fetch("/api/ai/extract-props", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id }),
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
        aiTasks.completeSingleTask(taskId)
      } else {
        aiTasks.failSingleTask(taskId, "Extraction failed")
        alert("AI extraction failed")
      }
    } catch (e: any) {
      aiTasks.failSingleTask(taskId, e?.message)
    } finally {
      setIsAIExtracting(false)
    }
  }

  function generateAllPhotos() {
    if (aiTasks.isRunning("generate_all_prop_photos", script.id)) return
    const currentProps = propsRef.current
    if (currentProps.length === 0) return

    aiTasks.startBatchTask({
      type: "generate_all_prop_photos",
      label: "Generating Prop Photos",
      scriptId: script.id,
      items: currentProps.map(p => ({ id: p.id, label: p.name })),
      estimatedMsPerItem: 12000,
      executeFn: async (propId, signal) => {
        const prop = propsRef.current.find(p => p.id === propId)
        if (!prop) return null
        const res = await fetch("/api/ai/generate-prop-photo", {
          signal, method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propName: prop.name,
            category: prop.category,
            description: prop.description?.trim() || "",
            scriptId: script.id,
            sceneIds: prop.sceneIds || [],
          }),
        })
        if (!res.ok) throw new Error(`Prop photo failed: ${res.status}`)
        const data = await res.json()
        return { url: data.url, propId }
      },
      onItemDone: (_propId, result) => {
        if (result?.url) {
          setProps(prev => prev.map(p =>
            p.id === result.propId
              ? { ...p, photos: [...p.photos, { url: result.url, isApproved: false }] }
              : p
          ))
        }
      },
    })
  }

  async function uploadPhoto(propId: string, file: File) {
    setUploadingFor(propId)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/role-image", { method: "POST", body: fd })
      if (!res.ok) { alert("Upload failed"); return }
      const { url } = await res.json()
      const newPhoto: PropPhoto = { url, isApproved: false }
      setProps(prev => prev.map(p => p.id === propId
        ? { ...p, photos: [...p.photos, newPhoto] }
        : p
      ))
    } finally {
      setUploadingFor(null)
    }
  }

  return (
    <div className="h-full flex" style={{ background: "#E8E8E8" }}>
      <PropsSidebar
        props={props}
        selectedPropId={selectedPropId}
        saveStatus={saveStatus}
        isAIExtracting={isAIExtracting}
        isGeneratingAllPhotos={isGeneratingAllPhotos}
        generateAllPhotosProgress={generateAllPhotosProgress}
        onSelectProp={setSelectedPropId}
        onDeleteProp={deleteProp}
        onAddProp={addProp}
        onAIExtract={extractPropsFromScript}
        onGenerateAllPhotos={generateAllPhotos}
      />
      <PropDetail
        selectedProp={selectedProp}
        allProps={props}
        uploadingFor={uploadingFor}
        isAIExtracting={isAIExtracting}
        onUpdateProp={updateProp}
        onUploadPhoto={uploadPhoto}
        onAIExtract={extractPropsFromScript}
      />
    </div>
  )
}
