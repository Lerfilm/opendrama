"use client"

import { useState, useCallback } from "react"
import { t } from "@/lib/i18n"

interface PromptToolbarProps {
  value: string
  onSave?: () => void | Promise<void>
  onValueChange?: (v: string) => void
  saving?: boolean
  /** "dark" for Dev workspace, "light" for Studio */
  theme?: "dark" | "light"
  className?: string
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)
}

export function PromptToolbar({
  value,
  onSave,
  onValueChange,
  saving,
  theme = "dark",
  className = "",
}: PromptToolbarProps) {
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [translating, setTranslating] = useState(false)

  const isDark = theme === "dark"
  const btnBase = isDark
    ? "px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
    : "px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
  const btnNormal = isDark
    ? "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white/90"
    : "bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800"
  const btnActive = isDark
    ? "bg-emerald-500/20 text-emerald-300"
    : "bg-emerald-100 text-emerald-700"
  const btnDisabled = isDark
    ? "bg-white/5 text-white/30 cursor-not-allowed"
    : "bg-gray-50 text-gray-300 cursor-not-allowed"

  const handleCopy = useCallback(async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea")
      ta.value = value
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }, [value])

  const handleSave = useCallback(async () => {
    if (!onSave) return
    await onSave()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [onSave])

  const handleTranslate = useCallback(async () => {
    if (!value || !onValueChange || translating) return
    setTranslating(true)
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      })
      if (!res.ok) throw new Error("Translation failed")
      const data = await res.json()
      if (data.translation) {
        onValueChange(data.translation)
      }
    } catch (err) {
      console.error("Translate error:", err)
    } finally {
      setTranslating(false)
    }
  }, [value, onValueChange, translating])

  const isChinese = hasChinese(value)
  const translateLabel = translating
    ? t("dev.promptToolbar.translating")
    : isChinese ? t("dev.promptToolbar.translateZhToEn") : t("dev.promptToolbar.translateEnToZh")

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Save button */}
      {onSave && (
        <button
          onClick={handleSave}
          disabled={saving || saved || !value}
          className={`${btnBase} ${saved ? btnActive : saving || !value ? btnDisabled : btnNormal}`}
          title={t("dev.promptToolbar.save")}
        >
          {saved ? "✓" : saving ? "..." : "💾"} {saved ? t("dev.promptToolbar.saved") : t("dev.promptToolbar.save")}
        </button>
      )}

      {/* Translate button */}
      {onValueChange && (
        <button
          onClick={handleTranslate}
          disabled={translating || !value}
          className={`${btnBase} ${translating || !value ? btnDisabled : btnNormal}`}
          title={translateLabel}
        >
          {translating ? (
            <span className="inline-flex items-center gap-1">
              <span className="animate-spin text-[8px]">⟳</span> {translateLabel}
            </span>
          ) : (
            <>🔄 {translateLabel}</>
          )}
        </button>
      )}

      {/* Copy button */}
      <button
        onClick={handleCopy}
        disabled={!value}
        className={`${btnBase} ${copied ? btnActive : !value ? btnDisabled : btnNormal}`}
        title={t("dev.promptToolbar.copy")}
      >
        {copied ? "✓ " + t("dev.promptToolbar.copied") : "📋 " + t("dev.promptToolbar.copy")}
      </button>
    </div>
  )
}
