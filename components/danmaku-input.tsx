"use client"

import { useState, useRef } from "react"
import { t } from "@/lib/i18n"

export default function DanmakuInput({
  episodeId,
  currentTime,
  onSend,
  disabled = false,
}: {
  episodeId: string
  currentTime: number
  onSend?: (content: string, timestamp: number) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = async () => {
    if (!value.trim() || sending || disabled) return

    const content = value.trim()
    const ts = currentTime

    setSending(true)
    setValue("")

    try {
      const res = await fetch("/api/danmaku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          content,
          timestamp: ts,
        }),
      })

      if (res.ok) {
        onSend?.(content, ts)
        setExpanded(false)
      }
    } catch {
      // restore on error
      setValue(content)
    } finally {
      setSending(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => {
          setExpanded(true)
          setTimeout(() => inputRef.current?.focus(), 100)
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white/60 text-xs hover:bg-white/20 transition-colors"
      >
        <span className="text-base leading-none">💬</span>
        <span>{t("danmaku.send")}</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 w-full max-w-sm">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 100))}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend()
          if (e.key === "Escape") setExpanded(false)
        }}
        placeholder={t("danmaku.placeholder")}
        className="flex-1 bg-white/10 backdrop-blur-sm text-white text-xs rounded-full px-3 py-2 placeholder:text-white/40 outline-none focus:ring-1 focus:ring-white/30"
        maxLength={100}
        disabled={disabled || sending}
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || sending || disabled}
        className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 shrink-0"
      >
        {sending ? "..." : t("danmaku.send")}
      </button>
      <button
        onClick={() => setExpanded(false)}
        className="text-white/40 hover:text-white/70 text-xs shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
