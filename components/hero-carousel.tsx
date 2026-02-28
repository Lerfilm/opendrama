"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { Play } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { getGenreGradient } from "@/lib/genre-colors"

type FeaturedSeries = {
  id: string
  title: string
  coverWide: string | null
  coverUrl: string | null
  genre: string | null
  episodeCount: number
}

export default function HeroCarousel({ items }: { items: FeaturedSeries[] }) {
  const [current, setCurrent] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const goTo = useCallback((index: number) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrent(index)
    setTimeout(() => setIsTransitioning(false), 500)
  }, [isTransitioning])

  // Auto-rotate every 5 seconds
  useEffect(() => {
    if (items.length <= 1) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % items.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [items.length])

  if (items.length === 0) return null

  const series = items[current]
  const heroImage = series.coverWide || series.coverUrl

  return (
    <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[240px] sm:max-h-[300px] rounded-2xl overflow-hidden group">
      {/* Background image or gradient */}
      {heroImage ? (
        <Image
          src={heroImage}
          alt={series.title}
          fill
          className="object-cover transition-opacity duration-500"
          priority
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 80vw"
        />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)}`} />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 space-y-2">
        {/* Featured badge */}
        <Badge className="text-[10px] bg-primary/90 text-primary-foreground border-none">
          {t("home.featured")}
        </Badge>

        {/* Title */}
        <h2 className="text-white text-lg sm:text-2xl font-bold leading-tight line-clamp-2">
          {series.title}
        </h2>

        {/* Meta */}
        <div className="flex items-center gap-2 text-white/60 text-xs">
          {series.genre && (
            <Badge variant="outline" className="text-[10px] border-white/30 text-white/70">
              {series.genre}
            </Badge>
          )}
          <span>{t("home.episodeCount", { count: series.episodeCount })}</span>
        </div>

        {/* CTA */}
        <Link href={`/series/${series.id}`}>
          <Button size="sm" className="rounded-full mt-1 px-5 text-xs font-semibold">
            <Play className="w-3.5 h-3.5 mr-1" />
            {t("home.watchNow")}
          </Button>
        </Link>
      </div>

      {/* Indicator dots */}
      {items.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current
                  ? "w-5 bg-white"
                  : "w-1.5 bg-white/40 hover:bg-white/60"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
