export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Coins, PenTool, Film, Sparkles, Compass } from "@/components/icons"
import Link from "next/link"
import Image from "next/image"
import { t } from "@/lib/i18n"
import ContinueWatching from "@/components/continue-watching"
import { StarParticles } from "@/components/star-particles"

export default async function HomePage() {
  const session = await auth()

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
      status: true,
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

  return (
    <div className="min-h-screen">
      {/* ===== Hero ===== */}
      <div className="hero-gradient relative overflow-hidden rounded-b-3xl md:rounded-b-[2.5rem]">
        <StarParticles count={30} />

        {/* Decorative glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 md:w-96 md:h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-violet-500/12 rounded-full blur-3xl" />
        <div className="absolute top-0 left-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl" />

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

      {/* ===== Feature Cards ===== */}
      <div className="px-4 md:px-6 -mt-6 relative z-20">
        <div className="grid grid-cols-3 gap-2.5 md:gap-4">
          {[
            { href: "/studio", icon: PenTool, color: "indigo", title: t("home.aiStudioTitle"), desc: t("home.aiStudioDesc") },
            { href: "/generate", icon: Film, color: "violet", title: t("home.theaterTitle"), desc: t("home.theaterDesc") },
            { href: "/discover", icon: Compass, color: "rose", title: t("home.discoverTitle"), desc: t("home.discoverDesc") },
          ].map(({ href, icon: Icon, color, title, desc }) => (
            <Link key={href} href={href}>
              <div className="ai-card rounded-2xl p-3 md:p-5 text-center shadow-lg border backdrop-blur-sm bg-card/90 hover:bg-card transition-all">
                <div className={`w-9 h-9 md:w-11 md:h-11 mx-auto mb-2 rounded-xl flex items-center justify-center ${
                  color === "indigo" ? "bg-indigo-500/10" : color === "violet" ? "bg-violet-500/10" : "bg-rose-500/10"
                }`}>
                  <Icon className={`w-4 h-4 md:w-5 md:h-5 ${
                    color === "indigo" ? "text-indigo-500" : color === "violet" ? "text-violet-500" : "text-rose-500"
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
          <div className="relative bg-gradient-to-r from-indigo-600 to-violet-500 rounded-2xl p-5 md:p-6 overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-indigo-500/10 transition-shadow">
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

      {/* ===== Continue Watching ===== */}
      {session?.user && <ContinueWatching />}

      {/* ===== Hot Picks ===== */}
      <div className="px-4 md:px-6 mt-8 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-bold">{t("home.hotPicks")}</h2>
          <Link href="/discover" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            {t("home.exploreNow")} &rarr;
          </Link>
        </div>

        {seriesWithCount.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("home.noSeries")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {seriesWithCount.map((series) => (
              <Link key={series.id} href={`/series/${series.id}`}>
                <div className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-muted
                                hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:scale-[1.02]">
                  {series.coverUrl ? (
                    <Image
                      src={series.coverUrl}
                      alt={series.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center">
                      <Play className="w-8 h-8 text-white/30" />
                    </div>
                  )}
                  {/* Status badge */}
                  <div className="absolute top-2 right-2">
                    <Badge className="text-[10px] px-1.5 py-0.5 bg-black/50 text-white border-none backdrop-blur-sm">
                      {series.status === "active" ? t("common.ongoing") : t("common.completed")}
                    </Badge>
                  </div>
                  {/* Bottom gradient + title */}
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
        )}
      </div>

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
