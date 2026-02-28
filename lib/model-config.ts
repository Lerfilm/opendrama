/**
 * Centralized model configuration — signal strength, availability, features.
 * Used by Settings page, Theater, Studio, Editing workspaces.
 */

export interface ModelConfig {
  id: string
  name: string
  provider: "seedance" | "jimeng"
  resolutions: string[]
  maxDuration: number
  audio: boolean
  /** Quality tier: 1 = basic, 2 = mid, 3 = top */
  signal: 1 | 2 | 3
  /** Whether the model API is currently available */
  available: boolean
  /** Which features this model supports */
  features: ("theater" | "studio")[]
}

export const ALL_MODELS: ModelConfig[] = [
  { id: "seedance_2_0",          name: "Seedance 2.0",        provider: "seedance", resolutions: ["720p", "480p"],   maxDuration: 15, audio: true,  signal: 3, available: false, features: ["theater", "studio"] },
  { id: "seedance_1_5_pro",      name: "Seedance 1.5 Pro",    provider: "seedance", resolutions: ["1080p", "720p"], maxDuration: 12, audio: true,  signal: 3, available: true,  features: ["theater", "studio"] },
  { id: "seedance_1_0_pro",      name: "Seedance 1.0 Pro",    provider: "seedance", resolutions: ["1080p", "720p"], maxDuration: 12, audio: false, signal: 2, available: true,  features: ["theater", "studio"] },
  { id: "seedance_1_0_pro_fast", name: "Seedance 1.0 Fast",   provider: "seedance", resolutions: ["1080p", "720p"], maxDuration: 12, audio: false, signal: 1, available: true,  features: ["studio"] },
  { id: "jimeng_3_0_pro",        name: "Jimeng 3.0 Pro",      provider: "jimeng",   resolutions: ["1080p"],         maxDuration: 10, audio: false, signal: 3, available: true,  features: ["studio"] },
  { id: "jimeng_3_0",            name: "Jimeng 3.0",          provider: "jimeng",   resolutions: ["1080p", "720p"], maxDuration: 10, audio: false, signal: 2, available: true,  features: ["studio"] },
  { id: "jimeng_s2_pro",         name: "Jimeng S2 Pro",       provider: "jimeng",   resolutions: ["720p"],          maxDuration: 10, audio: false, signal: 1, available: true,  features: ["studio"] },
]

/** Models available for a given feature */
export function getModelsForFeature(feature: "theater" | "studio"): ModelConfig[] {
  return ALL_MODELS.filter(m => m.features.includes(feature))
}

/** Get a model by id */
export function getModelById(id: string): ModelConfig | undefined {
  return ALL_MODELS.find(m => m.id === id)
}

/** Default model for a feature (first available) */
export function getDefaultModel(feature: "theater" | "studio"): ModelConfig {
  const models = getModelsForFeature(feature)
  return models.find(m => m.available) ?? models[0]
}

/** Default resolution for a model */
export function getDefaultResolution(modelId: string): string {
  const model = getModelById(modelId)
  if (!model) return "720p"
  return model.resolutions.includes("720p") ? "720p" : model.resolutions[0]
}
