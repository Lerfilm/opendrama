"use client"

import { useState, useCallback, useEffect } from "react"
import { getModelById, getDefaultModel, getDefaultResolution, type ModelConfig } from "@/lib/model-config"

const STORAGE_KEY_PREFIX = "opendrama:model:"

interface ModelPreference {
  modelId: string
  resolution: string
}

function readPreference(feature: "theater" | "studio"): ModelPreference {
  if (typeof window === "undefined") {
    const def = getDefaultModel(feature)
    return { modelId: def.id, resolution: getDefaultResolution(def.id) }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + feature)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Validate model still exists
      const model = getModelById(parsed.modelId)
      if (model) {
        const res = model.resolutions.includes(parsed.resolution) ? parsed.resolution : getDefaultResolution(model.id)
        return { modelId: model.id, resolution: res }
      }
    }
  } catch {}
  const def = getDefaultModel(feature)
  return { modelId: def.id, resolution: getDefaultResolution(def.id) }
}

function writePreference(feature: "theater" | "studio", pref: ModelPreference) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + feature, JSON.stringify(pref))
  } catch {}
}

/**
 * Hook to read/write model preference for a feature.
 * Stored in localStorage, persists across sessions.
 */
export function useModelPreference(feature: "theater" | "studio") {
  const [pref, setPref] = useState<ModelPreference>(() => readPreference(feature))

  // Hydrate from localStorage on mount (SSR safety)
  useEffect(() => {
    setPref(readPreference(feature))
  }, [feature])

  const setModel = useCallback((modelId: string) => {
    const model = getModelById(modelId)
    if (!model) return
    const resolution = model.resolutions.includes(pref.resolution) ? pref.resolution : getDefaultResolution(modelId)
    const next = { modelId, resolution }
    setPref(next)
    writePreference(feature, next)
  }, [feature, pref.resolution])

  const setResolution = useCallback((resolution: string) => {
    const next = { ...pref, resolution }
    setPref(next)
    writePreference(feature, next)
  }, [feature, pref])

  const model: ModelConfig | undefined = getModelById(pref.modelId)

  return {
    modelId: pref.modelId,
    resolution: pref.resolution,
    model,
    setModel,
    setResolution,
  }
}
