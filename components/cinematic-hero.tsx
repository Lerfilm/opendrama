"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { Play, Sparkles, Coins } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { t } from "@/lib/i18n"
import { getGenreGradient } from "@/lib/genre-colors"
import { StarParticles } from "@/components/star-particles"

type FeaturedSeries = {
  id: string
  title: string
  coverWide: string | null
  coverUrl: string | null
  genre: string | null
  episodeCount: number
}

type Props = {
  items: FeaturedSeries[]
  userName?: string | null
  availableCoins?: number
  isLoggedIn?: boolean
}

export default function CinematicHero({ items, userName, availableCoins = 0, isLoggedIn }: Props) {
  const [current, setCurrent] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const goTo = useCallback((index: number) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrent(index)
    setTimeout(() => setIsTransitioning(false), 600)
  }, [isTransitioning])

  useEffect(() => {
    if (items.length <= 1) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % items.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [items.length])

  if (items.length === 0) {
    // Fallback: plain hero if no featured items
    return (
      <div className="hero-gradient relative overflow-hidden rounded-b-3xl px-5 pt-14 pb-10 text-center">
        <StarParticles count={20} />
        <h1 className="gradient-text text-3xl font-black tracking-tight">{t("home.slogan")}</h1>
        <p className="text-white/50 text-sm mt-2 mb-6">{t("home.sloganSub")}</p>
        <Link href="/discover">
          <Button className="rounded-full bg-white text-black font-semibold px-6">
            <Play className="w-4 h-4 mr-1.5" />{t("home.exploreNow")}
          </Button>
        </Link>
      </div>
    )
  }

  const series = items[current]
  const heroImage = series.coverWide || series.coverUrl

  return (
    <div className="relative overflow-hidden rounded-b-3xl" style={{ minHeight: "70vw", maxHeight: "520px" }}>
      {/* ── Background: drama poster ── */}
      {heroImage ? (
        <Image
          src={heroImage}
          alt={series.title}
          fill
          className={`object-cover transition-opacity duration-700 ${isTransitioning ? "opacity-60" : "opacity-100"}`}
          priority
          sizes="100vw"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${getGenreGradient(series.genre)}`} />
      )}

      {/* ── Gradient layers ── */}
      {/* Top: dark for readability of top bar */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/10 to-transparent" />
      {/* Bottom: dark for drama info */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      {/* Subtle left vignette */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

      <StarParticles count={12} />

      <div className="relative z-10 flex flex-col justify-between h-full" style={{ minHeight: "inherit" }}>

        {/* ── TOP BAR ── */}
        <div className="px-5 pt-11 flex items-center justify-between">
          <div>
            <span className="text-white font-black text-sm tracking-wider uppercase">OpenDrama</span>
            {userName && (
              <p className="text-white/40 text-[10px] mt-0.5">{t("home.greeting", { name: userName })}</p>
            )}
            {!isLoggedIn && !userName && (
              <p className="text-white/40 text-[10px] mt-0.5">{t("home.welcomeGuest")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Link href="/recharge">
                <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5">
                  <Coins className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-white text-xs font-semibold">{availableCoins}</span>
                </div>
              </Link>
            ) : (
              <Link href="/auth/signin">
                <Button size="sm" className="rounded-full bg-white/15 backdrop-blur border border-white/20 text-white hover:bg-white/25 text-xs h-7 px-3">
                  {t("common.login")}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* ── CENTER: Slogan ── */}
        <div className="px-5 py-4 text-center">
          <h1 className="gradient-text text-2xl sm:text-3xl font-black tracking-tight leading-tight drop-shadow-lg">
            {t("home.slogan")}
          </h1>
          <p className="text-white/50 text-[11px] mt-1 hidden sm:block">{t("home.sloganSub")}</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Link href="/discover">
              <Button size="sm" className="rounded-full bg-white/95 text-black hover:bg-white font-semibold px-4 h-7 text-xs shadow-lg">
                <Play className="w-3 h-3 mr-1" />{t("home.exploreNow")}
              </Button>
            </Link>
            <Link href="/studio">
              <Button size="sm" variant="outline" className="rounded-full border-white/30 bg-white/10 backdrop-blur text-white hover:bg-white/20 px-4 h-7 text-xs font-medium">
                <Sparkles className="w-3 h-3 mr-1" />{t("home.startCreate")}
              </Button>
            </Link>
          </div>
        </div>

        {/* ── BOTTOM: Featured drama info ── */}
        <div className="px-5 pb-5">
          {/* Drama info */}
          <div className="mb-3">
            <Badge className="text-[9px] px-2 py-0.5 bg-primary/80 backdrop-blur-sm border-none mb-2">
              {t("home.featured")}
            </Badge>
            <h2 className="text-white text-lg font-bold leading-tight drop-shadow-md line-clamp-1">
              {series.title}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {series.genre && (
                <span className="text-white/50 text-[10px] uppercase tracking-wide">{series.genre}</span>
              )}
              <span className="text-white/30 text-[10px]">·</span>
              <span className="text-white/50 text-[10px]">{t("home.episodeCount", { count: series.episodeCount })}</span>
            </div>
          </div>

          {/* Bottom row: Watch Now + indicator dots */}
          <div className="flex items-center justify-between">
            <Link href={`/series/${series.id}`}>
              <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 text-white font-semibold px-5 h-8 text-xs shadow-lg shadow-primary/30">
                <Play className="w-3 h-3 mr-1.5" />{t("home.watchNow")}
              </Button>
            </Link>

            {/* Indicator dots */}
            {items.length > 1 && (
              <div className="flex gap-1.5">
                {items.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === current ? "w-5 bg-white" : "w-1 bg-white/35 hover:bg-white/55"
                    }`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
