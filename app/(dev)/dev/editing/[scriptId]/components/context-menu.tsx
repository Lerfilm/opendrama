"use client"

import { useEffect, useRef } from "react"
import { t } from "@/lib/i18n"
import type { VideoSegment } from "../lib/editing-helpers"

interface ContextMenuProps {
  x: number
  y: number
  segment: VideoSegment
  onClose: () => void
  onEditRegenerate: (seg: VideoSegment) => void
  onQuickRegenerate: (seg: VideoSegment) => void
  onDownload: (seg: VideoSegment) => void
}

export function ContextMenu({ x, y, segment, onClose, onEditRegenerate, onQuickRegenerate, onDownload }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // Clamp position to viewport
  const left = Math.min(x, window.innerWidth - 180)
  const top = Math.min(y, window.innerHeight - 140)

  const items = [
    {
      label: t("dev.editing.editRegenerate"),
      icon: "✏️",
      action: () => { onEditRegenerate(segment); onClose() },
      enabled: true,
    },
    {
      label: t("dev.editing.quickRegenerate"),
      icon: "🔄",
      action: () => { onQuickRegenerate(segment); onClose() },
      enabled: segment.status === "done",
    },
    {
      label: t("dev.editing.download"),
      icon: "↓",
      action: () => { onDownload(segment); onClose() },
      enabled: segment.status === "done" && !!segment.videoUrl,
    },
  ]

  return (
    <div
      ref={ref}
      className="fixed z-[100] rounded-lg shadow-xl py-1 overflow-hidden"
      style={{ left, top, background: "#2C2C30", border: "1px solid #3A3A3E", minWidth: 160 }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          disabled={!item.enabled}
          className="w-full text-left flex items-center gap-2 px-3 py-2 text-[11px] transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none"
          style={{ color: "#CCC" }}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
