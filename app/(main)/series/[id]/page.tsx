import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Coins } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"

type Props = {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const series = await prisma.series.findUnique({
    where: { id: params.id },
    select: { title: true, description: true, coverUrl: true },
  })

  if (!series) return { title: "剧集不存在" }

  return {
    title: series.title,
    description: series.description || `在 DramaBox 观看 ${series.title}`,
    openGraph: {
      title: series.title,
      description: series.description || `在 DramaBox 观看 ${series.title}`,
      images: series.coverUrl ? [{ url: series.coverUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: series.title,
      description: series.description || `在 DramaBox 观看 ${series.title}`,
      images: series.coverUrl ? [series.coverUrl] : [],
    },
  }
}

export default async function SeriesDetailPage({ params }: Props) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const series = await prisma.series.findUnique({
    where: { id: params.id },
    include: {
      episodes: {
        orderBy: { episodeNum: "asc" },
        select: {
          id: true,
          title: true,
          episodeNum: true,
          duration: true,
          unlockCost: true,
        },
      },
    },
  })

  if (!series) {
    notFound()
  }

  // 获取用户已解锁的剧集 ID 列表
  const unlockedEpisodeIds = await prisma.episodeUnlock
    .findMany({
      where: { userId: session.user.id },
      select: { episodeId: true },
    })
    .then((unlocks) => unlocks.map((u) => u.episodeId))

  return (
    <div className="pb-4">
      {/* 封面头部 */}
      <div className="relative h-64 bg-gradient-to-b from-black/60 to-background">
        {series.coverUrl && (
          <Image
            src={series.coverUrl}
            alt={series.title}
            fill
            className="object-cover -z-10"
            priority
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background to-transparent">
          <h1 className="text-2xl font-bold mb-2">{series.title}</h1>
          {series.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {series.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Badge>{series.episodes.length} 集</Badge>
            <Badge variant="outline">{series.status === "active" ? "连载中" : "已完结"}</Badge>
          </div>
        </div>
      </div>

      {/* 剧集列表 */}
      <div className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">剧集列表</h2>
        <div className="space-y-2">
          {series.episodes.map((episode) => {
            const isUnlocked = unlockedEpisodeIds.includes(episode.id)
            const isFirst = episode.episodeNum === 1

            return (
              <Link
                key={episode.id}
                href={`/episode/${episode.id}`}
                className="block"
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">
                            第 {episode.episodeNum} 集
                          </span>
                          {isFirst && (
                            <Badge variant="secondary" className="text-xs">
                              免费
                            </Badge>
                          )}
                          {isUnlocked && !isFirst && (
                            <Badge variant="secondary" className="text-xs">
                              已解锁
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-medium text-sm mb-1">
                          {episode.title}
                        </h3>
                        {episode.duration && (
                          <p className="text-xs text-muted-foreground">
                            {Math.floor(episode.duration / 60)} 分钟
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isFirst || isUnlocked ? (
                          <Button size="sm" variant="default">
                            <Play className="w-4 h-4 mr-1" />
                            播放
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline">
                            <Coins className="w-4 h-4 mr-1" />
                            {episode.unlockCost} 金币
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
