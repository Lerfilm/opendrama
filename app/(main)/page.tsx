export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Coins, PenTool, Video, TheaterIcon, Sparkles, Zap, Crown } from "@/components/icons"
import Link from "next/link"
import Image from "next/image"
import { t } from "@/lib/i18n"

export default async function HomePage() {
  const session = await auth()

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
      {/* ===== Hero 区域 ===== */}
      <div className="hero-gradient relative overflow-hidden -mx-0 -mt-0 rounded-b-3xl">
        {/* 星点粒子 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="star-dot"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                ["--duration" as string]: `${2 + Math.random() * 4}s`,
                ["--delay" as string]: `${Math.random() * 3}s`,
                width: `${1 + Math.random() * 2}px`,
                height: `${1 + Math.random() * 2}px`,
              }}
            />
          ))}
        </div>

        {/* 装饰光晕 */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-violet-500/12 rounded-full blur-3xl" />
        <div className="absolute top-0 left-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 px-6 pt-12 pb-10 text-center">
          {/* 用户状态栏 */}
          <div className="flex items-center justify-between mb-8">
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
                  <span className="text-white text-sm font-semibold">{(session.user as any)?.coins || 0}</span>
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

          {/* 核心 Slogan */}
          <div className="animate-fade-up">
            <h1 className="gradient-text text-3xl sm:text-4xl font-black tracking-tight leading-tight mb-3">
              {t("home.slogan")}
            </h1>
            <p className="text-white/60 text-sm sm:text-base mb-6 max-w-xs mx-auto">
              {t("home.sloganSub")}
            </p>
          </div>

          {/* CTA 按钮 */}
          <div className="animate-fade-up-delay-1 flex items-center justify-center gap-3 mb-6">
            <Link href="/discover">
              <Button className="rounded-full bg-white text-black hover:bg-white/90 px-6 font-semibold">
                <Play className="w-4 h-4 mr-1.5" />
                {t("home.exploreNow")}
              </Button>
            </Link>
            <Link href="/studio">
              <Button variant="outline" className="rounded-full border-white/30 text-white hover:bg-white/10 px-6">
                <Sparkles className="w-4 h-4 mr-1.5" />
                {t("home.startCreate")}
              </Button>
            </Link>
          </div>

          {/* Lerfilm 品牌条 */}
          <div className="animate-fade-up-delay-2">
            <p className="text-white/30 text-[10px] tracking-[0.2em] uppercase font-light">
              {t("home.lerfilmProduction")}
            </p>
          </div>
        </div>
      </div>

      {/* ===== AI 玩法分流 ===== */}
      <div className="px-4 -mt-6 relative z-20">
        <div className="grid grid-cols-3 gap-3">
          {/* AI 编剧 */}
          <Link href="/studio">
            <div className="ai-card bg-card rounded-2xl p-4 text-center shadow-lg border animate-fade-up-delay-1">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <PenTool className="w-5 h-5 text-indigo-500" />
              </div>
              <h3 className="text-xs font-bold mb-0.5 line-clamp-1">{t("home.aiStudioTitle")}</h3>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{t("home.aiStudioDesc")}</p>
            </div>
          </Link>

          {/* 文生视频 */}
          <Link href="/studio/text-to-video">
            <div className="ai-card bg-card rounded-2xl p-4 text-center shadow-lg border animate-fade-up-delay-2">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-violet-500" />
              </div>
              <h3 className="text-xs font-bold mb-0.5 line-clamp-1">{t("home.aiT2VTitle")}</h3>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{t("home.aiT2VDesc")}</p>
            </div>
          </Link>

          {/* AI 剧场 */}
          <Link href="/theater">
            <div className="ai-card bg-card rounded-2xl p-4 text-center shadow-lg border animate-fade-up-delay-3">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <TheaterIcon className="w-5 h-5 text-rose-500" />
              </div>
              <h3 className="text-xs font-bold mb-0.5 line-clamp-1">{t("home.aiTheaterTitle")}</h3>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{t("home.aiTheaterDesc")}</p>
            </div>
          </Link>
        </div>
      </div>

      {/* ===== 充值横幅 ===== */}
      <div className="px-4 mt-6">
        <Link href="/recharge">
          <div className="relative bg-gradient-to-r from-indigo-600 to-violet-500 rounded-2xl p-5 overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full translate-y-4 -translate-x-4" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-base mb-1">{t("home.recharge")}</h3>
                <p className="text-white/70 text-xs">{t("home.rechargeDesc")}</p>
              </div>
              <Button variant="secondary" size="sm" className="rounded-full text-xs shrink-0">
                {t("home.rechargeNow")}
              </Button>
            </div>
          </div>
        </Link>
      </div>

      {/* ===== 热门推荐 ===== */}
      <div className="px-4 mt-8 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t("home.hotPicks")}</h2>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {seriesWithCount.map((series) => (
              <Link key={series.id} href={`/series/${series.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <CardHeader className="p-0">
                    <div className="relative aspect-[2/3] bg-muted">
                      {series.coverUrl ? (
                        <Image
                          src={series.coverUrl}
                          alt={series.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-gradient-to-br from-indigo-100 to-violet-50">
                          <Play className="w-8 h-8 opacity-30" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-black/50 text-white border-none backdrop-blur">
                          {series.status === "active" ? t("common.ongoing") : t("common.completed")}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-1 mb-0.5">
                      {series.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {t("home.episodeCount", { count: series.episodeCount })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ===== 底部品牌 Footer ===== */}
      <div className="px-4 pb-24 pt-6">
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
