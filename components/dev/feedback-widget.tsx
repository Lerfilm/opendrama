"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { t } from "@/lib/i18n"

const CATEGORIES = [
  { key: "general", labelKey: "dev.feedback.categoryGeneral" },
  { key: "bug", labelKey: "dev.feedback.categoryBug" },
  { key: "feature", labelKey: "dev.feedback.categoryFeature" },
] as const

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState("general")
  const [content, setContent] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const pathname = usePathname()

  const handleSubmit = async () => {
    if (!content.trim()) return
    setStatus("sending")
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, content: content.trim(), page: pathname }),
      })
      if (res.ok) {
        setStatus("sent")
        setTimeout(() => {
          setOpen(false)
          setContent("")
          setCategory("general")
          setStatus("idle")
        }, 1500)
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg transition-all hover:scale-105"
        style={{ background: "#2C2C30", color: "#CCC", border: "1px solid #3A3A3E" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-xs font-medium">{t("dev.feedback.button")}</span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-14 right-4 z-50 w-80 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: "#1E1E22", border: "1px solid #3A3A3E", color: "#E8E8EA" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #2C2C30" }}>
            <h3 className="text-sm font-semibold">{t("dev.feedback.title")}</h3>
          </div>

          <div className="p-4 space-y-3">
            {/* Category selector */}
            <div className="flex gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
                  style={{
                    background: category === cat.key ? "#5B8DEF" : "#2C2C30",
                    color: category === cat.key ? "#FFF" : "#999",
                  }}
                >
                  {t(cat.labelKey)}
                </button>
              ))}
            </div>

            {/* Content */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("dev.feedback.placeholder")}
              rows={4}
              maxLength={5000}
              className="w-full text-sm px-3 py-2 rounded-lg resize-none focus:outline-none focus:ring-1"
              style={{ background: "#2C2C30", border: "1px solid #3A3A3E", color: "#E8E8EA" }}
            />

            {/* Status message */}
            {status === "sent" && (
              <p className="text-xs text-green-400">{t("dev.feedback.success")}</p>
            )}
            {status === "error" && (
              <p className="text-xs text-red-400">{t("dev.feedback.error")}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={status === "sending" || status === "sent" || !content.trim()}
              className="w-full h-8 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: "#5B8DEF", color: "#FFF" }}
            >
              {status === "sending" ? t("dev.feedback.submitting") : t("dev.feedback.submit")}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
