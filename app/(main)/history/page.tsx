export const dynamic = "force-dynamic"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play } from "@/components/icons"
import Link from "next/link"
import { t } from "@/lib/i18n"

export default async function WatchHistoryPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/auth/signin")
  }

  // 获取用户最近的观看记录，按最近观看时间排序
  const watchEvents = await prisma.watchEvent.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      episodeId: true,
      watchPosition: true,
      watchDuration: true,
      completedRate: true,
      createdAt: true,
      episode: {
        select: {
          id: true,
          title: true,
          episodeNum: true,
          thumbnailUrl: true,
          duration: true,
          series: {
            select: {
              id: true,
              title: true,
              coverUrl: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  // 按剧集去重，保留最近的记录
  const seen = new Set<string>()
  const uniqueHistory = watchEvents.filter((event) => {
    if (seen.has(event.episodeId)) return false
    seen.add(event.episodeId)
    return true
  })

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/profile">
          <Button variant="ghost" size="sm">
            ← {t("common.back")}
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{t("history.title")}</h1>
      </div>

      {uniqueHistory.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">{t("history.noHistory")}</p>
          <p className="text-sm mb-4">{t("history.noHistoryHint")}</p>
          <Link href="/discover">
            <Button>{t("history.goDiscover")}</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {uniqueHistory.map((event) => {
            const progress = event.episode.duration
              ? Math.min(100, Math.round((event.watchPosition / event.episode.duration) * 100))
              : Math.round(event.completedRate * 100)

            return (
              <Link key={event.id} href={`/episode/${event.episodeId}`}>
                <Card className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    <div className="flex gap-3">
                      {/* 缩略图 */}
                      <div className="relative w-28 aspect-[16/9] bg-muted shrink-0">
                        {(event.episode.thumbnailUrl || event.episode.series.coverUrl) ? (
                          <img
                            src={event.episode.thumbnailUrl || event.episode.series.coverUrl || ""}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        {/* 进度条 */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 py-2 pr-3">
                        <h3 className="font-medium text-sm line-clamp-1">
                          {event.episode.series.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t("series.episode", { num: event.episode.episodeNum })} · {event.episode.title}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground">
                            {t("history.progress", { percent: progress })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimeAgo(event.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString()
}
