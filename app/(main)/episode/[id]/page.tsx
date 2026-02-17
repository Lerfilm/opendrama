import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { VideoPlayer } from "@/components/video-player"
import { UnlockButton } from "@/components/unlock-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Lock } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

type Props = {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const episode = await prisma.episode.findUnique({
    where: { id: params.id },
    select: { title: true, description: true, episodeNum: true, series: { select: { title: true, coverUrl: true } } },
  })

  if (!episode) return { title: "剧集不存在" }

  const title = `${episode.series.title} 第${episode.episodeNum}集 - ${episode.title}`
  const description = episode.description || `观看 ${episode.series.title} 第${episode.episodeNum}集`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: episode.series.coverUrl ? [{ url: episode.series.coverUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: episode.series.coverUrl ? [episode.series.coverUrl] : [],
    },
  }
}

export default async function EpisodePage({ params }: Props) {
  const session = await auth()

  if (!session) {
    redirect("/auth/signin")
  }

  const episode = await prisma.episode.findUnique({
    where: { id: params.id },
    include: {
      series: {
        select: { id: true, title: true },
      },
    },
  })

  if (!episode) {
    notFound()
  }

  // 检查是否已解锁
  const unlock = await prisma.episodeUnlock.findUnique({
    where: {
      userId_episodeId: {
        userId: session.user.id,
        episodeId: episode.id,
      },
    },
  })

  const isFirst = episode.episodeNum === 1
  const isUnlocked = !!unlock || isFirst

  // 获取用户当前金币
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { coins: true },
  })

  return (
    <div className="min-h-screen bg-black">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between p-4 max-w-screen-sm mx-auto">
          <Link href={`/series/${episode.seriesId}`}>
            <Button variant="ghost" size="sm" className="text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="text-white text-sm font-medium">
            第 {episode.episodeNum} 集
          </div>
          <div className="w-8" />
        </div>
      </div>

      {/* 视频播放器或解锁界面 */}
      {isUnlocked && episode.muxPlaybackId ? (
        <VideoPlayer
          playbackId={episode.muxPlaybackId}
          episodeId={episode.id}
          userId={session.user.id}
          title={episode.title}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {episode.title}
            </h2>
            <p className="text-muted-foreground mb-4">
              {episode.series.title} · 第 {episode.episodeNum} 集
            </p>
            {episode.description && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                {episode.description}
              </p>
            )}
          </div>

          <div className="bg-card/50 backdrop-blur rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">解锁观看</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-base px-3 py-1">
                  {episode.unlockCost} 金币
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm text-muted-foreground">当前余额</span>
              <span className="font-semibold">{user?.coins || 0} 金币</span>
            </div>

            {(user?.coins || 0) >= episode.unlockCost ? (
              <UnlockButton
                episodeId={episode.id}
                cost={episode.unlockCost}
                seriesId={episode.seriesId}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-amber-500 text-center">
                  金币不足，请先充值
                </p>
                <Link href="/recharge">
                  <Button className="w-full" size="lg">
                    立即充值
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
