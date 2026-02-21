"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Play, Loader2 } from "@/components/icons"
import { t } from "@/lib/i18n"

interface ContinueItem {
  seriesId: string
  seriesTitle: string
  coverUrl: string | null
  episodeId: string
  episodeNum: number
  completedRate: number
}

export default function ContinueWatching() {
  const [items, setItems] = useState<ContinueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/continue-watching")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items)) setItems(data.items)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (items.length === 0) return null

  return (
    <div className="px-4 mt-6">
      <h2 className="text-lg font-bold mb-3">{t("home.continueWatching")}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item) => (
          <Link
            key={item.seriesId}
            href={`/episode/${item.episodeId}`}
            className="shrink-0 w-32"
          >
            <div className="relative aspect-[2/3] bg-muted rounded-xl overflow-hidden mb-2">
              {item.coverUrl ? (
                <Image
                  src={item.coverUrl}
                  alt={item.seriesTitle}
                  fill
                  className="object-cover"
                  sizes="128px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play className="w-6 h-6 opacity-30" />
                </div>
              )}
              {/* Play overlay */}
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
                  <Play className="w-5 h-5 text-black" />
                </div>
              </div>
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${Math.round(item.completedRate * 100)}%` }}
                />
              </div>
            </div>
            <p className="text-xs font-medium line-clamp-1">{item.seriesTitle}</p>
            <p className="text-[10px] text-muted-foreground">
              {t("home.resumeEp", { num: item.episodeNum })} · {t("home.progress", { percent: Math.round(item.completedRate * 100) })}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
