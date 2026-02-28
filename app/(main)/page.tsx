export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Coins, PenTool, Sparkles, Compass, Code } from "@/components/icons"
import Link from "next/link"
import Image from "next/image"
import { createT, getLocaleAsync } from "@/lib/i18n"
import ContinueWatching from "@/components/continue-watching"
import { getGenreGradient } from "@/lib/genre-colors"
import { resolveImageUrl } from "@/lib/storage"
import CinematicHero from "@/components/cinematic-hero"
import FlightyLanding from "@/components/flighty-landing"
import DailyCheckIn from "@/components/daily-checkin"

export default async function HomePage() {
  const session = await auth()
  const t = createT(await getLocaleAsync())

  const userBalance = session?.user?.id
    ? await prisma.userBalance.findUnique({
        where: { userId: session.user.id },
        select: { balance: true, reserved: true },
      })
    : null
  const availableCoins = userBalance
    ? userBalance.balance - userBalance.reserved
    : 0

  const seriesList = await prisma.series.findMany({
    where: { status: "active" },
    select: {
      id: true,
      title: true,
      description: true,
      coverUrl: true,
      coverTall: true,
      coverWide: true,
      genre: true,
      tags: true,
      description: true,
      viewCount: true,
      status: true,
      viewCount: true,
      createdAt: true,
      episodes: {
        select: { id: true },
      },
    },
    orderBy: { viewCount: "desc" },
    take: 20,
  })

  const seriesWithCount = seriesList.map((s) => ({
    ...s,
    coverUrl: resolveImageUrl(s.coverUrl),
    coverTall: resolveImageUrl(s.coverTall),
    coverWide: resolveImageUrl(s.coverWide),
    episodeCount: s.episodes.length,
    // Resolve all image URLs through the R2 proxy so they work globally
    coverUrl: resolveImageUrl(s.coverUrl),
    coverTall: resolveImageUrl(s.coverTall),
    coverWide: resolveImageUrl(s.coverWide),
  }))

  // Split into Hot Picks (has episodes) and Coming Soon (no episodes)
  const hotPicks = seriesWithCount.filter((s) => s.episodeCount > 0)
  const comingSoon = seriesWithCount.filter((s) => s.episodeCount === 0)

  // Featured series for hero carousel (has cover + episodes)
  // Prefer coverTall (AI-generated R2 poster) or only use coverWide if it's an R2 proxy URL
  // (coverWide may still hold old Unsplash URLs from before the AI poster migration)
  const featured = seriesWithCount.filter(
    (s) => s.episodeCount > 0 && (s.coverTall || s.coverUrl || s.coverWide || s.genre)
  ).slice(0, 5).map((s) => {
    const safeWide = s.coverWide?.startsWith("/api/r2/") ? s.coverWide : null
    return {
      id: s.id,
      title: s.title,
      coverWide: s.coverTall || safeWide || s.coverUrl,
      coverUrl: s.coverUrl,
      genre: s.genre,
      episodeCount: s.episodeCount,
    }
  })

  // Featured cards (latest + rarest)
  const featuredCards = await prisma.card.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      name: true,
      rarity: true,
      imageUrl: true,
      series: { select: { title: true } },
    },
  })

  // New arrivals (created within 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const newArrivals = seriesWithCount.filter(
    (s) => s.createdAt >= sevenDaysAgo && s.episodeCount > 0
  )

  return (
    <div className="min-h-screen bg-background">

      {/* ===== Flighty-Style Landing (Mobile) ===== */}
      <div className="md:hidden">
        <FlightyLanding
          items={featured}
          userName={session?.user?.name}
          availableCoins={availableCoins}
          isLoggedIn={!!session?.user}
          hotPicks={hotPicks}
        />
      </div>

      {/* ===== Desktop Layout ===== */}
      <div className="hidden md:block">
        {/* Desktop hero */}
        <div className="hero-gradient relative overflow-hidden rounded-b-3xl px-8 pt-14 pb-10 text-center">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-orange-500/15 rounded-full blur-3xl" />
          <h1 className="gradient-text text-4xl lg:text-5xl font-black tracking-tight mb-3">{t("home.slogan")}</h1>
          <p className="text-white/55 text-base mb-6 max-w-md mx-auto">{t("home.sloganSub")}</p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/discover">
              <Button className="rounded-full bg-white text-black hover:bg-white/90 px-7 h-10 font-semibold">
                <Play className="w-4 h-4 mr-1.5" />{t("home.exploreNow")}
              </Button>
            </Link>
            <Link href="/studio">
              <Button variant="outline" className="rounded-full border-white/40 text-white bg-white/10 hover:bg-white/20 px-7 h-10 font-semibold">
                {t("home.startCreate")}
              </Button>
            </Link>
          </div>
          <p className="text-white/20 text-[10px] tracking-[0.2em] uppercase font-light mt-6">{t("home.lerfilmProduction")}</p>
        </div>

        {/* Desktop Quick Access */}
        <div className="px-4 md:px-6 mt-4">
          <div className="grid grid-cols-2 gap-2.5">
            <Link href="/discover">
              <div className="relative overflow-hidden rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-br from-orange-500/90 to-rose-600/90 hover:opacity-90 transition-opacity">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-tight">{t("home.discoverTitle")}</p>
                  <p className="text-white/70 text-[10px] mt-0.5">{t("home.discoverDesc")}</p>
                </div>
              </div>
            </Link>
            <Link href="/studio">
              <div className="relative overflow-hidden rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-br from-violet-600/90 to-indigo-700/90 hover:opacity-90 transition-opacity">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <PenTool className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-tight">{t("home.aiStudioTitle")}</p>
                  <p className="text-white/70 text-[10px] mt-0.5">{t("home.aiStudioDesc")}</p>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Desktop Daily Check-in */}
        {session?.user && <DailyCheckIn />}

        {/* Desktop Continue Watching */}
        {session?.user && <ContinueWatching />}

      {/* ===== Hot Picks (series with episodes) - Desktop only ===== */}
      {hotPicks.length > 0 && (
        <div className="mt-6 mb-2">
          <div className="flex items-center justify-between mb-3 px-4 md:px-6">
            <h2 className="text-base font-bold flex items-center gap-1.5">
              <span className="text-primary">🔥</span> {t("home.hotPicks")}
            </h2>
            <Link href="/discover" className="text-[11px] text-muted-foreground hover:text-primary transition-colors font-medium">
              {t("home.seeAll")} →
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 px-4 md:px-6">
            {hotPicks.slice(0, 9).map((series, index) => (
              <Link key={series.id} href={`/series/${series.id}`}>
                <div className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-muted hover:shadow-lg transition-all duration-300 hover:scale-[1.03]">
                  {(series.coverTall || series.coverUrl) ? (
                    <Image
                      src={series.coverTall || series.coverUrl!}
                      alt={series.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)} flex items-center justify-center`}>
                      <Play className="w-6 h-6 text-white/40" />
                    </div>
                  )}
                  {/* Rank badge top-left */}
                  <div className="absolute top-1.5 left-1.5">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                      index < 3 ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow" : "bg-black/50 text-white/80 backdrop-blur-sm"
                    }`}>
                      {index + 1}
                    </div>
                  </div>
                  {/* Title overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-2 pt-6 pb-2">
                    <h3 className="text-white font-semibold text-[9px] leading-tight line-clamp-2">{series.title}</h3>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===== Card Collection Showcase ===== */}
      {featuredCards.length > 0 && (
        <div className="mt-6 mb-6">
          <div className="flex items-center justify-between mb-3 px-4 md:px-6">
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <span>🃏</span> {t("home.collectCards")}
            </h2>
            <Link href="/cards" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              {t("home.viewAllCards")} &rarr;
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pl-4 md:pl-6 pr-4 pb-2 no-scrollbar">
            {featuredCards.map((card) => {
              const rarityColors: Record<string, string> = {
                common: "from-gray-400 to-gray-500",
                rare: "from-blue-400 to-blue-600",
                epic: "from-purple-400 to-purple-600",
                legendary: "from-amber-400 to-orange-500",
              }
              return (
                <Link key={card.id} href="/cards" className="shrink-0 w-28">
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-muted group hover:shadow-lg transition-all">
                    <Image
                      src={card.imageUrl}
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="112px"
                    />
                    <div className="absolute top-1.5 right-1.5">
                      <Badge className={`text-[8px] px-1 py-0 text-white border-none bg-gradient-to-r ${rarityColors[card.rarity] || rarityColors.common}`}>
                        {card.rarity.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1.5">
                      <p className="text-white font-semibold text-[10px] leading-tight line-clamp-1">{card.name}</p>
                      <p className="text-white/50 text-[8px] line-clamp-1">{card.series.title}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== New Arrivals (horizontal scroll) ===== */}
      {newArrivals.length > 0 && (
        <div className="mt-6 mb-6">
          <div className="flex items-center justify-between mb-3 px-4 md:px-6">
            <h2 className="text-lg md:text-xl font-bold">{t("home.newArrivals")}</h2>
            <Link href="/discover?tab=latest" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              {t("home.seeAll")} &rarr;
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pl-4 md:pl-6 pr-4 pb-2 no-scrollbar">
            {newArrivals.map((series) => (
              <Link key={series.id} href={`/series/${series.id}`} className="shrink-0 w-32">
                <div className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-muted
                                hover:shadow-lg transition-all duration-300">
                  {(series.coverTall || series.coverUrl) ? (
                    <Image
                      src={series.coverTall || series.coverUrl!}
                      alt={series.title}
                      fill
                      className="object-cover"
                      sizes="128px"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)} flex items-center justify-center`}>
                      <Play className="w-6 h-6 text-white/40" />
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5">
                    <Badge className="text-[9px] px-1 py-0 bg-green-500 text-white border-none">
                      {t("home.new")}
                    </Badge>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-2">
                    <h3 className="text-white font-semibold text-[10px] leading-tight line-clamp-2">{series.title}</h3>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===== Coming Soon (series without episodes) ===== */}
      {comingSoon.length > 0 && (
        <div className="mt-4 mb-6">
          <div className="flex items-center justify-between mb-3 px-4 md:px-6">
            <h2 className="text-lg md:text-xl font-bold">{t("home.comingSoon")}</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pl-4 md:pl-6 pr-4 pb-2 no-scrollbar">
            {comingSoon.map((series) => (
              <Link key={series.id} href={`/series/${series.id}`} className="shrink-0 w-32">
                <div className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-muted opacity-80
                                hover:opacity-100 transition-all duration-300">
                  {(series.coverTall || series.coverUrl) ? (
                    <Image
                      src={series.coverTall || series.coverUrl!}
                      alt={series.title}
                      fill
                      className="object-cover"
                      sizes="128px"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)} flex items-center justify-center`}>
                      <Sparkles className="w-6 h-6 text-white/30" />
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5">
                    <Badge className="text-[9px] px-1 py-0 bg-amber-500 text-white border-none">
                      {t("home.comingSoonBadge")}
                    </Badge>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-2">
                    <h3 className="text-white font-semibold text-[10px] leading-tight line-clamp-2">{series.title}</h3>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===== Empty state if no series at all ===== */}
      {seriesWithCount.length === 0 && (
        <div className="px-4 md:px-6 mt-8 mb-6">
          <div className="text-center py-16 text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("home.noSeries")}</p>
          </div>
        </div>
      )}

      {/* ===== Dev Tools Banner ===== */}
      {session?.user && (
        <div className="px-4 md:px-6 mt-6">
          <Link href="/developer">
            <div className="relative bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-4 overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-slate-500/10 transition-shadow group">
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                    <Code className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white/70 font-medium text-xs">{t("home.devToolsTitle")}</h3>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300/60 font-medium uppercase tracking-wider">Desktop</span>
                    </div>
                    <p className="text-white/30 text-[11px]">{t("home.devToolsDesc")}</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ===== Footer ===== */}
      <div className="px-4 md:px-6 pb-24 md:pb-12 pt-6">
        <div className="border-t pt-6 text-center space-y-2">
          <p className="text-[11px] text-muted-foreground/50 tracking-wider uppercase">
            {t("home.lerfilmSlogan")}
          </p>
          <p className="text-[10px] text-muted-foreground/30">
            {t("home.lerfilmCopyright")}
          </p>
        </div>
      </div>

      </div>{/* End desktop-only wrapper */}
    </div>
  )
}
