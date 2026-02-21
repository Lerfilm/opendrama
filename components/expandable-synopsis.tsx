"use client"

import { useState } from "react"
import { t } from "@/lib/i18n"
import { ChevronDown, ChevronUp } from "@/components/icons"

export default function ExpandableSynopsis({
  text,
  maxLines = 3,
}: {
  text: string
  maxLines?: number
}) {
  const [expanded, setExpanded] = useState(false)

  if (!text) return null

  return (
    <div>
      <p
        className={`text-sm text-muted-foreground leading-relaxed ${
          expanded ? "" : `line-clamp-${maxLines}`
        }`}
        style={expanded ? undefined : { WebkitLineClamp: maxLines, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {text}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1 text-xs text-primary font-medium flex items-center gap-0.5 hover:underline"
      >
        {expanded ? (
          <>
            {t("series.showLess")}
            <ChevronUp className="w-3 h-3" />
          </>
        ) : (
          <>
            {t("series.readMore")}
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>
    </div>
  )
}
