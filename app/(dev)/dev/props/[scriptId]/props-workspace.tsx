"use client"

import { useState, useRef, useEffect } from "react"
import { PropItem, PropPhoto } from "./components/props-types"
import { PropsSidebar } from "./components/props-sidebar"
import { PropDetail } from "./components/prop-detail"
import { useUnsavedWarning } from "@/lib/use-unsaved-warning"

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
  const [isGeneratingAllPhotos, setIsGeneratingAllPhotos] = useState(false)
  const [generateAllPhotosProgress, setGenerateAllPhotosProgress] = useState(0)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isLoadedRef = useRef(false)

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
      } else {
        alert("AI extraction failed")
      }
    } finally {
      setIsAIExtracting(false)
    }
  }

  async function generateAllPhotos() {
    if (props.length === 0) return
    setIsGeneratingAllPhotos(true)
    setGenerateAllPhotosProgress(0)
    for (let i = 0; i < props.length; i++) {
      const prop = props[i]
      try {
        const res = await fetch("/api/ai/generate-prop-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propName: prop.name,
            category: prop.category,
            description: prop.description?.trim() || "",
          }),
        })
        const data = await res.json()
        if (data.url) {
          setProps(prev => prev.map(p =>
            p.id === prop.id
              ? { ...p, photos: [...p.photos, { url: data.url, isApproved: false }] }
              : p
          ))
        }
      } catch { /* skip failed prop */ }
      setGenerateAllPhotosProgress(Math.round(((i + 1) / props.length) * 100))
    }
    setIsGeneratingAllPhotos(false)
    setGenerateAllPhotosProgress(0)
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
