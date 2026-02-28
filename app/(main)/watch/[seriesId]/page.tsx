export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { SwipePlayer } from "@/components/swipe-player"

const FREE_EPISODE_COUNT = parseInt(process.env.FREE_EPISODE_COUNT || "5", 10)

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ seriesId: string }>
  searchParams: Promise<{ ep?: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { seriesId } = await params
  const { ep } = await searchParams
  const initialEp = ep ? parseInt(ep, 10) : 1

  // Fetch series with episodes
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      title: true,
      episodes: {
        where: { status: "active" },
        select: {
          id: true,
          title: true,
          episodeNum: true,
          muxPlaybackId: true,
          unlockCost: true,
        },
        orderBy: { episodeNum: "asc" },
      },
    },
  })

  if (!series || series.episodes.length === 0) {
    redirect("/discover")
  }

  // Fetch user's unlock records for this series
  const unlocks = await prisma.episodeUnlock.findMany({
    where: {
      userId: session.user.id,
      episodeId: { in: series.episodes.map((e) => e.id) },
    },
    select: { episodeId: true },
  })
  const unlockedSet = new Set(unlocks.map((u) => u.episodeId))

  // Fetch user coin balance
  const userBalance = await prisma.userBalance.findUnique({
    where: { userId: session.user.id },
    select: { balance: true, reserved: true },
  })
  const availableCoins = userBalance
    ? userBalance.balance - userBalance.reserved
    : 0

  // Build episode list with unlock status
  const episodes = series.episodes.map((ep) => ({
    id: ep.id,
    title: ep.title,
    episodeNum: ep.episodeNum,
    muxPlaybackId: ep.muxPlaybackId,
    unlockCost: ep.unlockCost,
    isUnlocked: unlockedSet.has(ep.id),
    isFree: ep.episodeNum <= FREE_EPISODE_COUNT,
  }))

  return (
    <SwipePlayer
      seriesId={series.id}
      seriesTitle={series.title}
      episodes={episodes}
      userId={session.user.id}
      initialEpisodeNum={initialEp}
      userCoins={availableCoins}
    />
  )
}
