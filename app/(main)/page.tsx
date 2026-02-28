export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Coins, PenTool, Film, Sparkles, Compass, Code } from "@/components/icons"
import Link from "next/link"
import Image from "next/image"
import { createT, getLocaleAsync } from "@/lib/i18n"
import ContinueWatching from "@/components/continue-watching"
import { StarParticles } from "@/components/star-particles"
import { getGenreGradient } from "@/lib/genre-colors"
import { resolveImageUrl } from "@/lib/storage"
import HeroCarousel from "@/components/hero-carousel"
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
      coverUrl: true,
      coverTall: true,
      coverWide: true,
      genre: true,
      status: true,
      createdAt: true,
      episodes: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  const seriesWithCount = seriesList.map((s) => ({
    ...s,
    episodeCount: s.episodes.length,
  }))

  // Split into Hot Picks (has episodes) and Coming Soon (no episodes)
  const hotPicks = seriesWithCount.filter((s) => s.episodeCount > 0)
  const comingSoon = seriesWithCount.filter((s) => s.episodeCount === 0)

  // Featured series for hero carousel (has cover + episodes)
  const featured = seriesWithCount.filter(
    (s) => s.episodeCount > 0 && (s.coverTall || s.coverUrl || s.coverWide || s.genre)
  ).slice(0, 5).map((s) => ({
    id: s.id,
    title: s.title,
    coverWide: resolveImageUrl(s.coverWide || s.coverUrl),
    coverUrl: resolveImageUrl(s.coverUrl),
    genre: s.genre,
    episodeCount: s.episodeCount,
  }))

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
    <div className="min-h-screen">
      {/* ===== Hero ===== */}
      <div className="hero-gradient relative overflow-hidden rounded-b-3xl md:rounded-b-[2.5rem]">
        <StarParticles count={30} />

        {/* Decorative glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 md:w-96 md:h-96 bg-orange-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/12 rounded-full blur-3xl" />
        <div className="absolute top-0 left-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 px-6 pt-12 pb-10 md:pt-16 md:pb-14 text-center">
          {/* User status bar — mobile only (desktop has TopNav) */}
          <div className="flex items-center justify-between mb-8 md:hidden">
            <div className="text-left">
              <h2 className="text-white/90 text-sm font-medium">OpenDrama</h2>
              <p className="text-white/50 text-xs">
                {session?.user
                  ? t("home.greeting", { name: session.user?.name || "" })
                  : t("home.welcomeGuest")}
              </p>
            </div>
            {session?.user ? (
              <Link href="/recharge">
                <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur rounded-full px-3 py-1.5">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  <span className="text-white text-sm font-semibold">{availableCoins}</span>
                </div>
              </Link>
            ) : (
              <Link href="/auth/signin">
                <Button size="sm" variant="secondary" className="rounded-full text-xs px-4">
                  {t("common.login")}
                </Button>
              </Link>
            )}
          </div>

          {/* Slogan */}
          <div className="animate-fade-up">
            <h1 className="gradient-text text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-3 md:mb-4">
              {t("home.slogan")}
            </h1>
            <p className="text-white/60 text-sm sm:text-base md:text-lg mb-6 md:mb-8 max-w-xs md:max-w-md mx-auto">
              {t("home.sloganSub")}
            </p>
          </div>

          {/* CTA buttons */}
          <div className="animate-fade-up-delay-1 flex items-center justify-center gap-3 md:gap-4 mb-4">
            <Link href="/discover">
              <Button className="rounded-full bg-white text-black hover:bg-white/90 px-6 md:px-8 md:h-11 font-semibold md:text-base">
                <Play className="w-4 h-4 mr-1.5" />
                {t("home.exploreNow")}
              </Button>
            </Link>
            <Link href="/studio">
              <Button variant="outline" className="rounded-full border-white/60 text-white bg-white/10 hover:bg-white/20 px-6 md:px-8 md:h-11 font-semibold md:text-base">
                <Sparkles className="w-4 h-4 mr-1.5" />
                {t("home.startCreate")}
              </Button>
            </Link>
          </div>

          {/* Lerfilm brand */}
          <div className="animate-fade-up-delay-2">
            <p className="text-white/25 text-[10px] tracking-[0.2em] uppercase font-light">
              {t("home.lerfilmProduction")}
            </p>
          </div>
        </div>
      </div>

      {/* ===== Featured Series Carousel ===== */}
      {featured.length > 0 && (
        <div className="px-4 md:px-6 -mt-4 relative z-20 mb-4">
          <HeroCarousel items={featured} />
        </div>
      )}

      {/* ===== Feature Cards ===== */}
      <div className={`px-4 md:px-6 ${featured.length > 0 ? "" : "-mt-6"} relative z-20`}>
        <div className="grid grid-cols-3 gap-2.5 md:gap-4">
          {[
            { href: "/studio", icon: PenTool, color: "amber", title: t("home.aiStudioTitle"), desc: t("home.aiStudioDesc") },
            { href: "/generate", icon: Film, color: "orange", title: t("home.theaterTitle"), desc: t("home.theaterDesc") },
            { href: "/discover", icon: Compass, color: "rose", title: t("home.discoverTitle"), desc: t("home.discoverDesc") },
          ].map(({ href, icon: Icon, color, title, desc }) => (
            <Link key={href} href={href}>
              <div className="ai-card rounded-2xl p-3 md:p-5 text-center shadow-lg border backdrop-blur-sm bg-card/90 hover:bg-card transition-all">
                <div className={`w-9 h-9 md:w-11 md:h-11 mx-auto mb-2 rounded-xl flex items-center justify-center ${
                  color === "amber" ? "bg-amber-500/10" : color === "orange" ? "bg-orange-500/10" : "bg-rose-500/10"
                }`}>
                  <Icon className={`w-4 h-4 md:w-5 md:h-5 ${
                    color === "amber" ? "text-amber-600" : color === "orange" ? "text-orange-500" : "text-rose-500"
                  }`} />
                </div>
                <h3 className="text-[11px] md:text-sm font-bold mb-0.5 line-clamp-1">{title}</h3>
                <p className="text-[9px] md:text-[11px] text-muted-foreground line-clamp-2 leading-tight hidden sm:block">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ===== Top Up Banner ===== */}
      <div className="px-4 md:px-6 mt-6">
        <Link href="/recharge">
          <div className="relative bg-gradient-to-r from-orange-600 to-amber-500 rounded-2xl p-5 md:p-6 overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-orange-500/10 transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full translate-y-4 -translate-x-4" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-base mb-1">{t("home.recharge")}</h3>
                <p className="text-white/70 text-xs md:text-sm">{t("home.rechargeDesc")}</p>
              </div>
              <Button variant="secondary" size="sm" className="rounded-full text-xs shrink-0">
                {t("home.rechargeNow")}
              </Button>
            </div>
          </div>
        </Link>
      </div>

      {/* ===== Daily Check-in (logged in users) ===== */}
      {session?.user && <DailyCheckIn />}

      {/* ===== Continue Watching ===== */}
      {session?.user && <ContinueWatching />}

      {/* ===== Hot Picks (series with episodes) ===== */}
      {hotPicks.length > 0 && (
        <div className="px-4 md:px-6 mt-8 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg md:text-xl font-bold">{t("home.hotPicks")}</h2>
            <Link href="/discover" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              {t("home.exploreNow")} &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {hotPicks.map((series) => (
              <Link key={series.id} href={`/series/${series.id}`}>
                <div className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-muted
                                hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:scale-[1.02]">
                  {(series.coverTall || series.coverUrl) ? (
                    <Image
                      src={series.coverTall || series.coverUrl!}
                      alt={series.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${getGenreGradient(series.genre)} flex flex-col items-center justify-center gap-2 px-3`}>
                      <Play className="w-8 h-8 text-white/40" />
                      <span className="text-white/50 text-xs text-center font-medium line-clamp-2">{series.title}</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge className="text-[10px] px-1.5 py-0.5 bg-black/50 text-white border-none backdrop-blur-sm">
                      {series.status === "active" ? t("common.ongoing") : t("common.completed")}
                    </Badge>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0
                                  bg-gradient-to-t from-black/80 via-black/40 to-transparent
                                  px-3 pt-10 pb-3">
                    <h3 className="text-white font-bold text-xs md:text-sm leading-tight line-clamp-2 mb-0.5">
                      {series.title}
                    </h3>
                    <p className="text-white/60 text-[10px] md:text-xs">
                      {t("home.episodeCount", { count: series.episodeCount })}
                    </p>
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

      {/* ===== Dev Tools Banner (Desktop only) ===== */}
      {session?.user && (
        <div className="hidden md:block px-4 md:px-6 mt-6">
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
    </div>
  )
}
