"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SignalIcon } from "@/components/signal-icon"
import { getModelsForFeature, getModelById, getDefaultModel, getDefaultResolution, type ModelConfig } from "@/lib/model-config"
import { MODEL_PRICING } from "@/lib/model-pricing"
import { t } from "@/lib/i18n"

const STORAGE_KEY_PREFIX = "opendrama:model:"

interface Pref { modelId: string; resolution: string }

function readPref(feature: string): Pref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + feature)
    if (raw) {
      const p = JSON.parse(raw)
      const m = getModelById(p.modelId)
      if (m) return { modelId: m.id, resolution: m.resolutions.includes(p.resolution) ? p.resolution : getDefaultResolution(m.id) }
    }
  } catch {}
  const def = getDefaultModel(feature as "theater" | "studio")
  return { modelId: def.id, resolution: getDefaultResolution(def.id) }
}

function writePref(feature: string, pref: Pref) {
  try { localStorage.setItem(STORAGE_KEY_PREFIX + feature, JSON.stringify(pref)) } catch {}
}

function FeatureSection({ feature, label }: { feature: "theater" | "studio"; label: string }) {
  const [pref, setPref] = useState<Pref>({ modelId: "", resolution: "" })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setPref(readPref(feature))
    setMounted(true)
  }, [feature])

  const models = getModelsForFeature(feature)
  const selectedModel = getModelById(pref.modelId)

  function selectModel(m: ModelConfig) {
    if (!m.available) return
    const res = m.resolutions.includes(pref.resolution) ? pref.resolution : getDefaultResolution(m.id)
    const next = { modelId: m.id, resolution: res }
    setPref(next)
    writePref(feature, next)
  }

  function selectResolution(r: string) {
    const next = { ...pref, resolution: r }
    setPref(next)
    writePref(feature, next)
  }

  if (!mounted) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</h3>
      <div className="space-y-1">
        {models.map(m => {
          const selected = pref.modelId === m.id
          const pricing = MODEL_PRICING[m.id]
          const minPrice = pricing ? Math.min(...Object.values(pricing)) : 0
          const costLabel = minPrice > 0 ? `${Math.ceil(minPrice * 2 / 100)}+` : ""

          return (
            <button
              key={m.id}
              onClick={() => selectModel(m)}
              disabled={!m.available}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                selected
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : m.available
                    ? "hover:bg-accent"
                    : "opacity-40 cursor-not-allowed"
              }`}
            >
              <SignalIcon signal={m.signal} available={m.available} size={14} />
              <span className={`text-sm flex-1 ${selected ? "font-medium" : ""}`}>
                {m.name}
              </span>
              {m.audio && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {t("settings.modelAudio")}
                </span>
              )}
              {costLabel && (
                <span className="text-[10px] text-muted-foreground">
                  {costLabel} {t("common.coins").toLowerCase()}
                </span>
              )}
              {!m.available && (
                <span className="text-[10px] text-muted-foreground italic">
                  {t("settings.modelUnavailable")}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Resolution selector */}
      {selectedModel && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">{t("settings.resolution")}:</span>
          <div className="flex gap-1">
            {selectedModel.resolutions.map(r => (
              <button
                key={r}
                onClick={() => selectResolution(r)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  pref.resolution === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted-foreground/10"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {selectedModel.maxDuration && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              {t("settings.modelMaxDur").replace("{n}", String(selectedModel.maxDuration))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function ModelSettingsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.aiModels")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FeatureSection feature="theater" label={t("settings.modelTheater")} />
        <div className="border-t" />
        <FeatureSection feature="studio" label={t("settings.modelStudio")} />
      </CardContent>
    </Card>
  )
}
